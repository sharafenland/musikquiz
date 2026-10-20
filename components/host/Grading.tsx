"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, parseDecimal } from "@/lib/client/api";
import { fmtPoints } from "@/lib/ranking";
import type { HostRound, HostState } from "@/lib/types";

type ScoreMap = Record<string, number | null>;
const k = (teamId: string, questionId: string) => `${teamId}:${questionId}`;

export function Grading({
  state,
  round,
  hash,
  hostKey,
  onError,
  onComplete,
  onReopen,
}: {
  state: HostState;
  round: HostRound;
  hash: string;
  hostKey: string;
  onError: (msg: string) => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  const questionIds = useMemo(() => new Set(round.songs.flatMap((s) => s.questions.map((q) => q.id))), [round]);
  const server = useMemo(() => {
    const m: ScoreMap = {};
    for (const s of state.scores) if (questionIds.has(s.questionId)) m[k(s.teamId, s.questionId)] = s.points;
    return m;
  }, [state.scores, questionIds]);
  const [local, setLocal] = useState<ScoreMap>({});
  const pending = useRef(new Set<string>());

  // Lokale Werte verwerfen, sobald der Server sie bestätigt hat
  useEffect(() => {
    setLocal((cur) => {
      const next: ScoreMap = {};
      for (const [key, v] of Object.entries(cur)) if (pending.current.has(key) || server[key] !== v) next[key] = v;
      return next;
    });
  }, [server]);

  const value = (key: string): number | null | undefined => (key in local ? local[key] : server[key]);

  const answers = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of state.answers) m[k(a.teamId, a.questionId)] = a.text;
    return m;
  }, [state.answers]);

  const setScore = async (teamId: string, questionId: string, points: number | null) => {
    const key = k(teamId, questionId);
    setLocal((c) => ({ ...c, [key]: points }));
    pending.current.add(key);
    try {
      await api(`/api/host/${hash}/score`, { method: "PUT", body: { teamId, questionId, points }, hostKey });
    } catch (e) {
      onError((e as Error).message);
      setLocal((c) => {
        const n = { ...c };
        delete n[key];
        return n;
      });
    } finally {
      pending.current.delete(key);
    }
  };

  const total = state.teams.length * questionIds.size;
  let graded = 0;
  for (const t of state.teams) for (const q of questionIds) if (value(k(t.id, q)) != null) graded++;

  const roundTotals = state.teams.map((t) => {
    let sum = 0;
    for (const q of questionIds) sum += value(k(t.id, q)) ?? 0;
    return { team: t, sum };
  });

  return (
    <div className="stack-lg">
      <div className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <div className="stack" style={{ gap: 2 }}>
            <h2>Auswertung Runde {round.position + 1}</h2>
            <p className="muted small">
              {graded} von {total} Antworten bewertet · Teilpunkte erlaubt (z. B. 0,5)
            </p>
          </div>
          <div className="row">
            <button className="btn sm" onClick={onReopen} title="Runde wieder öffnen, damit Teams weiter antworten/hören können">
              Runde wieder öffnen
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const missing = total - graded;
                if (missing > 0 && !confirm(`${missing} Feld(er) sind noch leer und werden als 0 Punkte gewertet. Runde abschließen?`)) return;
                onComplete();
              }}
            >
              Runde abschließen ✓
            </button>
          </div>
        </div>
        {state.teams.length > 0 && (
          <div className="row small">
            {roundTotals.map(({ team, sum }) => (
              <span key={team.id} className="badge">{team.name}: {fmtPoints(sum)}</span>
            ))}
          </div>
        )}
      </div>

      {state.teams.length === 0 && <p className="muted">Keine Teams – nichts zu bewerten.</p>}

      {state.teams.length > 0 &&
        round.songs.map((s) => (
          <section key={s.id} className="card stack">
            <div className="row">
              <span className="badge accent">Song {s.position + 1}</span>
              <strong>{s.hostNote || <span className="faint">ohne Notiz</span>}</strong>
            </div>
            {s.questions.map((q) => (
              <div key={q.id} className="grade-q stack" style={{ gap: 4 }}>
                <div className="row between">
                  <strong>{q.text}</strong>
                  <span className="small muted">max. {fmtPoints(q.maxPoints)}</span>
                </div>
                {q.solution && <div className="small" style={{ color: "var(--ok)" }}>Lösung: {q.solution}</div>}
                {state.teams.map((t) => (
                  <GradeRow
                    key={t.id}
                    teamName={t.name}
                    answer={answers[k(t.id, q.id)] ?? ""}
                    max={q.maxPoints}
                    value={value(k(t.id, q.id))}
                    onSet={(p) => void setScore(t.id, q.id, p)}
                  />
                ))}
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}

function GradeRow({
  teamName, answer, max, value, onSet,
}: {
  teamName: string;
  answer: string;
  max: number;
  value: number | null | undefined;
  onSet: (p: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : fmtPoints(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : fmtPoints(value));
  }, [value]);

  const quick = [...new Set([0, max / 2, max])].filter((x) => x >= 0);
  const parsed = parseDecimal(text);
  const bad = parsed !== null && (Number.isNaN(parsed) || parsed > max);

  const commit = () => {
    if (bad) return;
    if (parsed !== (value ?? null)) onSet(parsed);
  };

  return (
    <div className="grade-row">
      <span className="small" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{teamName}</span>
      <span className={`ans${answer.trim() ? "" : " empty"}`}>{answer.trim() || "keine Antwort"}</span>
      <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <span className="seg">
          {quick.map((p) => (
            <button key={p} type="button" className={`${value === p ? "on" : ""}${p === 0 ? " zero" : ""}`} onClick={() => onSet(p)}>
              {fmtPoints(p)}
            </button>
          ))}
        </span>
        <input
          className={`input num${bad ? " invalid" : ""}`}
          style={{ width: 62, padding: "6px 8px" }}
          value={text}
          inputMode="decimal"
          placeholder="–"
          aria-label={`Punkte für ${teamName}`}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </span>
    </div>
  );
}
