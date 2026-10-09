import { Card } from "@/components/ui/Card";
import { identity, outside } from "@/content/profile";
import { Rtc } from "./Rtc";
import s from "./Overview.module.css";

export function Features() {
  return (
    <div className={s.feat}>
      <ul className={s.sq}>
        <li>
          Software engineer first: {identity.stats[0]} of distributed backend systems, security and
          tooling
        </li>
        <li>Part-time sysadmin, full-time Kubernetes wizard: clusters, meshes, servers</li>
        <li>{identity.stats[1]}, with a soft spot for small, efficient models</li>
        <li>Native support for {identity.stats.slice(2).join(", ")}</li>
        <li>Custom firmware and hardware: microcontrollers, sensors, robots</li>
        <li>Integrated camera, motorcycle and one very good dog</li>
      </ul>
      <div className={s.apps}>
        <p className={s.mini}>Typical applications</p>
        <ul className={s.sq}>
          <li>Platform engineering and API gateways</li>
          <li>Clusters that heal themselves</li>
          <li>Access control you can audit</li>
          <li>Local AI on modest hardware</li>
          <li>Things that blink, beep or launch</li>
        </ul>
      </div>
    </div>
  );
}

const CODES = [
  ["GFX", "Godot 4"],
  ["GPIO", "ESP32-C3"],
  ["NPU", "int4 / ternary"],
  ["GPU", "next upgrade"],
] as const;

export function Peripherals() {
  return (
    <div className={s.cards}>
      {outside.map((o, i) => (
        <Card key={o.title} code={CODES[i]![0]} meta={CODES[i]![1]} title={o.title}>
          <p>{o.text}</p>
        </Card>
      ))}
      <Rtc />
    </div>
  );
}

const RATINGS: [string, React.ReactNode, string, string, string, string, boolean?][] = [
  [
    "Coffee intake",
    <>
      <i>I</i>
      <sub>coffee</sub>
    </>,
    "1",
    "3",
    "5",
    "cups/day",
  ],
  [
    "Dog walks",
    <>
      <i>N</i>
      <sub>walk</sub>
    </>,
    "2",
    "3",
    "\u2014",
    "per day",
  ],
  [
    "Motorcycle lean angle",
    <>
      &theta;<sub>lean</sub>
    </>,
    "0",
    "25",
    "45",
    "\u00b0",
  ],
  [
    "Build-to-flash latency",
    <>
      <i>t</i>
      <sub>flash</sub>
    </>,
    "\u2014",
    "9",
    "40",
    "s",
  ],
  [
    "Open browser tabs",
    <>
      <i>N</i>
      <sub>tab</sub>
    </>,
    "12",
    "48",
    "\u221e",
    "\u2014",
    true,
  ],
  ["Altitude (ambition)", <i key="h">h</i>, "0", "\u2014", "100", "km", true],
];

export function Ratings() {
  return (
    <>
      <div className={s.tw} tabIndex={0} role="region" aria-label="Absolute maximum ratings table">
        <table className={s.tbl}>
          <thead>
            <tr>
              {["Parameter", "Symbol", "Min", "Typ", "Max", "Unit"].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RATINGS.map(([p, sym, min, typ, max, unit, red]) => (
              <tr key={p}>
                <td>{p}</td>
                <td>{sym}</td>
                <td className={s.n}>{min}</td>
                <td className={s.n}>{typ}</td>
                <td className={`${s.n} ${red ? s.r : ""}`}>{max}</td>
                <td className={s.n}>{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.fn}>
        Stresses beyond these ratings may cause permanent damage. 100 km is the K&aacute;rm&aacute;n
        line; still working on it.
      </p>
    </>
  );
}
