"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { storage } from "@/lib/storage";
import { wmo } from "../format";
import type { FeedStatus } from "./FeedCard";
import { Big, Note, Regs } from "./bodies/parts";
import s from "./Feeds.module.css";

interface Loc {
  lat: number;
  lon: number;
  name: string;
}
interface Weather {
  t: number;
  h: number;
  w: number;
  p: number;
  c: number;
  sunrise: string;
  sunset: string;
  hi: number;
  lo: number;
}

const LOC_KEY = "wx-loc";
const TTL = 15 * 60_000;
const FALLBACK: Loc = { lat: 51.51, lon: -0.13, name: "London" };

async function getJSON(url: string, ms = 10_000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Location from the visitor's time zone city (no permission needed), or the browser on request. */
async function homeLoc(): Promise<Loc> {
  const saved = storage.get<Loc | null>(LOC_KEY, null);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  const city = (tz.split("/").pop() ?? "London").replace(/_/g, " ");
  try {
    const d = (await getJSON(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      8000,
    )) as { results?: { latitude: number; longitude: number; name: string }[] };
    const r = d.results?.[0];
    if (r) {
      const loc = { lat: +r.latitude, lon: +r.longitude, name: String(r.name || city) };
      storage.set(LOC_KEY, loc);
      return loc;
    }
  } catch {
    // fall back to the default
  }
  return FALLBACK;
}

async function forecast(l: Loc): Promise<{ d: Weather; at: number; cached: boolean }> {
  const key = `wx:${l.lat.toFixed(1)},${l.lon.toFixed(1)}`;
  const c = storage.get<{ d: Weather; at: number } | null>(key, null);
  if (c && Date.now() - c.at < TTL) return { ...c, cached: true };
  const u =
    `https://api.open-meteo.com/v1/forecast?latitude=${l.lat.toFixed(2)}&longitude=${l.lon.toFixed(2)}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,pressure_msl" +
    "&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1";
  try {
    const raw = (await getJSON(u)) as {
      current?: Record<string, number>;
      daily?: Record<string, (string | number)[]>;
    };
    const k = raw.current ?? {};
    const y = raw.daily ?? {};
    const d: Weather = {
      t: +(k.temperature_2m ?? NaN),
      h: +(k.relative_humidity_2m ?? NaN),
      w: +(k.wind_speed_10m ?? NaN),
      p: +(k.pressure_msl ?? NaN),
      c: +(k.weather_code ?? 0),
      sunrise: String(y.sunrise?.[0] ?? ""),
      sunset: String(y.sunset?.[0] ?? ""),
      hi: +(y.temperature_2m_max?.[0] ?? NaN),
      lo: +(y.temperature_2m_min?.[0] ?? NaN),
    };
    if (!Number.isFinite(d.t)) throw new Error("no temperature");
    const at = Date.now();
    storage.set(key, { d, at });
    return { d, at, cached: false };
  } catch (e) {
    if (c) return { ...c, cached: true };
    throw e;
  }
}

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
      const loc = await homeLoc();
      const r = await forecast(loc);
      setState({ loc, d: r.d });
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
