"use client";

import { useEffect, useState } from "react";
import { parseDecimal } from "@/lib/client/api";
import type { Playback } from "@/lib/client/useYouTubeAudio";
import { fmtPoints } from "@/lib/ranking";
import type { HostState, QuestionInput, RoundInput, SongInput, StructureInput, TemplateQuestion } from "@/lib/types";
import { parseYouTube, thumbnailUrl } from "@/lib/youtube";

const uid = () => crypto.randomUUID();

const newQuestion = (text = "", maxPoints = 1): QuestionInput => ({ id: uid(), text, maxPoints, solution: "" });
const newTemplateQuestion = (text = "", maxPoints = 1): TemplateQuestion => ({ id: uid(), text, maxPoints });
const usableTemplate = (tpl: TemplateQuestion[]) => tpl.filter((t) => t.text.trim());

/** Neuer Song – mit den Standardfragen der Runde, sonst mit den üblichen zwei Fragen. */
const newSong = (template: TemplateQuestion[] = []): SongInput => {
  const tpl = usableTemplate(template);
  return {
    id: uid(),
    youtubeUrl: "",
    startSeconds: 0,
    hostNote: "",
    questions: tpl.length
      ? tpl.map((t) => newQuestion(t.text.trim(), t.maxPoints))
      : [newQuestion("Wer singt das?"), newQuestion("Wie heißt der Song?")],
  };
};
export const newRound = (): RoundInput => {
  const questionTemplate = [newTemplateQuestion("Wer singt das?"), newTemplateQuestion("Wie heißt der Song?")];
  return { id: uid(), title: "", questionTemplate, songs: [newSong(questionTemplate)] };
};

/**
 * Standardfragen auf einen bestehenden Song anwenden: Fragen mit gleichem Text werden
 * übernommen (inkl. Lösung) und bekommen die Punkte der Vorlage, fehlende kommen dazu,
 * zusätzliche Fragen des Songs bleiben hinten erhalten.
 */
function applyTemplate(song: SongInput, template: TemplateQuestion[]): SongInput {
  const rest = [...song.questions];
  const fromTemplate = usableTemplate(template).map((t) => {
    const i = rest.findIndex((q) => q.text.trim() === t.text.trim());
    if (i < 0) return newQuestion(t.text.trim(), t.maxPoints);
    const [q] = rest.splice(i, 1);
    return { ...q, maxPoints: t.maxPoints };
  });
  return { ...song, questions: [...fromTemplate, ...rest] };
}

export function toStructure(s: HostState): StructureInput {
  return {
    title: s.quiz.title,
    playSeconds: s.quiz.playSeconds,
    rounds: s.rounds.map((r) => ({
      id: r.id,
      title: r.title,
      questionTemplate: r.questionTemplate.map((t) => ({ ...t })),
      songs: r.songs.map((so) => ({
        id: so.id,
        youtubeUrl: so.youtubeUrl,
        startSeconds: so.startSeconds,
        hostNote: so.hostNote,
        questions: so.questions.map((q) => ({ id: q.id, text: q.text, maxPoints: q.maxPoints, solution: q.solution })),
      })),
    })),
  };
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Findet das erste Problem, das das Speichern/Live-Schalten verhindern würde. */
export function validate(s: StructureInput): string | null {
  if (s.rounds.length === 0) return "Lege mindestens eine Runde an.";
  for (const [ri, r] of s.rounds.entries()) {
    if (r.songs.length === 0) return `Runde ${ri + 1} hat keine Songs.`;
    for (const [si, so] of r.songs.entries()) {
      if (!parseYouTube(so.youtubeUrl)) return `Runde ${ri + 1}, Song ${si + 1}: YouTube-Link fehlt oder ist ungültig.`;
      if (so.questions.length === 0) return `Runde ${ri + 1}, Song ${si + 1}: mindestens eine Frage nötig.`;
      for (const [qi, q] of so.questions.entries())
        if (!q.text.trim()) return `Runde ${ri + 1}, Song ${si + 1}, Frage ${qi + 1}: Fragetext fehlt.`;
    }
  }
  return null;
}

export function Editor({
  value,
  onChange,
  playback,
  ytReady,
  onPreview,
  onStopPreview,
}: {
  value: StructureInput;
  onChange: (v: StructureInput) => void;
  playback: Playback;
  ytReady: boolean;
  onPreview: (key: string, videoId: string, start: number, seconds: number) => void;
  onStopPreview: () => void;
}) {
  const set = (patch: Partial<StructureInput>) => onChange({ ...value, ...patch });
  const setRound = (ri: number, r: RoundInput) => set({ rounds: value.rounds.map((x, i) => (i === ri ? r : x)) });
  const totalPoints = value.rounds.reduce(
    (a, r) => a + r.songs.reduce((b, s) => b + s.questions.reduce((c, q) => c + (q.maxPoints || 0), 0), 0),
    0,
  );
  const totalSongs = value.rounds.reduce((a, r) => a + r.songs.length, 0);

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>Einstellungen</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field grow">
            Titel
            <input className="input" value={value.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field" style={{ width: 170 }}>
            Abspieldauer (Sek.)
            <input
              className="input"
              type="number"
              min={3}
              max={600}
              value={value.playSeconds}
              onChange={(e) => set({ playSeconds: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="faint small">
          {value.rounds.length} Runden · {totalSongs} Songs · {fmtPoints(totalPoints)} Punkte insgesamt.
          Jeder Song spielt bei den Teams {value.playSeconds || "?"} Sekunden ab der Startzeit.
        </p>
      </section>

      {value.rounds.map((r, ri) => (
        <section key={r.id} className="card round-card stack">
          <div className="card-head" style={{ marginBottom: 0 }}>
            <div className="row grow">
              <span className="badge accent">Runde {ri + 1}</span>
              <input
                className="input grow"
                style={{ maxWidth: 420 }}
                value={r.title}
                placeholder="Rundentitel (optional), z. B. One-Hit-Wonder"
                maxLength={120}
                onChange={(e) => setRound(ri, { ...r, title: e.target.value })}
              />
            </div>
            <div className="row">
              <button className="btn ghost icon-btn" title="Nach oben" disabled={ri === 0} onClick={() => set({ rounds: move(value.rounds, ri, -1) })}>↑</button>
              <button className="btn ghost icon-btn" title="Nach unten" disabled={ri === value.rounds.length - 1} onClick={() => set({ rounds: move(value.rounds, ri, 1) })}>↓</button>
              <button
                className="btn ghost icon-btn"
                title="Runde löschen"
                onClick={() => confirm(`Runde ${ri + 1} mit allen Songs löschen?`) && set({ rounds: value.rounds.filter((_, i) => i !== ri) })}
              >✕</button>
            </div>
          </div>

          <TemplateEditor
            template={r.questionTemplate}
            songCount={r.songs.length}
            onChange={(questionTemplate) => setRound(ri, { ...r, questionTemplate })}
            onApply={() => setRound(ri, { ...r, songs: r.songs.map((s) => applyTemplate(s, r.questionTemplate)) })}
          />

          {r.songs.map((s, si) => (
            <SongEditor
              key={s.id}
              song={s}
              index={si}
              count={r.songs.length}
              playSeconds={value.playSeconds}
              playback={playback}
              ytReady={ytReady}
              onPreview={onPreview}
              onStopPreview={onStopPreview}
              onChange={(ns) => setRound(ri, { ...r, songs: r.songs.map((x, i) => (i === si ? ns : x)) })}
              onMove={(dir) => setRound(ri, { ...r, songs: move(r.songs, si, dir) })}
              onDelete={() => setRound(ri, { ...r, songs: r.songs.filter((_, i) => i !== si) })}
            />
          ))}
          <div>
            <button className="btn" onClick={() => setRound(ri, { ...r, songs: [...r.songs, newSong(r.questionTemplate)] })}>+ Song</button>
          </div>
        </section>
      ))}

      <div>
        <button className="btn primary" onClick={() => set({ rounds: [...value.rounds, newRound()] })}>
          + Runde hinzufügen
        </button>
      </div>
    </div>
  );
}

function SongEditor({
  song, index, count, playSeconds, playback, ytReady, onPreview, onStopPreview, onChange, onMove, onDelete,
}: {
  song: SongInput;
  index: number;
  count: number;
  playSeconds: number;
  playback: Playback;
  ytReady: boolean;
  onPreview: (key: string, videoId: string, start: number, seconds: number) => void;
  onStopPreview: () => void;
  onChange: (s: SongInput) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const yt = parseYouTube(song.youtubeUrl);
  const invalid = song.youtubeUrl.trim() !== "" && !yt;
  const mine = playback.key === song.id;
  const previewing = mine && (playback.phase === "loading" || playback.phase === "playing");
  const setQ = (qi: number, q: QuestionInput) => onChange({ ...song, questions: song.questions.map((x, i) => (i === qi ? q : x)) });

  return (
    <div className="song-card stack">
      <div className="row between">
        <strong>Song {index + 1}</strong>
        <div className="row">
          <button className="btn ghost icon-btn" title="Nach oben" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button className="btn ghost icon-btn" title="Nach unten" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button className="btn ghost icon-btn" title="Song löschen" onClick={() => (song.youtubeUrl === "" || confirm("Song löschen?")) && onDelete()}>✕</button>
        </div>
      </div>
      <div className="song-grid">
        <div className="stack" style={{ gap: 8 }}>
          <div className="thumb">
            {yt ? <img src={thumbnailUrl(yt.videoId)} alt="" /> : <span>kein Video</span>}
          </div>
          <button
            className="btn sm"
            disabled={!yt || !ytReady}
            onClick={() => (previewing ? onStopPreview() : yt && onPreview(song.id, yt.videoId, song.startSeconds, playSeconds))}
          >
            {previewing ? (playback.phase === "loading" ? "Lädt …" : `■ ${playback.remaining}s`) : "▶ Vorhören"}
          </button>
          {mine && playback.phase === "error" && <span className="small" style={{ color: "var(--warn)" }}>{playback.error}</span>}
        </div>
        <div className="stack">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field grow">
              YouTube-Link
              <input
                className={`input${invalid ? " invalid" : ""}`}
                value={song.youtubeUrl}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => {
                  const url = e.target.value;
                  const p = parseYouTube(url);
                  const prevStart = parseYouTube(song.youtubeUrl)?.start ?? 0;
                  // Startzeit aus ?t= übernehmen, wenn sie sich im Link geändert hat
                  onChange({ ...song, youtubeUrl: url, startSeconds: p && p.start !== prevStart ? p.start : song.startSeconds });
                }}
              />
            </label>
            <label className="field" style={{ width: 110 }}>
              Start (Sek.)
              <input
                className="input"
                type="number"
                min={0}
                value={song.startSeconds}
                onChange={(e) => onChange({ ...song, startSeconds: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>
          <label className="field">
            Notiz für dich (sehen die Teams nicht)
            <input className="input" value={song.hostNote} maxLength={200} placeholder="z. B. Queen – Bohemian Rhapsody (1975)" onChange={(e) => onChange({ ...song, hostNote: e.target.value })} />
          </label>
          {invalid && <span className="small" style={{ color: "var(--warn)" }}>Das sieht nicht nach einem YouTube-Link aus.</span>}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="q-row faint small" style={{ fontWeight: 600 }}>
          <span />
          <span>Frage</span>
          <span className="sol">Lösung (nur für dich)</span>
          <span className="center">Punkte</span>
          <span />
        </div>
        {song.questions.map((q, qi) => (
          <QuestionRow key={q.id} q={q} index={qi} onChange={(nq) => setQ(qi, nq)}
            onDelete={song.questions.length > 1 ? () => onChange({ ...song, questions: song.questions.filter((_, i) => i !== qi) }) : undefined} />
        ))}
        <div>
          <button className="btn sm" onClick={() => onChange({ ...song, questions: [...song.questions, newQuestion()] })}>+ Frage</button>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({
  template, songCount, onChange, onApply,
}: {
  template: TemplateQuestion[];
  songCount: number;
  onChange: (t: TemplateQuestion[]) => void;
  onApply: () => void;
}) {
  const setT = (ti: number, t: TemplateQuestion) => onChange(template.map((x, i) => (i === ti ? t : x)));
  const usable = usableTemplate(template).length;
  return (
    <div className="sub stack" style={{ gap: 8 }}>
      <div className="stack" style={{ gap: 2 }}>
        <strong>Standardfragen für jeden Song</strong>
        <span className="faint small">
          {usable
            ? "Neue Songs dieser Runde bekommen diese Fragen automatisch. Die Lösung trägst du beim Song ein."
            : "Keine Standardfragen – neue Songs starten mit „Wer singt das?“ und „Wie heißt der Song?“."}
        </span>
      </div>
      {template.map((t, ti) => (
        <div key={t.id} className="q-row tpl">
          <span className="q-num">{ti + 1}</span>
          <input className="input" value={t.text} placeholder="z. B. Aus welchem Jahr?" maxLength={500} onChange={(e) => setT(ti, { ...t, text: e.target.value })} />
          <PointsInput value={t.maxPoints} onChange={(maxPoints) => setT(ti, { ...t, maxPoints })} />
          <button className="btn ghost icon-btn" title="Standardfrage löschen" onClick={() => onChange(template.filter((_, i) => i !== ti))}>✕</button>
        </div>
      ))}
      <div className="row">
        <button className="btn sm" onClick={() => onChange([...template, newTemplateQuestion()])}>+ Standardfrage</button>
        <button
          className="btn sm"
          disabled={!usable || songCount === 0}
          title="Fehlende Standardfragen bei allen Songs dieser Runde ergänzen – Lösungen und zusätzliche Fragen bleiben erhalten"
          onClick={() => confirm(`Standardfragen auf alle ${songCount} Songs dieser Runde anwenden? Fehlende Fragen werden ergänzt, Punkte angeglichen. Lösungen und zusätzliche Fragen bleiben erhalten.`) && onApply()}
        >
          Auf alle Songs anwenden
        </button>
      </div>
    </div>
  );
}

function PointsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [pts, setPts] = useState(fmtPoints(value));
  useEffect(() => {
    // nur übernehmen, wenn sich der Wert von außen geändert hat (nicht beim Tippen von "0,")
    setPts((cur) => (parseDecimal(cur) === value ? cur : fmtPoints(value)));
  }, [value]);
  const parsed = parseDecimal(pts);
  const bad = parsed === null || Number.isNaN(parsed);
  return (
    <input
      className={`input num${bad ? " invalid" : ""}`}
      value={pts}
      inputMode="decimal"
      aria-label="Punkte"
      onChange={(e) => {
        setPts(e.target.value);
        const n = parseDecimal(e.target.value);
        if (n !== null && !Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

function QuestionRow({ q, index, onChange, onDelete }: { q: QuestionInput; index: number; onChange: (q: QuestionInput) => void; onDelete?: () => void }) {
  return (
    <div className="q-row">
      <span className="q-num">{index + 1}</span>
      <input className={`input${!q.text.trim() ? " invalid" : ""}`} value={q.text} placeholder="Frage" maxLength={500} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      <input className="input sol" value={q.solution} placeholder="Lösung" maxLength={300} onChange={(e) => onChange({ ...q, solution: e.target.value })} />
      <PointsInput value={q.maxPoints} onChange={(maxPoints) => onChange({ ...q, maxPoints })} />
      <button className="btn ghost icon-btn" title="Frage löschen" disabled={!onDelete} onClick={onDelete}>✕</button>
    </div>
  );
}
