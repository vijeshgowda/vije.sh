import s from "./Forum.module.css";

/** Pinned and Locked badges (prototype `.pinb`); an empty cell keeps list columns aligned. */
export function ThreadBadges({ pinned, locked }: { pinned: boolean; locked: boolean }) {
  return (
    <span className={s.badges}>
      {pinned && <span className={s.pinb}>Pinned</span>}
      {locked && <span className={s.lockb}>Locked</span>}
    </span>
  );
}
