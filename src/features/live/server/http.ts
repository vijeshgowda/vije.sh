import "server-only";
import type { Json } from "./json";

const UA = "vije.sh live feeds (+https://vije.sh)";

export async function getJSON(
  url: string,
  { timeoutMs = 12_000, headers = {} as Record<string, string> } = {},
): Promise<Json> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as Json;
}

/** An optional token lifts GitHub's limit from 60 to 5,000 an hour (Vercel egress IPs are shared). */
export function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}
