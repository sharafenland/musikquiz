"use client";

import { fmtPoints } from "@/lib/ranking";
import type { HostAction, HostRound, HostState } from "@/lib/types";
import { Grading } from "./Grading";

const STATUS_LABEL: Record<HostRound["status"], { text: string; cls: string }> = {
  pending: { text: "Noch nicht gestartet", cls: "badge" },
  active: { text: "Läuft", cls: "badge live" },
  grading: { text: "Auswertung", cls: "badge accent" },
  done: { text: "Ausgewertet", cls: "badge ok" },
};

export function LivePanel({
  state,
  hash,
  hostKey,
  act,
  busy,
  onError,
  showNotes,
}: {
  state: HostState;
  hash: string;
  hostKey: string;
  act: (a: HostAction, confirmText?: string) => void;
  busy: boolean;
  onError: (msg: string) => void;
  showNotes: boolean;
}) {
  const teamName = (id: string) => state.teams.find((t) => t.id === id)?.name ?? "?";
  const songLabel = (id: string) => {
    for (const r of state.rounds)
      for (const s of r.songs) if (s.id === id) return `R${r.position + 1} · Song ${s.position + 1}${showNotes && s.hostNote ? ` (${s.hostNote})` : ""}`;
    return "Song";
  };
  const activeRound = state.rounds.find((r) => r.status === "active");
  const grading = state.rounds.filter((r) => r.status === "grading");
  const allDone = state.rounds.every((r) => r.status === "done");
  const nextPending = state.rounds.find((r) => r.status === "pending");

  return (
    <div className="host-grid">
      <div className="stack-lg">
        {/* Aktuelle Runde zuerst, dann Auswertungen, dann die Übersicht */}
        {activeRound && <ActiveRound round={activeRound} state={state} act={act} busy={busy} showNotes={showNotes} />}

        {grading.map((r) => (
          <Grading
            key={r.id}
            state={state}
            round={r}
            hash={hash}
            hostKey={hostKey}
            onError={onError}
            onComplete={() => act({ type: "complete_grading", roundId: r.id })}
            onReopen={() => act({ type: "reopen_round", roundId: r.id }, "Runde wieder öffnen? Teams können dann weiter hören und antworten.")}
          />
        ))}

        {!activeRound && grading.length === 0 && nextPending && (
          <section className="card accent stack">
            <h2>Bereit für Runde {nextPending.position + 1}{nextPending.title ? `: ${nextPending.title}` : ""}</h2>
            <p className="muted">
              {state.teams.length} Team(s) verbunden · {nextPending.songs.length} Songs in dieser Runde.
            </p>
            <div>
              <button className="btn primary lg" disabled={busy} onClick={() => act({ type: "start_round", roundId: nextPending.id })}>
                ▶ Runde {nextPending.position + 1} starten
              </button>
            </div>
          </section>
        )}

        {allDone && (
          <section className="card accent stack">
            <h2>Alle Runden ausgewertet 🎉</h2>
            <p className="muted">Jetzt das Podest an alle Teams schicken.</p>
            <div>
              <button className="btn primary lg" disabled={busy} onClick={() => act({ type: "finish_quiz" }, "Quiz beenden und Podest bei allen Teams anzeigen?")}>
                🏆 Podest zeigen
              </button>
            </div>
          </section>
        )}

        <section className="card stack">
          <h3>Rundenübersicht</h3>
          <ul className="list">
            {state.rounds.map((r) => (
              <li key={r.id}>
                <span className="grow">
                  <strong>Runde {r.position + 1}</strong>
                  {r.title && <span className="muted"> · {r.title}</span>}
                  <span className="faint small"> · {r.songs.length} Songs</span>
                </span>
                <span className={STATUS_LABEL[r.status].cls}>{STATUS_LABEL[r.status].text}</span>
                {r.status === "pending" && !activeRound && (
                  <button className="btn sm" disabled={busy} onClick={() => act({ type: "start_round", roundId: r.id })}>Starten</button>
                )}
                {r.status === "done" && (
                  <button className="btn ghost sm" disabled={busy} onClick={() => act({ type: "reopen_grading", roundId: r.id })}>Korrigieren</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="stack-lg sticky">
        <section className={`card stack${state.requests.length ? " accent" : ""}`}>
          <div className="row between">
            <h3>Erneut hören</h3>
            {state.requests.length > 0 && <span className="badge live">{state.requests.length}</span>}
          </div>
          {state.requests.length === 0 ? (
            <p className="muted small">Keine offenen Anfragen.</p>
          ) : (
            <ul className="list">
              {state.requests.map((rq) => (
                <li key={rq.id} style={{ flexWrap: "wrap" }}>
                  <span className="grow">
                    <strong>{teamName(rq.teamId)}</strong>
                    <br />
                    <span className="small muted">{songLabel(rq.songId)}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn ok sm" disabled={busy} onClick={() => act({ type: "approve_replay", requestId: rq.id })}>Freigeben</button>
                    <button className="btn ghost sm" disabled={busy} onClick={() => act({ type: "deny_replay", requestId: rq.id })}>Ablehnen</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack">
          <div className="row between">
            <h3>Teams & Stand</h3>
            <span className="badge">{state.teams.length}</span>
          </div>
          {state.ranking.length === 0 ? (
            <p className="muted small">Noch niemand beigetreten.</p>
          ) : (
            <ul className="list">
              {state.ranking.map((r) => (
                <li key={r.teamId}>
                  <span className="faint small" style={{ width: 22 }}>{r.rank}.</span>
                  <span className="grow" style={{ overflowWrap: "anywhere" }}>{r.name}</span>
                  <strong>{fmtPoints(r.total)}</strong>
                  <button
                    className="btn ghost icon-btn"
                    title="Team entfernen"
                    disabled={busy}
                    onClick={() => act({ type: "remove_team", teamId: r.teamId }, `Team „${r.name}“ entfernen? Antworten und Punkte gehen verloren.`)}
                  >✕</button>
                </li>
              ))}
            </ul>
          )}
          <p className="faint small">Punkte zählen erst, wenn eine Runde ausgewertet wird.</p>
        </section>
      </aside>
    </div>
  );
}

function ActiveRound({ round, state, act, busy, showNotes }: { round: HostRound; state: HostState; act: LivePanelAct; busy: boolean; showNotes: boolean }) {
  const unlocked = round.unlockedCount;
  const next = round.songs[unlocked];
  const playsFor = (songId: string) => state.plays.filter((p) => p.songId === songId);
  const answeredFor = (songId: string) => {
    const qIds = new Set(round.songs.find((s) => s.id === songId)?.questions.map((q) => q.id));
    return new Set(state.answers.filter((a) => qIds.has(a.questionId) && a.text.trim()).map((a) => a.teamId)).size;
  };

  return (
    <section className="card accent stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="badge live" style={{ alignSelf: "flex-start" }}>Läuft</span>
          <h2>Runde {round.position + 1}{round.title ? `: ${round.title}` : ""}</h2>
        </div>
        <button
          className="btn danger"
          disabled={busy}
          onClick={() =>
            act(
              { type: "close_round", roundId: round.id },
              unlocked < round.songs.length
                ? `Erst ${unlocked} von ${round.songs.length} Songs freigeschaltet. Runde trotzdem beenden?`
                : "Runde beenden? Teams können danach nicht mehr antworten.",
            )
          }
        >
          Runde beenden
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {round.songs.map((s, i) => {
          const isUnlocked = i < unlocked;
          const isNext = i === unlocked;
          const plays = playsFor(s.id);
          return (
            <div key={s.id} className={`song-line${isUnlocked ? " unlocked" : " locked"}${isNext ? " next" : ""}`}>
              <span className="song-no">{i + 1}</span>
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ overflowWrap: "anywhere" }}>{showNotes && s.hostNote ? s.hostNote : <span className="faint">Song {i + 1}</span>}</span>
                {isUnlocked && state.teams.length > 0 && (
                  <span className="row small muted" style={{ gap: 8 }}>
                    <span className="dots" title="Grün = gehört, blau = zusätzlich freigegeben">
                      {state.teams.map((t) => {
                        const p = plays.find((x) => x.teamId === t.id);
                        return <span key={t.id} title={t.name} className={`dot${p && p.used > 0 ? (p.granted > 1 ? " extra" : " played") : ""}`} />;
                      })}
                    </span>
                    {plays.filter((p) => p.used > 0).length}/{state.teams.length} gehört · {answeredFor(s.id)}/{state.teams.length} antworten
                  </span>
                )}
              </span>
              <span className="small faint">{s.questions.length} Fr.</span>
            </div>
          );
        })}
      </div>

      {next ? (
        <button className="btn primary lg" disabled={busy} onClick={() => act({ type: "unlock_next", roundId: round.id })}>
          🔓 Song {unlocked + 1} freischalten{showNotes && next.hostNote ? ` – ${next.hostNote}` : ""}
        </button>
      ) : (
        <div className="alert info">Alle Songs sind freigeschaltet. Wenn alle Teams fertig sind: „Runde beenden“.</div>
      )}
    </section>
  );
}

type LivePanelAct = (a: HostAction, confirmText?: string) => void;
