/**
 * Grades a single pick against a final score. Returns null for a push
 * (result landed exactly on the line) — pushes award no points to anyone.
 */
export function gradePick(params: {
  betType: string;
  side: string;
  homeScore: number;
  awayScore: number;
  spread: number | null;
  overUnder: number | null;
}): boolean | null {
  const { betType, side, homeScore, awayScore, spread, overUnder } = params;

  if (betType === "spread") {
    if (spread == null) return null;
    const margin = homeScore - awayScore;
    if (margin === -spread) return null;
    const homeCovered = margin > -spread;
    return side === "home" ? homeCovered : !homeCovered;
  }

  if (betType === "total") {
    if (overUnder == null) return null;
    const total = homeScore + awayScore;
    if (total === overUnder) return null;
    const wentOver = total > overUnder;
    return side === "over" ? wentOver : !wentOver;
  }

  return null;
}

export type SpreadResult = "home" | "away" | "push" | null;
export type TotalResult = "over" | "under" | "push" | null;

/** The actual against-the-spread and over/under outcome for a finished game. */
export function computeGameResult(params: {
  homeScore: number | null;
  awayScore: number | null;
  spread: number | null;
  overUnder: number | null;
}): { spreadResult: SpreadResult; totalResult: TotalResult } {
  const { homeScore, awayScore, spread, overUnder } = params;

  let spreadResult: SpreadResult = null;
  if (homeScore != null && awayScore != null && spread != null) {
    const margin = homeScore - awayScore;
    spreadResult = margin === -spread ? "push" : margin > -spread ? "home" : "away";
  }

  let totalResult: TotalResult = null;
  if (homeScore != null && awayScore != null && overUnder != null) {
    const total = homeScore + awayScore;
    totalResult = total === overUnder ? "push" : total > overUnder ? "over" : "under";
  }

  return { spreadResult, totalResult };
}
