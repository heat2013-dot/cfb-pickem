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
