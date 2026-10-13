import Link from "next/link";
import { profileHref } from "@/features/profile/format";
import { DELETED_AUTHOR } from "../format";
import s from "./Frames.module.css";

/** An author's name in a frame header, linking to their profile. The one place names render. */
export function AuthorName({ handle }: { handle: string | null }) {
  if (handle === null) return <b className={s.author}>{DELETED_AUTHOR}</b>;
  return (
    <Link className={s.author} href={profileHref(handle)}>
      {handle}
    </Link>
  );
}
