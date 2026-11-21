/**
 * Live scores from ESPN's public scoreboard feed. This is deliberately a
 * separate source from CFBD so showing live scores never touches the CFBD call
 * quota. CFBD game ids are ESPN event ids, so games match by id.
 */

export interface LiveInfo {
  state: "pre" | "in" | "post";
  detail: string; // e.g. "7:29 - 4th", "Halftime", "Final"
  homeScore: number | null;
  awayScore: number | null;
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

interface RawEvent {
  id: string;
  status: { type: { state: string; shortDetail: string } };
  competitions: { competitors: { homeAway: string; score?: string }[] }[];
}

// ESPN groups games by Eastern-time calendar day.
const etDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms)).replace(/-/g, "");

// Kept per server instance so a burst of requests shares one ESPN fetch.
const cache = new Map<string, { at: number; data: Map<number, LiveInfo> }>();
const TTL_MS = 20_000;

/** One day's FBS scoreboard (ESPN's multi-day range queries are rejected, so it's a request per day). */
async function fetchDay(date: string): Promise<Map<number, LiveInfo>> {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const res = await fetch(`${SCOREBOARD}?dates=${date}&groups=80&limit=500`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ESPN scoreboard failed (${res.status})`);
  const json = (await res.json()) as { events?: RawEvent[] };

  const data = new Map<number, LiveInfo>();
  for (const e of json.events ?? []) {
    const comp = e.competitions?.[0];
    const home = comp?.competitors.find((c) => c.homeAway === "home");
    const away = comp?.competitors.find((c) => c.homeAway === "away");
    const state = e.status?.type?.state;
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    data.set(Number(e.id), {
      state,
      detail: e.status.type.shortDetail,
      homeScore: home?.score != null ? Number(home.score) : null,
      awayScore: away?.score != null ? Number(away.score) : null,
    });
  }
  cache.set(date, { at: Date.now(), data });
  return data;
}

/** Live info for every FBS game on the Eastern-time days that the given kickoff times fall on. */
export async function getLiveScores(kickoffs: number[]): Promise<Map<number, LiveInfo>> {
  const days = [...new Set(kickoffs.map(etDay))];
  const maps = await Promise.all(days.map(fetchDay));
  const merged = new Map<number, LiveInfo>();
  for (const m of maps) for (const [id, info] of m) merged.set(id, info);
  return merged;
}
