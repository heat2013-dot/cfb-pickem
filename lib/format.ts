export function formatSpread(value: number): string {
  if (value === 0) return "PK";
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatRank(rank: number | null): string {
  return rank ? `#${rank} ` : "";
}
