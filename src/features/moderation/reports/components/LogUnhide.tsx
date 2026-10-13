"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { unhidePost } from "../../actions";
import { useModerate } from "../../client/use-moderate";

/** Unhide on a log row of a thread that is still hidden (inline moderation's unhidePost). */
export function LogUnhide({ threadId, title }: { threadId: string; title: string }) {
  const router = useRouter();
  const { pending, run } = useModerate({ toastErrors: true });
  return (
    <Button
      size="sm"
      disabled={pending}
      aria-label={`Unhide thread \u201c${title}\u201d`}
      onClick={() =>
        run(
          () => unhidePost({ kind: "thread", id: threadId }),
          () => router.refresh(),
        )
      }
    >
      {pending ? "Unhiding\u2026" : "Unhide"}
    </Button>
  );
}
