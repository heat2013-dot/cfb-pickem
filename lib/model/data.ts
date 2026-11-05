import { cfbdFetch } from "@/lib/cfbd";
import { summarizeLines, type AdvRow, type LineSummary, type SeasonGame, type Weather } from "@/lib/model/engine";

// ------------------------------------------------------------------ pure parsers (shared with offline tests)
interface RawGame {
  id: number;
  week: number;
  seasonType: string;
  startDate: string;
  neutralSite?: boolean;
  completed?: boolean;
  homeTeam: string;
  homeClassification?: string;
  homePoints: number | null;
  awayTeam: string;
  awayClassification?: string;
  awayPoints: number | null;
}

export function parseGames(raw: RawGame[]): SeasonGame[] {
  return raw
    .filter((g) => g.startDate)
    .map((g) => ({
      id: g.id,
      week: g.week,
      seasonType: g.seasonType,
      date: Date.parse(g.startDate),
      neutral: !!g.neutralSite,
      completed: !!g.completed,
      homeKey: g.homeClassification === "fbs" ? g.homeTeam : "FCS",
      awayKey: g.awayClassification === "fbs" ? g.awayTeam : "FCS",
      homeName: g.homeTeam,
      awayName: g.awayTeam,
      homePoints: g.homePoints,
      awayPoints: g.awayPoints,
    }));
}

interface RawLineGame {
  id: number;
  lines: { spread: number | null; overUnder: number | null }[];
}

export function parseLines(raw: RawLineGame[]): Map<number, LineSummary> {
  return new Map(raw.map((g) => [g.id, summarizeLines(g.lines ?? [])]));
}

interface RawAdv {
  gameId: number;
  team: string;
  offense: { plays: number | null; ppa: number | null; successRate: number | null };
}

export function parseAdv(raw: RawAdv[]): AdvRow[] {
  return raw.map((r) => ({
    gameId: r.gameId,
    team: r.team,
    offPlays: r.offense?.plays ?? null,
    offPpa: r.offense?.ppa ?? null,
    offSuccess: r.offense?.successRate ?? null,
  }));
}

interface RawWeather {
  id: number;
  gameIndoors: boolean | null;
  temperature: number | null;
  windSpeed: number | null;
  precipitation: number | null;
}

export function parseWeather(raw: RawWeather[]): Map<number, Weather> {
  return new Map(
    raw.map((w) => [
      w.id,
      { indoors: w.gameIndoors, temperature: w.temperature, windSpeed: w.windSpeed, precipitation: w.precipitation },
    ])
  );
}

// ------------------------------------------------------------------ fetchers (one CFBD call each)
export async function fetchModelSeasonData(season: number, includePostseason: boolean) {
  const [games, post, lines, adv, weather] = await Promise.all([
    cfbdFetch<RawGame[]>("/games", { year: season, classification: "fbs" }),
    includePostseason
      ? cfbdFetch<RawGame[]>("/games", { year: season, classification: "fbs", seasonType: "postseason" })
      : Promise.resolve([] as RawGame[]),
    cfbdFetch<RawLineGame[]>("/lines", { year: season }),
    cfbdFetch<RawAdv[]>("/stats/game/advanced", { year: season }),
    cfbdFetch<RawWeather[]>("/games/weather", { year: season }),
  ]);
  return {
    games: parseGames([...games, ...post]),
    lines: parseLines(lines),
    adv: parseAdv(adv),
    weather: parseWeather(weather),
  };
}
