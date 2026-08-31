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
  teamId: number;
}

interface RawCfbdGame {
  id: number;
  startDate: string;
  completed: boolean;
  homeId: number;
  homeTeam: string;
  homePoints: number | null;
  awayId: number;
  awayTeam: string;
  awayPoints: number | null;
}

export interface CfbdGame {
  id: number;
  startDate: string;
  completed: boolean;
  homeId: number;
  homeTeam: string;
  homeScore: number | null;
  awayId: number;
  awayTeam: string;
  awayScore: number | null;
}

/** CFBD serves team logos from a predictable CDN path keyed by team id. */
export function logoUrl(teamId: number | null | undefined): string | null {
  return teamId != null ? `https://cdn.collegefootballdata.com/logos/64/${teamId}.png` : null;
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

  const firstRegularWeek = allSorted.find((w) => w.seasonType === "regular");
  if (firstRegularWeek && now < new Date(firstRegularWeek.startDate)) {
    return { week: firstRegularWeek.week, seasonType: "regular" };
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
 * once it exists, then the AP Top 25, then the Coaches Poll (useful early in
 * the season / preseason, when the Coaches Poll is often published first).
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

  const coaches = polls.find((p) => p.poll === "Coaches Poll");
  if (coaches) return { pollSource: "Coaches Poll", ranks: coaches.ranks.slice(0, 25) };

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

export interface TeamColors {
  color: string | null;
  alternateColor: string | null;
}

interface RawTeamInfo {
  school: string;
  color: string | null;
  alternateColor: string | null;
}

/** Returns each FBS team's brand colors, keyed by team name. */
export async function getTeamColors(year: number): Promise<Map<string, TeamColors>> {
  const raw = await cfbdFetch<RawTeamInfo[]>("/teams/fbs", { year });
  return new Map(raw.map((t) => [t.school, { color: t.color, alternateColor: t.alternateColor }]));
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
    homeId: g.homeId,
    homeTeam: g.homeTeam,
    homeScore: g.homePoints,
    awayId: g.awayId,
    awayTeam: g.awayTeam,
    awayScore: g.awayPoints,
  }));
}

interface RawGameMedia {
  id: number;
  outlet: string | null;
}

/** Returns each game's TV/streaming outlet (e.g. "ESPN", "ABC"), keyed by game id. */
export async function getMediaForWeek(
  year: number,
  week: number,
  seasonType: SeasonType
): Promise<Map<number, string>> {
  const raw = await cfbdFetch<RawGameMedia[]>("/games/media", { year, week, seasonType });
  const byGame = new Map<number, string>();
  for (const m of raw) {
    if (m.outlet && !byGame.has(m.id)) byGame.set(m.id, m.outlet);
  }
  return byGame;
}

// CFBD doesn't provide broadcaster logos. A favicon-by-domain lookup can't
// tell ESPN/ESPN2/ESPNU (or SEC Network/SEC Network+) apart since they share
// a domain, so these are real per-channel logos instead (Wikimedia Commons/
// Wikipedia, verified to load). SEC Network+ has no distinct brand of its
// own -- it's explicitly ESPN+'s SEC-specific stream -- so "SECN+" uses the
// ESPN+ logo. Falls back to showing the outlet name as text if unmapped.
const OUTLET_LOGOS: Record<string, string> = {
  ESPN: "https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg",
  ESPN2: "https://upload.wikimedia.org/wikipedia/commons/b/bf/ESPN2_logo.svg",
  ESPNU: "https://upload.wikimedia.org/wikipedia/commons/c/ca/ESPN_U_logo.svg",
  ESPNEWS: "https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg",
  "ESPN+": "https://upload.wikimedia.org/wikipedia/commons/8/80/ESPN_Plus.svg",
  "SECN+": "https://upload.wikimedia.org/wikipedia/commons/8/80/ESPN_Plus.svg",
  "SEC Network+": "https://upload.wikimedia.org/wikipedia/commons/8/80/ESPN_Plus.svg",
  ABC: "https://upload.wikimedia.org/wikipedia/commons/2/2f/ABC-2021-LOGO.svg",
  FOX: "https://upload.wikimedia.org/wikipedia/commons/c/c0/Fox_Broadcasting_Company_logo_%282019%29.svg",
  FS1: "https://upload.wikimedia.org/wikipedia/commons/3/37/2015_Fox_Sports_1_logo.svg",
  FS2: "https://upload.wikimedia.org/wikipedia/commons/3/37/2015_Fox_Sports_1_logo.svg",
  CBS: "https://upload.wikimedia.org/wikipedia/commons/e/ee/CBS_logo_%282020%29.svg",
  CBSSN: "https://upload.wikimedia.org/wikipedia/commons/0/04/CBS_Sports_Network_2021.svg",
  NBC: "https://upload.wikimedia.org/wikipedia/commons/7/7a/NBC_logo_2022_%28vertical%29.svg",
  Peacock: "https://upload.wikimedia.org/wikipedia/commons/2/20/NBCUniversal_Peacock_Logo_%282026%29.svg",
  "The CW": "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_CW_2024.svg",
  CW: "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_CW_2024.svg",
  "SEC Network": "https://upload.wikimedia.org/wikipedia/commons/f/fd/SEC_Network_%282024%29.svg",
  "ACC Network": "https://upload.wikimedia.org/wikipedia/commons/f/fd/ACC_Network_ESPN_logo.svg",
  ACCN: "https://upload.wikimedia.org/wikipedia/commons/f/fd/ACC_Network_ESPN_logo.svg",
  ACCNX: "https://upload.wikimedia.org/wikipedia/commons/f/fd/ACC_Network_ESPN_logo.svg",
  "Big Ten Network": "https://upload.wikimedia.org/wikipedia/en/3/39/Big_Ten_Network_Logo.svg",
  BTN: "https://upload.wikimedia.org/wikipedia/en/3/39/Big_Ten_Network_Logo.svg",
  "The Big Ten Network": "https://upload.wikimedia.org/wikipedia/en/3/39/Big_Ten_Network_Logo.svg",
  "Pac-12 Network": "https://upload.wikimedia.org/wikipedia/en/8/85/Pac-12_Network_logo.png",
  "NFL Network": "https://upload.wikimedia.org/wikipedia/en/8/8f/NFL_Network_logo.svg",
  NFLN: "https://upload.wikimedia.org/wikipedia/en/8/8f/NFL_Network_logo.svg",
};

export function networkLogoUrl(outlet: string | null | undefined): string | null {
  if (!outlet) return null;
  return OUTLET_LOGOS[outlet] ?? null;
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
