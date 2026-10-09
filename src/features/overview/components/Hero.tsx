import { ButtonLink } from "@/components/ui/Button";
import { identity } from "@/content/profile";
import { Chip } from "./Chip";
import { Firmware, Tagline } from "./Firmware";
import { Uart } from "./Uart";
import { Wordmark } from "./Wordmark";
import s from "./Hero.module.css";

const WM_ID = "wm";
const k = (n: number) => ({ "--k": n }) as React.CSSProperties;

/** Overview hero from V18.1.1: fitted wordmark with letter-rise intro, chip pinout, UART console. */
export function Hero() {
  return (
    <section className={s.hero}>
      <div className={s.grid}>
        <div className={s.left}>
          <p className={s.pn}>Part no. VKG-04-RED &middot; QFN-28 &middot; Rev 30.1</p>
          <Wordmark id={WM_ID} className={s.wm} innerClassName={s.wmi}>
            {[..."vije.sh"].map((c, i) => (
              <span
                key={i}
                className={c === "." ? `${s.ch} ${s.dot}` : s.ch}
                style={{ "--i": i } as React.CSSProperties}
              >
                {c}
              </span>
            ))}
          </Wordmark>
          <div className={s.rule} aria-hidden="true" />
          <p className={`${s.sub} ${s.fi}`} style={k(0)}>
            Personal Systems Processor
          </p>
          <div className={s.fi} style={k(1)}>
            <Tagline className={s.tag} />
          </div>
          <p className={`${s.bio} ${s.fi}`} style={k(2)}>
            {identity.bio}
          </p>
          <div className={`${s.ctas} ${s.fi}`} style={k(3)}>
            <ButtonLink href="/blog" variant="red">
              Read the blog
            </ButtonLink>
            <ButtonLink href="/forum">Visit the forum</ButtonLink>
          </div>
          <div className={s.fi} style={k(4)}>
            <Firmware wordmarkId={WM_ID} />
          </div>
        </div>
        <div className={s.right}>
          <Chip active="/" />
          <Uart />
        </div>
      </div>
    </section>
  );
}

const TICKER = [
  "8 yrs backend",
  "MSc ML & AI",
  "Node.js",
  "React",
  "GCP",
  "Istio",
  "Godot",
  "Kubernetes",
  "Linux",
  "ESP32-C3",
  "Custom firmware",
  "Robotics",
  "Rockets",
  "Local AI",
  "Servers",
  "Photography",
  "Motorcycles",
  "Good dog",
];

export function Ticker() {
  const run = (copy: number) =>
    TICKER.map((t) => (
      <span key={`${copy}-${t}`} className={s.tk}>
        <span>{t}</span>
        <i />
      </span>
    ));
  return (
    <div className={s.ticker} aria-hidden="true">
      <div>
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}
