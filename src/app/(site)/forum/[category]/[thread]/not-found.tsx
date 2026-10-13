import { HiddenThreadNotice } from "@/features/moderation/components/HiddenThreadNotice";
import SiteNotFound from "../../../not-found";

/**
 * A missing or hidden thread: the site's 404 for everyone. Staff who moderate a hidden thread's
 * category also get a notice with Reveal and Unhide, loaded in the browser, so the page stays the
 * same cached 404 for everyone else.
 */
export default function ThreadNotFound() {
  return (
    <>
      <SiteNotFound />
      <HiddenThreadNotice />
    </>
  );
}
