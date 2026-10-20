"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Podium } from "@/components/Podium";
import { TopBar, useToasts } from "@/components/ui";
import { api, ApiError, teamStore, type TeamSession } from "@/lib/client/api";
import { useLive } from "@/lib/client/useLive";
import { useQuizTheme } from "@/lib/client/useQuizTheme";
import { useYouTubeAudio, type Playback } from "@/lib/client/useYouTubeAudio";
import { fmtPoints } from "@/lib/ranking";
import type { TeamSong, TeamState } from "@/lib/types";

export default function PlayPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const [session, setSession] = useState<TeamSession | null | undefined>(undefined);
  useEffect(() => setSession(teamStore.get(hash)), [hash]);

  if (session === undefined) return null;
  if (!session) return <NotJoined />;
  return <TeamView hash={hash} session={session} onLost={() => { teamStore.set(hash, null); setSession(null); }} />;
}

function NotJoined() {
  return (
    <main className="wrap narrow">
      <TopBar />
      <div className="card waiting stack">
        <div className="big" aria-hidden>🎧</div>
        <h2>Ihr seid diesem Quiz noch nicht beigetreten</h2>
        <p className="muted">Gebt den Zugangscode vom Host ein, um mitzuspielen.</p>
        <div><Link className="btn primary" href="/join">Zum Beitreten</Link></div>
      </div>
    </main>
  );
}

function TeamView({ hash, session, onLost }: { hash: string; session: TeamSession; onLost: () => void }) {
  const toasts = useToasts();
  const yt = useYouTubeAudio();
  const load = useCallback(
    () => api<TeamState>(`/api/team/${hash}`, { teamToken: session.token }),
    [hash, session.token],
  );
  const { data: state, error, reload, realtime } = useLive(load, (d) => d.quiz.id, ["all"]);
  useQuizTheme(state?.quiz.theme);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onLost();
  }, [error, onLost]);

  const busy = yt.playback.phase === "loading" || yt.playback.phase === "playing";

  const onPlay = (song: TeamSong) => {
    if (!state || !song.videoId || busy) return;
    // synchron im Klick starten (Autoplay-Regeln auf Mobilgeräten), Server parallel zählen lassen
    if (!yt.play(song.id, song.videoId, song.startSeconds ?? 0, state.quiz.playSeconds)) {
      toasts.push("Der Player lädt noch – bitte gleich nochmal versuchen.");
      return;
    }
    api(`/api/team/${hash}/play`, { method: "POST", body: { songId: song.id }, teamToken: session.token })
      .catch((e: Error) => {
        yt.abort();
        toasts.push(e.message);
      })
      .finally(() => void reload());
  };

  const onReplay = async (song: TeamSong) => {
    try {
      await api(`/api/team/${hash}/replay`, { method: "POST", body: { songId: song.id }, teamToken: session.token });
      toasts.push("Anfrage geschickt – der Host entscheidet.", true);
    } catch (e) {
      toasts.push((e as Error).message);
    }
    void reload();
  };

  return (
    <main className="wrap narrow">
      <TopBar>
        <span className="badge accent">{session.name}</span>
        {!realtime && state && <span className="badge" title="Aktualisiert alle paar Sekunden">Polling</span>}
      </TopBar>
      <div ref={yt.mountRef} className="yt-hidden" aria-hidden />

      {!state ? (
        error ? <div className="alert">{error.message}</div> : <p className="muted">Lade …</p>
      ) : (
        <div className="stack-lg">
          <header className="stack">
            <p className="muted small">{state.quiz.title}</p>
            {state.round && (
              <h1>
                Runde {state.round.position + 1}
                {state.round.title ? `: ${state.round.title}` : ""}
              </h1>
            )}
          </header>
          <TeamBody state={state} hash={hash} token={session.token} playback={yt.playback} ytReady={yt.ready}
            onPlay={onPlay} onStop={yt.stop} onReplay={onReplay} onError={toasts.push} />
        </div>
      )}
      {yt.playback.phase === "error" && yt.playback.error && (
        <div className="alert" style={{ marginTop: 16 }}>
          {yt.playback.error}. Sag dem Host Bescheid oder frag „Erneut hören“ an.
        </div>
      )}
      {toasts.view}
    </main>
  );
}

function Waiting({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <div className="card waiting stack">
      <div className="big" aria-hidden>{icon}</div>
      <h2>{title}</h2>
      {text && <p className="muted">{text}</p>}
    </div>
  );
}

function TeamBody(props: {
  state: TeamState;
  hash: string;
  token: string;
  playback: Playback;
  ytReady: boolean;
  onPlay: (s: TeamSong) => void;
  onStop: () => void;
  onReplay: (s: TeamSong) => void;
  onError: (msg: string) => void;
}) {
  const { state } = props;

  if (state.quiz.status === "finished" && state.podium) {
    const me = state.podium.find((r) => r.teamId === state.team.id);
    return (
      <div className="stack-lg">
        <div className="center stack">
          <h1>Endstand 🏆</h1>
          {me && (
            <p className="muted">
              Ihr seid auf Platz <strong style={{ color: "var(--accent)" }}>{me.rank}</strong> mit {fmtPoints(me.total)} {me.total === 1 ? "Punkt" : "Punkten"}.
            </p>
          )}
        </div>
        <Podium ranking={state.podium} highlightTeamId={state.team.id} />
      </div>
    );
  }

  if (!state.round) {
    return <Waiting icon="🍻" title="Ihr seid drin!" text="Warten, bis der Host die erste Runde startet …" />;
  }

  const r = state.round;
  if (r.status === "done") {
    return <Waiting icon="✅" title={`Runde ${r.position + 1} ist ausgewertet`} text={r.position + 1 < state.quiz.roundCount ? "Gleich geht’s mit der nächsten Runde weiter." : "Gleich gibt’s den Endstand."} />;
  }

  const active = r.status === "active";
  return (
    <div className="stack-lg">
      {!active && (
        <div className="alert info">Runde beendet – der Host wertet gerade aus. Antworten sind gesperrt.</div>
      )}
      {r.songs.length === 0 && active && (
        <Waiting icon="🎵" title="Gleich geht’s los" text="Der Host schaltet gleich den ersten Song frei." />
      )}
      {r.songs.map((s, i) => (
        <SongCard key={s.id} {...props} song={s} active={active} isNewest={active && i === r.songs.length - 1} />
      ))}
      {active && r.songs.length > 0 && (
        <p className="muted small center">
          {r.songs.length} von {r.songCount} Songs freigeschaltet
          {r.songs.length < r.songCount ? " – der nächste kommt vom Host." : "."}
        </p>
      )}
    </div>
  );
}

function SongCard({
  song, active, isNewest, state, playback, ytReady, onPlay, onStop, onReplay, hash, token, onError,
}: {
  song: TeamSong;
  active: boolean;
  isNewest: boolean;
  state: TeamState;
  playback: Playback;
  ytReady: boolean;
  onPlay: (s: TeamSong) => void;
  onStop: () => void;
  onReplay: (s: TeamSong) => void;
  hash: string;
  token: string;
  onError: (msg: string) => void;
}) {
  const mine = playback.key === song.id;
  const playing = mine && (playback.phase === "loading" || playback.phase === "playing");
  const othersBusy = !mine && (playback.phase === "loading" || playback.phase === "playing");
  const left = song.granted - song.used;
  const canPlay = active && !!song.videoId && left > 0;
  const R = 41;
  const C = 2 * Math.PI * R;

  return (
    <section className={`card stack${isNewest && song.used === 0 ? " accent new-flag" : ""}`}>
      <div className="play-card">
        <button
          className="play-btn"
          aria-label={playing ? "Stopp" : "Abspielen"}
          disabled={!playing && (!canPlay || othersBusy || !ytReady)}
          onClick={() => (playing ? onStop() : onPlay(song))}
        >
          {playing && (
            <svg className="ring" viewBox="0 0 94 94" aria-hidden>
              <circle className="track" cx="47" cy="47" r={R} />
              <circle className="bar" cx="47" cy="47" r={R} strokeDasharray={C}
                strokeDashoffset={C * (1 - playback.progress)} transform="rotate(-90 47 47)" />
            </svg>
          )}
          {playing ? (
            playback.phase === "loading" ? "…" : <span className="eq" aria-hidden><span /><span /><span /><span /></span>
          ) : canPlay ? "▶" : "✓"}
        </button>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <h2>Song {song.position + 1}</h2>
            {isNewest && song.used === 0 && <span className="badge accent">Neu</span>}
          </div>
          <p className="muted small">
            {playing
              ? playback.phase === "loading"
                ? "Lädt …"
                : `Noch ${playback.remaining} s`
              : !active
                ? `${song.used}× gehört`
                : canPlay
                  ? left > 1 || song.granted > 1
                    ? `Freigegeben – noch ${left}× (${state.quiz.playSeconds} s)`
                    : `Einmal anhören (${state.quiz.playSeconds} s)`
                  : song.replay === "pending"
                    ? "Erneut hören angefragt – warte auf den Host …"
                    : song.replay === "denied"
                      ? "Erneut hören wurde abgelehnt."
                      : "Gehört."}
          </p>
          {active && !canPlay && !playing && song.replay !== "pending" && (
            <div>
              <button className="btn sm" onClick={() => onReplay(song)}>🔁 Erneut hören anfragen</button>
            </div>
          )}
        </div>
      </div>

      <div className="stack">
        {song.questions.map((q, qi) => (
          <AnswerField key={q.id} q={q} index={qi} editable={active} hash={hash} token={token} onError={onError} />
        ))}
      </div>
    </section>
  );
}

function AnswerField({
  q, index, editable, hash, token, onError,
}: {
  q: TeamSong["questions"][number];
  index: number;
  editable: boolean;
  hash: string;
  token: string;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState(q.answer);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(q.answer);

  // Serverwert übernehmen, solange lokal nichts Ungespeichertes ansteht
  useEffect(() => {
    if (status === "saved" && q.answer !== lastSaved.current) {
      setValue(q.answer);
      lastSaved.current = q.answer;
    }
  }, [q.answer, status]);

  const save = useMemo(
    () => async (text: string) => {
      if (text === lastSaved.current) return setStatus("saved");
      setStatus("saving");
      try {
        await api(`/api/team/${hash}/answer`, { method: "PUT", body: { questionId: q.id, text }, teamToken: token });
        lastSaved.current = text;
        setStatus("saved");
      } catch (e) {
        setStatus("dirty");
        onError((e as Error).message);
      }
    },
    [hash, q.id, token, onError],
  );

  return (
    <label className="field">
      <span className="row between">
        <span>
          {index + 1}. {q.text}
        </span>
        <span className="faint small">
          {fmtPoints(q.maxPoints)} {q.maxPoints === 1 ? "Punkt" : "Punkte"}
          {editable && (status === "saving" ? " · speichert …" : status === "dirty" ? " · ungespeichert" : value ? " · ✓" : "")}
        </span>
      </span>
      <input
        className="input"
        value={value}
        disabled={!editable}
        placeholder={editable ? "Eure Antwort" : "—"}
        maxLength={500}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setStatus("dirty");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(v), 700);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          void save(value);
        }}
      />
    </label>
  );
}
