"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { storage } from "@/lib/storage";
import { wmo } from "../format";
import { loadWeather, LOC_KEY, type Loc, type Weather } from "../client/weather";
import type { FeedStatus } from "./FeedCard";
import { Big, Note, Regs } from "./bodies/parts";
import s from "./Feeds.module.css";

const hhmm = (s: string) => s.slice(11, 16);

/** LF-13. Per-visitor location, so it's fetched by the browser (Open-Meteo: 10,000 calls/day per IP). */
export function WeatherFeed({
  onStatus,
  cardRef,
}: {
  onStatus: (s: FeedStatus) => void;
  cardRef: React.RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<{ loc: Loc; d: Weather } | "error" | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

  const run = useCallback(async () => {
    onStatus({ kind: "acquiring" });
    try {
      const r = await loadWeather();
      setState({ loc: r.loc, d: r.d });
      onStatus({ kind: "live", at: r.at });
    } catch {
      setState("error");
      onStatus({ kind: "nosignal" });
    }
  }, [onStatus]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          void run();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cardRef, run]);

  const locateMe = () => {
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        storage.set(LOC_KEY, {
          lat: +p.coords.latitude.toFixed(2),
          lon: +p.coords.longitude.toFixed(2),
          name: "your location",
        });
        setGeoBusy(false);
        void run();
      },
      () => {
        setGeoBusy(false);
        setGeoMsg("Location unavailable.");
      },
      { maximumAge: 36e5, timeout: 10_000 },
    );
  };

  if (state === "error")
    return (
      <Note>
        No signal from open-meteo.com.
        <Button size="sm" onClick={() => void run()}>
          Retry
        </Button>
      </Note>
    );
  if (!state)
    return (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={s.fsk} />
        ))}
      </div>
    );
  const { d, loc } = state;
  return (
    <>
      <Big
        value={
          <>
            T<sub>A</sub> {d.t.toFixed(1)}&nbsp;&deg;C
          </>
        }
        red={d.t >= 25}
      >
        {wmo(d.c)} &middot; {loc.name}
      </Big>
      <Regs
        items={[
          ["HUMIDITY", `${Math.round(d.h)} %`],
          ["WIND", `${Math.round(d.w)} km/h`],
          ["PRESSURE", `${Math.round(d.p)} hPa`],
        ]}
      />
      <Regs
        items={[
          ["SUNRISE", hhmm(d.sunrise)],
          ["SUNSET", hhmm(d.sunset)],
          ["LOW / HIGH", `${Math.round(d.lo)} / ${Math.round(d.hi)}\u00b0`],
        ]}
      />
      <Note>
        {d.t > 25 ? "Above" : "Below"} the 25 &deg;C the ratings table assumes.
        {"geolocation" in navigator && (
          <Button size="sm" disabled={geoBusy} onClick={locateMe}>
            Use my location
          </Button>
        )}
        {geoMsg && <span role="status">{geoMsg}</span>}
      </Note>
    </>
  );
}
