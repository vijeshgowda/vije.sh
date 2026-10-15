import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWeather, warmWeather } from "./weather";

const GEO = { results: [{ latitude: 48.85, longitude: 2.35, name: "Paris" }] };
const FORECAST = {
  current: {
    temperature_2m: 18.4,
    relative_humidity_2m: 60,
    wind_speed_10m: 12,
    weather_code: 3,
    pressure_msl: 1015,
  },
  daily: {
    sunrise: ["2026-10-15T07:30"],
    sunset: ["2026-10-15T18:40"],
    temperature_2m_max: [20],
    temperature_2m_min: [11],
  },
};

let store: Map<string, string>;

function stubFetch(fail = false) {
  const fetch = vi.fn(async (url: string) => {
    if (fail) throw new Error("offline");
    return Response.json(url.includes("geocoding") ? GEO : FORECAST);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weather cache", () => {
  it("geocodes once, then serves the forecast from storage for 15 minutes", async () => {
    const fetch = stubFetch();
    const first = await loadWeather();
    expect(first).toMatchObject({ loc: { name: "Paris" }, d: { t: 18.4, hi: 20 }, cached: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect([...store.keys()]).toEqual(["vj:wx-loc", "vj:wx:48.9,2.4"]);

    const again = await loadWeather();
    expect(again).toMatchObject({ d: { t: 18.4 }, at: first.at, cached: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one request between the card and the preload", async () => {
    const fetch = stubFetch();
    const [a, b] = await Promise.all([loadWeather(), loadWeather()]);
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("warmWeather swallows failures; loadWeather reports them", async () => {
    stubFetch(true);
    await expect(warmWeather()).resolves.toBeUndefined();
    await expect(loadWeather()).rejects.toThrow("offline");
    expect(store.size).toBe(0);
  });
});
