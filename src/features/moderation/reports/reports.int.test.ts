import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../../tests/helpers/db";
import { asAppRw } from "../../../../tests/helpers/app-rw";
import { categoryIds, insertUser } from "../../../../tests/helpers/users";

/**
 * Reports against the real schema, run as the app's role (`set local role app_rw`): filing with
 * its SQL re-checks and the `reports_no_duplicates` constraint, the daily limit, resolving (open
 * -> actioned/dismissed, logged per target), who may do what, and the queue and log reads.
 */
vi.mock("@/lib/db", async (orig) => asAppRw(await orig()));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  refresh: vi.fn(),
  updateTag: vi.fn(),
}));
// the session is mocked (application.md 13.3): getCurrentUser() loads whoever `as()` names
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/features/auth/session", async () => {
  const { loadCurrentUser } = await import("@/features/auth/queries");
  return {
    getCurrentUser: async () => (session.userId ? loadCurrentUser(session.userId) : null),
  };
});

process.env.DATABASE_URL = testDatabaseUrl();
const { refresh } = await import("next/cache");
const { getPool } = await import("@/lib/db");
const a = await import("./actions");
const q = await import("./queries");
const m = await import("./mutations");

let db: pg.Client;
let cats: Record<string, string>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = testClient();
  await db.connect();
  cats = await categoryIds(db);
});
afterAll(async () => {
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  vi.clearAllMocks();
  await truncateApp(db);
  ids.owner = await insertUser(db, "owner", { roles: ["admin"] });
  ids.su = await insertUser(db, "sue", { roles: ["superuser"] });
  ids.mod = await insertUser(db, "moe", { roles: ["moderator"] });
  ids.ada = await insertUser(db, "Ada", { age: "10 days" });
  ids.bob = await insertUser(db, "bob", { age: "10 days" });
  ids.newbie = await insertUser(db, "newbie");
  ids.pending = await insertUser(db, "pending", { onboarded: false });
  ids.banned = await insertUser(db, "banned", { age: "10 days" });
  await db.query("insert into app.user_bans (user_id, reason) values ($1, 'x')", [ids.banned]);
});

const as = (who: string | null) => {
  session.userId = who ? ids[who]! : null;
};

async function thread(author = ids.bob, slug = "off-topic", title = "A thread"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     values ($1, $2, $3, 'Opening **post** body.') returning id::text as id`,
    [cats[slug], author, title],
  );
  return rows[0]!.id;
}

async function reply(threadId: string, author = ids.bob, body = "A reply."): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md) values ($1, $2, $3)
     returning id::text as id`,
    [threadId, author, body],
  );
  return rows[0]!.id;
}

const reports = () =>
  db
    .query<{
      id: string;
      reporter: string | null;
      thread_id: string | null;
      reply_id: string | null;
      profile_id: string | null;
      reason: string;
      status: string;
      resolved_by: string | null;
      resolved: boolean;
    }>(
      `select r.id::text, p.handle::text as reporter, r.thread_id::text, r.reply_id::text,
              r.profile_id::text, r.reason, r.status::text, r.resolved_by::text,
              r.resolved_at is not null as resolved
         from app.reports r left join app.profiles p on p.id = r.reporter_id order by r.id`,
    )
    .then((r) => r.rows);

const log = () =>
  db
    .query<{
      action: string;
      actor_id: string;
      thread_id: string | null;
      reply_id: string | null;
      profile_id: string | null;
      note: string | null;
    }>(
      `select action, actor_id::text, thread_id::text, reply_id::text, profile_id::text, note
         from app.moderation_log order by id`,
    )
    .then((r) => r.rows);

// widened so tests can read `.error` without narrowing first
type Answer = { ok: boolean; error?: string; message?: string; already?: boolean };
const report = (target: unknown, reason = "spam", details?: string): Promise<Answer> =>
  a.reportContent({ target, reason, details });

describe("reportContent()", () => {
  it("files a report on a thread, a reply and a profile", async () => {
    const t = await thread();
    const r = await reply(t);
    as("ada");
    expect(await report({ kind: "thread", id: t })).toEqual({
      ok: true,
      message: "Report sent. Thank you.",
    });
    expect((await report({ kind: "reply", id: r }, "abuse", "  Rude\r\nreply  ")).ok).toBe(true);
    // handles match in any letter case
    expect((await report({ kind: "profile", handle: "BOB" }, "other", "Impersonation")).ok).toBe(
      true,
    );
    expect(await reports()).toMatchObject([
      {
        reporter: "Ada",
        thread_id: t,
        reply_id: null,
        profile_id: null,
        reason: "Spam or advertising",
        status: "open",
      },
      { thread_id: null, reply_id: r, reason: "Harassment or abuse: Rude\nreply" },
      { profile_id: ids.bob, reason: "Something else: Impersonation" },
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers 'already reported' while this member's report is open; others may report too", async () => {
    const t = await thread();
    as("ada");
    expect((await report({ kind: "thread", id: t })).ok).toBe(true);
    expect(await report({ kind: "thread", id: t }, "abuse")).toEqual({
      ok: false,
      error: "You already reported this. Staff will review it.",
      already: true,
    });
    as("newbie");
    expect((await report({ kind: "thread", id: t })).ok).toBe(true);
    const rows = await reports();
    expect(rows.map((r) => [r.reporter, r.reason])).toEqual([
      ["Ada", "Spam or advertising"],
      ["newbie", "Spam or advertising"],
    ]);
  });

  it("reopens a resolved report when the same member reports the target again", async () => {
    const t = await thread();
    as("ada");
    await report({ kind: "thread", id: t });
    const [first] = await reports();
    await m.resolveReports({ ids: [first!.id], status: "dismissed", actorId: ids.su! });
    expect((await reports())[0]).toMatchObject({ status: "dismissed", resolved: true });

    expect((await report({ kind: "thread", id: t }, "abuse")).ok).toBe(true);
    expect(await reports()).toMatchObject([
      {
        id: first!.id,
        status: "open",
        reason: "Harassment or abuse",
        resolved_by: null,
        resolved: false,
      },
    ]);
  });

  it("refuses your own posts and profile, and hidden or missing targets", async () => {
    const own = await thread(ids.ada);
    const ownReply = await reply(own, ids.ada);
    const hidden = await thread();
    await db.query("update app.threads set hidden_at = now() where id = $1", [hidden]);
    const inHidden = await reply(hidden);
    const visible = await thread();
    const hiddenReply = await reply(visible);
    await db.query("update app.replies set hidden_at = now() where id = $1", [hiddenReply]);
    as("ada");
    expect(await report({ kind: "thread", id: own })).toEqual({
      ok: false,
      error: "You can't report your own thread.",
    });
    expect((await report({ kind: "reply", id: ownReply })).ok).toBe(false);
    expect(await report({ kind: "profile", handle: "ada" })).toEqual({
      ok: false,
      error: "You can't report your own profile.",
    });
    expect(await report({ kind: "thread", id: hidden })).toEqual({
      ok: false,
      error: "This thread is no longer available.",
    });
    expect(await report({ kind: "reply", id: inHidden })).toEqual({
      ok: false,
      error: "This reply is no longer available.",
    });
    expect((await report({ kind: "reply", id: hiddenReply })).ok).toBe(false);
    expect((await report({ kind: "thread", id: "999999" })).ok).toBe(false);
    // not onboarded (no handle yet) or unknown
    expect(await report({ kind: "profile", handle: "nobody_here" })).toEqual({
      ok: false,
      error: "This member is no longer available.",
    });
    expect(await reports()).toEqual([]);
  });

  it("reports by a deleted author's post still work", async () => {
    const t = await thread();
    await db.query("delete from auth.users where id = $1", [ids.bob]);
    as("ada");
    expect((await report({ kind: "thread", id: t })).ok).toBe(true);
  });

  it("refuses guests, unfinished sign-ups and banned members", async () => {
    const t = await thread();
    as(null);
    expect(await report({ kind: "thread", id: t })).toEqual({
      ok: false,
      error: "Sign in to report.",
    });
    as("pending");
    expect((await report({ kind: "thread", id: t })).error).toBe(
      "Finish signing up before you report.",
    );
    as("banned");
    expect((await report({ kind: "thread", id: t })).error).toBe(
      "Your account can't send reports.",
    );
    expect(await reports()).toEqual([]);
  });

  it("rejects malformed input before reading the session", async () => {
    as("ada");
    expect((await report({ kind: "thread", id: "x" })).error).toBe("Unknown post.");
    expect((await report({ kind: "profile", handle: "a b" })).error).toBe("Unknown member.");
    expect((await report({ kind: "thread", id: "1" }, "nope")).error).toBe("Pick a reason.");
    expect((await report({ kind: "thread", id: "1" }, "other")).error).toBe(
      "Tell us what's wrong.",
    );
  });

  it("limits members to 20 reports a day, new accounts to 5; staff are exempt", async () => {
    const targets: string[] = [];
    for (let i = 0; i < 21; i++) targets.push(await thread(ids.bob, "off-topic", `Thread ${i}`));

    as("newbie");
    for (const t of targets.slice(0, 5))
      expect((await report({ kind: "thread", id: t })).ok).toBe(true);
    expect(await report({ kind: "thread", id: targets[5]! })).toEqual({
      ok: false,
      error: "You can send 5 reports a day while your account is new. Please try again later.",
    });

    as("ada");
    // reports older than a day don't count
    await db.query(
      `insert into app.reports (reporter_id, profile_id, reason, created_at)
       values ($1, $2, 'old', now() - interval '25 hours')`,
      [ids.ada, ids.newbie],
    );
    for (const t of targets.slice(0, 20))
      expect((await report({ kind: "thread", id: t })).ok).toBe(true);
    expect((await report({ kind: "thread", id: targets[20]! })).error).toBe(
      "You can send 20 reports a day. Please try again later.",
    );

    as("mod");
    for (const t of targets) expect((await report({ kind: "thread", id: t })).ok).toBe(true);
  });
});

describe("resolveReports()", () => {
  async function filed() {
    const t = await thread();
    const r = await reply(t);
    as("ada");
    await report({ kind: "reply", id: r });
    await report({ kind: "profile", handle: "bob" });
    as("newbie");
    await report({ kind: "reply", id: r }, "abuse");
    const rows = await reports();
    return { t, r, replyReports: [rows[0]!.id, rows[2]!.id], profileReport: rows[1]!.id };
  }

  it("marks one target's reports actioned and logs one row naming them", async () => {
    const { r, replyReports, profileReport } = await filed();
    as("su");
    expect(await a.resolveReports({ ids: replyReports, status: "actioned" })).toEqual({
      ok: true,
      message: "2 reports marked actioned",
    });
    expect(refresh).toHaveBeenCalledOnce();
    const rows = await reports();
    expect(rows.map((x) => [x.id, x.status, x.resolved_by])).toEqual([
      [replyReports[0], "actioned", ids.su],
      [profileReport, "open", null],
      [replyReports[1], "actioned", ids.su],
    ]);
    expect(await log()).toEqual([
      {
        action: "report_resolve",
        actor_id: ids.su,
        thread_id: null,
        reply_id: r,
        profile_id: null,
        note: `actioned: reports #${replyReports[0]}, #${replyReports[1]}`,
      },
    ]);
  });

  it("dismisses; resolved reports stay resolved (only open ones change)", async () => {
    const { replyReports, profileReport } = await filed();
    as("owner");
    expect(await a.resolveReports({ ids: [profileReport], status: "dismissed" })).toEqual({
      ok: true,
      message: "Report dismissed",
    });
    expect(await a.resolveReports({ ids: [profileReport], status: "actioned" })).toEqual({
      ok: false,
      error: "These reports were already resolved.",
    });
    // a mix: only the open one changes, and only it is named in the log
    await a.resolveReports({ ids: [profileReport, replyReports[0]!], status: "actioned" });
    const rows = await reports();
    expect(rows.find((x) => x.id === profileReport)!.status).toBe("dismissed");
    expect((await log()).map((l) => [l.profile_id, l.note])).toEqual([
      [ids.bob, `dismissed: report #${profileReport}`],
      [null, `actioned: report #${replyReports[0]}`],
    ]);
  });

  it("logs one row per target when reports on several targets are resolved together", async () => {
    const { t, replyReports, profileReport } = await filed();
    as("ada");
    await report({ kind: "thread", id: t });
    const threadReport = (await reports()).at(-1)!.id;
    const n = await m.resolveReports({
      ids: [threadReport, profileReport, ...replyReports],
      status: "dismissed",
      actorId: ids.su!,
    });
    expect(n).toBe(4);
    expect((await log()).map((l) => [l.thread_id, l.reply_id, l.profile_id])).toHaveLength(3);
  });

  it("is for superusers and the owner only", async () => {
    const { replyReports } = await filed();
    for (const who of [null, "ada", "mod", "banned"]) {
      as(who);
      expect(await a.resolveReports({ ids: replyReports, status: "dismissed" })).toEqual({
        ok: false,
        error: "You can't review reports.",
      });
    }
    expect((await reports()).every((x) => x.status === "open")).toBe(true);
    expect(await log()).toEqual([]);
  });

  it("rejects malformed input", async () => {
    as("su");
    expect((await a.resolveReports({ ids: [], status: "actioned" })).ok).toBe(false);
    expect((await a.resolveReports({ ids: ["1"], status: "open" })).ok).toBe(false);
    expect((await a.resolveReports({ ids: ["x"], status: "actioned" })).ok).toBe(false);
  });
});

describe("the queue and the log", () => {
  it("lists open reports grouped by target, oldest first, with what staff need", async () => {
    const t = await thread(ids.bob, "games", "Spammy thread");
    const r = await reply(t, ids.newbie, "Buy **now**");
    await db.query("update app.replies set hidden_at = now() where id = $1", [r]);
    as("ada");
    await report({ kind: "thread", id: t });
    as("newbie");
    await report({ kind: "profile", handle: "bob" }, "abuse", "Insults");
    // filed before the reply was hidden
    await db.query(
      `insert into app.reports (reporter_id, reply_id, reason) values ($1, $2, 'Spam or advertising')`,
      [ids.ada, r],
    );
    ids.carl = await insertUser(db, "carl");
    as("carl");
    await report({ kind: "thread", id: t }, "unsafe");
    // deleting accounts keeps reports by them and drops reports on them
    await db.query("delete from auth.users where id = any($1)", [[ids.bob, ids.carl]]);

    const { groups, total } = await q.listOpenReports();
    expect(total).toBe(3);
    expect(groups.map((g) => [g.key, g.reports.map((x) => x.reporterHandle)])).toEqual([
      [`thread:${t}`, ["Ada", null]],
      [`reply:${r}`, ["Ada"]],
    ]);
    expect(groups[0]!.target).toEqual({
      kind: "thread",
      threadId: t,
      categorySlug: "games",
      threadTitle: "Spammy thread",
      hidden: false,
      threadHidden: false,
      authorHandle: null,
      excerpt: "Opening **post** body.",
    });
    expect(groups[1]!.target).toMatchObject({
      kind: "reply",
      replyId: r,
      threadId: t,
      hidden: true,
      authorHandle: "newbie",
      excerpt: "Buy **now**",
    });
  });

  it("groups several reports on one profile and shows an active ban", async () => {
    as("ada");
    await report({ kind: "profile", handle: "banned" });
    as("newbie");
    await report({ kind: "profile", handle: "banned" }, "abuse");
    const { groups } = await q.listOpenReports();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.target).toEqual({ kind: "profile", handle: "banned", banned: true });
    expect(groups[0]!.reports.map((x) => x.reason)).toEqual([
      "Spam or advertising",
      "Harassment or abuse",
    ]);
  });

  it("lists resolved reports newest first, with who resolved them", async () => {
    const t = await thread();
    as("ada");
    await report({ kind: "thread", id: t });
    await report({ kind: "profile", handle: "bob" });
    const [one, two] = await reports();
    await m.resolveReports({ ids: [one!.id], status: "actioned", actorId: ids.su! });
    await m.resolveReports({ ids: [two!.id], status: "dismissed", actorId: ids.owner! });
    const resolved = await q.listResolvedReports();
    expect(resolved.map((x) => [x.id, x.status, x.resolverHandle, x.reporterHandle])).toEqual([
      [two!.id, "dismissed", "owner", "Ada"],
      [one!.id, "actioned", "sue", "Ada"],
    ]);
    expect(resolved[1]!.target).toMatchObject({ kind: "thread", threadId: t });
    expect((await q.listOpenReports()).groups).toEqual([]);
  });

  it("pages the moderation log, newest first, with actors and targets", async () => {
    const t = await thread();
    const r = await reply(t);
    const actor = ids.su!;
    const rows: [string, string | null, string | null, string | null][] = [
      ["hide", t, null, null],
      ["hide", null, r, null],
      ["ban", null, null, ids.bob!],
      ["category_create", null, null, null],
    ];
    for (const [action, threadId, replyId, profileId] of rows) {
      await db.query(
        `insert into app.moderation_log (actor_id, action, thread_id, reply_id, profile_id, note)
         values ($1, $2, $3, $4, $5, 'n')`,
        [actor, action, threadId, replyId, profileId],
      );
    }
    for (let i = 0; i < 47; i++) {
      await db.query(
        `insert into app.moderation_log (actor_id, action, thread_id, created_at)
         values ($1, 'lock', $2, now() - interval '1 day')`,
        [actor, t],
      );
    }
    await db.query("update app.threads set hidden_at = now() where id = $1", [t]);

    const first = await q.listModerationLog(1);
    expect(first).toMatchObject({ total: 51, page: 1, pages: 2 });
    expect(first.items).toHaveLength(50);
    expect(
      first.items.slice(0, 4).map((i) => [i.action, i.actorHandle, i.target?.kind ?? null]),
    ).toEqual([
      ["category_create", "sue", null],
      ["ban", "sue", "profile"],
      ["hide", "sue", "reply"],
      ["hide", "sue", "thread"],
    ]);
    expect(first.items[3]!.target).toMatchObject({
      kind: "thread",
      hidden: true,
      threadHidden: true,
    });
    expect(first.items[2]!.target).toMatchObject({
      kind: "reply",
      hidden: false,
      threadHidden: true,
    });
    const second = await q.listModerationLog(2);
    expect(second.items.map((i) => i.action)).toEqual(["lock"]);
    expect((await q.listModerationLog(3)).items).toEqual([]);
  });

  it("counts a member's reports in the last day", async () => {
    await db.query(
      `insert into app.reports (reporter_id, profile_id, reason, created_at)
       values ($1, $2, 'a', now()), ($1, $3, 'b', now() - interval '2 days')`,
      [ids.ada, ids.bob, ids.newbie],
    );
    expect(await q.countRecentReports(ids.ada!, 24 * 60 * 60 * 1000)).toBe(1);
    expect(await q.countRecentReports(ids.bob!, 24 * 60 * 60 * 1000)).toBe(0);
  });
});
