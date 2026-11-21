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

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

// Kept per server instance so a burst of requests shares one ESPN fetch.
const cache = new Map<string, { at: number; data: Map<number, LiveInfo> }>();
const TTL_MS = 20_000;

/** All FBS games between the two instants (ESPN groups days by Eastern time, hence the buffer). */
export async function getLiveScores(fromMs: number, toMs: number): Promise<Map<number, LiveInfo>> {
  const dates = `${ymd(fromMs - 86_400_000)}-${ymd(toMs + 86_400_000)}`;
  const hit = cache.get(dates);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const res = await fetch(`${SCOREBOARD}?dates=${dates}&groups=80&limit=500`, {
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
  cache.set(dates, { at: Date.now(), data });
  return data;
}
