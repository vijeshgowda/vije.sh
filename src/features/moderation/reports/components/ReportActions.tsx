"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { hidePost } from "../../actions";
import { useModerate } from "../../client/use-moderate";
import { resolveReports } from "../actions";
import type { Resolution } from "../format";
import s from "./Reports.module.css";

/**
 * A queued target's buttons: Hide (a visible post, through inline moderation's hidePost, logged
 * with the report numbers), then mark its open reports actioned or dismiss them. Results are
 * toasted; the queue re-renders with the change.
 */
export function ReportActions({
  ids,
  post,
  name,
}: {
  /** The open reports on this target, as listed */
  ids: string[];
  /** A visible thread or reply to offer Hide for */
  post?: { kind: "thread" | "reply"; id: string };
  /** The target, for the buttons' group label */
  name: string;
}) {
  const router = useRouter();
  const { pending, run } = useModerate({ toastErrors: true });
  const resolve = (status: Resolution) => run(() => resolveReports({ ids, status }));
  const note = `${ids.length === 1 ? "report" : "reports"} ${ids.map((i) => `#${i}`).join(", ")}`;
  return (
    <div role="group" aria-label={`Act on ${name}`} className={s.tools}>
      {post && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => hidePost({ ...post, note }),
              () => router.refresh(),
            )
          }
        >
          {post.kind === "thread" ? "Hide thread" : "Hide reply"}
        </Button>
      )}
      <Button size="sm" variant="red" disabled={pending} onClick={() => resolve("actioned")}>
        Mark actioned
      </Button>
      <Button size="sm" disabled={pending} onClick={() => resolve("dismissed")}>
        Dismiss
      </Button>
    </div>
  );
}
