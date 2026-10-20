"use client";

import { fmtPoints } from "@/lib/ranking";
import type { RankingRow } from "@/lib/types";

/**
 * Podest (Plätze 1–3, Gleichstände teilen sich einen Platz) + vollständige Tabelle.
 * `rounds` optional für Punkte pro Runde.
 */
export function Podium({
  ranking,
  rounds,
  highlightTeamId,
  compact = false,
}: {
  ranking: RankingRow[];
  rounds?: { id: string; label: string }[];
  highlightTeamId?: string;
  /** Beamer: keine Tabelle, restliche Plätze als kompakte Zeile */
  compact?: boolean;
}) {
  const byRank = (r: number) => ranking.filter((x) => x.rank === r);
  // Ränge der ersten drei unterschiedlichen Plätze
  const distinct = [...new Set(ranking.map((r) => r.rank))].slice(0, 3);
  const places = distinct.map((rank, i) => ({ rank, teams: byRank(rank), cls: `p${i + 1}` }));
  const order = [places[1], places[0], places[2]]; // 2 – 1 – 3

  if (ranking.length === 0) return <p className="muted center">Keine Teams.</p>;

  return (
    <div className="stack-lg">
      <div className="podium">
        {order.map((p, i) =>
          p ? (
            <div key={p.cls} className={`place ${p.cls}`}>
              {p.cls === "p1" && <div className="crown" aria-hidden>👑</div>}
              <div className="names">{p.teams.map((t) => t.name).join(" & ")}</div>
              <div className="pts">{fmtPoints(p.teams[0].total)} {p.teams[0].total === 1 ? "Punkt" : "Punkte"}</div>
              <div className="block">{p.rank}</div>
            </div>
          ) : (
            <div key={`empty-${i}`} />
          ),
        )}
      </div>

      {compact && (() => {
        const onPodium = new Set(places.flatMap((p) => p.teams.map((t) => t.teamId)));
        const rest = ranking.filter((r) => !onPodium.has(r.teamId));
        return rest.length > 0 ? (
          <div className="podium-rest">
            {rest.map((r) => (
              <span key={r.teamId}><strong>{r.rank}.</strong> {r.name} <span className="muted">· {fmtPoints(r.total)}</span></span>
            ))}
          </div>
        ) : null;
      })()}

      {!compact && <div className="card table-scroll">
        <table className="rank-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th>Team</th>
              {rounds?.map((r) => <th key={r.id}>{r.label}</th>)}
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.teamId} className={r.teamId === highlightTeamId ? "me" : undefined}>
                <td>{r.rank}.</td>
                <td>{r.name}</td>
                {rounds?.map((rd) => <td key={rd.id}>{fmtPoints(r.perRound[rd.id] ?? 0)}</td>)}
                <td><strong>{fmtPoints(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
