import type { RankingRow } from "./types";

/** Sorts by total (desc) and assigns competition ranks (1, 2, 2, 4 …). */
export function rankTeams(rows: Omit<RankingRow, "rank">[]): RankingRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "de"));
  let lastTotal = Number.NaN;
  let lastRank = 0;
  return sorted.map((r, i) => {
    const rank = r.total === lastTotal ? lastRank : i + 1;
    lastTotal = r.total;
    lastRank = rank;
    return { ...r, rank };
  });
}

export function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
