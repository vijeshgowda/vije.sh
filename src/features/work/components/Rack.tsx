import { Reveal } from "@/components/motion/Reveal";
import { kpis, work } from "@/content/profile";
import { RackUnit } from "./RackUnit";
import s from "./Work.module.css";

export function Kpis() {
  return (
    <ul className={s.kpis} aria-label="Key figures">
      {kpis.map((k) => (
        <li key={k.caption}>
          <b>
            {k.value}
            {k.sample && <sup>*</sup>}
          </b>
          {k.caption}
        </li>
      ))}
    </ul>
  );
}

export function Rack() {
  return (
    <Reveal className={s.rack}>
      {work.map((w, i) => (
        <RackUnit key={w.code} index={i} {...w} />
      ))}
    </Reveal>
  );
}
