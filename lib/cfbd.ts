const BASE_URL = "https://api.collegefootballdata.com";

// Preference order when a game has lines from multiple sportsbooks.
const PROVIDER_PRIORITY = ["consensus", "DraftKings", "ESPN Bet", "Bovada"];

export type SeasonType = "regular" | "postseason";

export interface CalendarWeek {
  season: number;
  week: number;
  seasonType: SeasonType;
  startDate: string;
  endDate: string;
  firstGameStart: string;
  lastGameStart: string;
}

export interface PollRank {
  rank: number;
  school: string;
}

interface RawCfbdGame {
  id: number;
  startDate: string;
  completed: boolean;
  homeTeam: string;
  homePoints: number | null;
  awayTeam: string;
  awayPoints: number | null;
}

export interface CfbdGame {
  id: number;
  startDate: string;
  completed: boolean;
  homeTeam: string;
  homeScore: number | null;
  awayTeam: string;
  awayScore: number | null;
}

export interface CfbdLine {
  provider: string;
  spread: number | null;
  overUnder: number | null;
}

export interface CfbdGameLines {
  id: number;
  homeTeam: string;
  awayTeam: string;
  lines: CfbdLine[];
}

function apiKey(): string {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error("CFBD_API_KEY environment variable is not set");
  return key;
}

async function cfbdFetch<T>(
  path: string,
  params: Record<string, string | number>
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CFBD request failed (${res.status}) for ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function getCalendar(year: number): Promise<CalendarWeek[]> {
  return cfbdFetch<CalendarWeek[]>("/calendar", { year });
}

/** Determines the "current" college football week from today's date. */
export async function getCurrentWeek(
  year: number,
  now: Date = new Date()
): Promise<{ week: number; seasonType: SeasonType }> {
  const calendar = await getCalendar(year);
  const regularWeeks = calendar.filter((w) => w.seasonType === "regular");
  const postseasonWeeks = calendar.filter((w) => w.seasonType === "postseason");

  const allSorted = [...regularWeeks, ...postseasonWeeks].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  for (const w of allSorted) {
    if (now >= new Date(w.startDate) && now < new Date(w.endDate)) {
      return { week: w.week, seasonType: w.seasonType };
    }
  }

  if (regularWeeks.length && now < new Date(regularWeeks[0].startDate)) {
    return { week: regularWeeks[0].week, seasonType: "regular" };
  }

  const last = allSorted[allSorted.length - 1];
  return { week: last.week, seasonType: last.seasonType };
}

interface RankingsResponse {
  season: number;
  week: number;
  seasonType: string;
  polls: { poll: string; ranks: PollRank[] }[];
}

/**
 * Returns the Top 25 for a week, preferring CFP ("Playoff Committee Rankings")
 * once it exists, otherwise falling back to the AP Top 25.
 */
export async function getTop25(
  year: number,
  week: number,
  seasonType: SeasonType
): Promise<{ pollSource: string; ranks: PollRank[] } | null> {
  const data = await cfbdFetch<RankingsResponse[]>("/rankings", {
    year,
    week,
    seasonType,
  });
  const polls = data[0]?.polls ?? [];

  const cfp = polls.find((p) => p.poll === "Playoff Committee Rankings");
  if (cfp) return { pollSource: "CFP Rankings", ranks: cfp.ranks.slice(0, 25) };

  const ap = polls.find((p) => p.poll === "AP Top 25");
  if (ap) return { pollSource: "AP Top 25", ranks: ap.ranks.slice(0, 25) };

  return null;
}

const DISPLAY_POLLS = ["AP Top 25", "Coaches Poll", "Playoff Committee Rankings"];

export interface PollTable {
  poll: string;
  ranks: PollRank[];
}

/** Returns each of the AP, Coaches, and CFP polls (whichever exist yet) for a week. */
export async function getDisplayRankings(
  year: number,
  week: number,
  seasonType: SeasonType
): Promise<PollTable[]> {
  const data = await cfbdFetch<RankingsResponse[]>("/rankings", { year, week, seasonType });
  const polls = data[0]?.polls ?? [];

  return DISPLAY_POLLS.map((name) => polls.find((p) => p.poll === name))
    .filter((p): p is { poll: string; ranks: PollRank[] } => !!p)
    .map((p) => ({ poll: p.poll, ranks: p.ranks.slice(0, 25) }));
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
}

interface RawTeamRecord {
  team: string;
  total: { wins: number; losses: number; ties: number };
}

/** Returns each FBS/FCS team's current season record, keyed by team name. */
export async function getRecords(year: number): Promise<Map<string, TeamRecord>> {
  const raw = await cfbdFetch<RawTeamRecord[]>("/records", { year });
  return new Map(raw.map((r) => [r.team, r.total]));
}

export async function getGamesForWeek(
  year: number,
  week: number,
  seasonType: SeasonType
): Promise<CfbdGame[]> {
  const raw = await cfbdFetch<RawCfbdGame[]>("/games", {
    year,
    week,
    seasonType,
    classification: "fbs",
  });
  return raw.map((g) => ({
    id: g.id,
    startDate: g.startDate,
    completed: g.completed,
    homeTeam: g.homeTeam,
    homeScore: g.homePoints,
    awayTeam: g.awayTeam,
    awayScore: g.awayPoints,
  }));
}

export async function getLinesForWeek(
  year: number,
  week: number,
  seasonType: SeasonType
): Promise<CfbdGameLines[]> {
  return cfbdFetch<CfbdGameLines[]>("/lines", { year, week, seasonType });
}

/** Picks one spread/total from the available sportsbook lines for a game. */
export function pickBestLine(
  lines: CfbdLine[]
): { provider: string; spread: number; overUnder: number } | null {
  for (const provider of PROVIDER_PRIORITY) {
    const line = lines.find(
      (l) => l.provider === provider && l.spread != null && l.overUnder != null
    );
    if (line) {
      return { provider: line.provider, spread: line.spread!, overUnder: line.overUnder! };
    }
  }
  const fallback = lines.find((l) => l.spread != null && l.overUnder != null);
  if (fallback) {
    return { provider: fallback.provider, spread: fallback.spread!, overUnder: fallback.overUnder! };
  }
  return null;
}
