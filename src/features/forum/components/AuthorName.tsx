import { DELETED_AUTHOR } from "../format";
import s from "./Frames.module.css";

/**
 * An author's name in a frame header. The one place names render, so profile links
 * (`/u/[handle]`) can be added here.
 */
export function AuthorName({ handle }: { handle: string | null }) {
  return <b className={s.author}>{handle ?? DELETED_AUTHOR}</b>;
}
