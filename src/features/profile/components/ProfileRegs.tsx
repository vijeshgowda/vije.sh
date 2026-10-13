import type { ReactNode } from "react";
import { RolePill } from "@/features/forum/components/RolePill";
import { fmtDay } from "@/features/forum/format";
import type { Profile } from "../types";
import s from "./Profile.module.css";

/** The member's registers (prototype `.regs`): role, joined date and post counts. */
export function ProfileRegs({ profile }: { profile: Profile }) {
  const last = profile.posts[0]?.createdAt;
  const regs: [string, ReactNode][] = [
    ["Handle", profile.handle],
    ["Role", <RolePill key="r" role={profile.role} />],
    [
      "Joined",
      <time key="j" dateTime={profile.joinedAt.toISOString()}>
        {fmtDay(profile.joinedAt)}
      </time>,
    ],
    ["Threads", profile.threadCount],
    ["Replies", profile.replyCount],
    [
      "Last post",
      last ? (
        <time key="l" dateTime={last.toISOString()}>
          {fmtDay(last)}
        </time>
      ) : (
        "\u2014"
      ),
    ],
  ];
  return (
    <dl className={s.regs}>
      {regs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
