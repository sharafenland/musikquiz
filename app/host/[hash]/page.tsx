"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Editor, newRound, toStructure, validate } from "@/components/host/Editor";
import { LivePanel } from "@/components/host/LivePanel";
import { HostAccessPanel, SharePanel } from "@/components/host/SharePanel";
import { ThemePanel } from "@/components/host/ThemePanel";
import { Podium } from "@/components/Podium";
import { CopyButton, Modal, TopBar, useToasts } from "@/components/ui";
import { api, ApiError, hostKeyStore, myQuizzes } from "@/lib/client/api";
import { useLive } from "@/lib/client/useLive";
import { useQuizTheme } from "@/lib/client/useQuizTheme";
import { useYouTubeAudio } from "@/lib/client/useYouTubeAudio";
import type { QuizTheme } from "@/lib/themes";
import type { HostAction, HostState, StructureInput } from "@/lib/types";

export default function HostPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const [hostKey, setHostKey] = useState<string | null | undefined>(undefined);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    // Host-Link mit Schlüssel im Fragment (#k=…) – landet nie auf dem Server
    const m = window.location.hash.match(/k=([^&]+)/);
    if (m) {
      hostKeyStore.set(hash, decodeURIComponent(m[1]));
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setHostKey(hostKeyStore.get(hash));
  }, [hash]);

  if (hostKey === undefined) return null;
  if (!hostKey)
    return (
      <KeyPrompt
        hash={hash}
        error={keyError}
        onKey={(k) => {
          hostKeyStore.set(hash, k);
          setKeyError(null);
          setHostKey(k);
        }}
      />
    );
  return (
    <HostView
      hash={hash}
      hostKey={hostKey}
      onBadKey={(msg) => {
        hostKeyStore.set(hash, null);
        setKeyError(msg);
        setHostKey(null);
      }}
    />
  );
}

function KeyPrompt({ hash, error, onKey }: { hash: string; error: string | null; onKey: (k: string) => void }) {
  const [k, setK] = useState("");
  return (
    <main className="wrap narrow">
      <TopBar />
      <form className="card stack" style={{ maxWidth: 440, margin: "24px auto" }} onSubmit={(e) => { e.preventDefault(); if (k.trim()) onKey(k.trim()); }}>
        <h1>Host-Schlüssel</h1>
        <p className="muted">Für Quiz <span className="mono">{hash}</span>. Den Schlüssel hast du beim Anlegen bekommen.</p>
        <input className="input mono" autoFocus value={k} onChange={(e) => setK(e.target.value)} placeholder="Host-Schlüssel" />
        {error && <div className="alert">{error}</div>}
        <button className="btn primary">Öffnen</button>
      </form>
    </main>
  );
}

function HostView({ hash, hostKey, onBadKey }: { hash: string; hostKey: string; onBadKey: (msg: string) => void }) {
  const toasts = useToasts();
  const yt = useYouTubeAudio();
  const load = useCallback(() => api<HostState>(`/api/host/${hash}`, { hostKey }), [hash, hostKey]);
  const { data: state, setData, error, realtime } = useLive(load, (d) => d.quiz.id, ["all", "host"]);
  const [draft, setDraft] = useState<StructureInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<QuizTheme | null>(null);
  useQuizTheme(previewTheme ?? state?.quiz.theme);

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) onBadKey(error.message);
  }, [error, onBadKey]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("neu")) {
      setWelcome(true);
      url.searchParams.delete("neu");
      history.replaceState(null, "", url.pathname);
    }
    try {
      setShowNotes(localStorage.getItem("mq-show-notes") !== "0");
    } catch { /* ignore */ }
  }, []);

  // Entwurf übernehmen, wenn das Quiz (wieder) im Entwurfsmodus ist
  const status = state?.quiz.status;
  useEffect(() => {
    if (state && status === "draft" && !dirty) {
      const s = toStructure(state);
      if (s.rounds.length === 0) {
        // frisches Quiz: gleich mit einer Runde und einem Song starten
        s.rounds = [newRound()];
        setDirty(true);
      }
      setDraft(s);
    }
    if (status && status !== "draft") setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (state) myQuizzes.upsert({ hash, title: state.quiz.title, createdAt: new Date().toISOString() });
  }, [hash, state?.quiz.title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    const problem = validate(draft);
    if (problem) {
      toasts.push(problem);
      return false;
    }
    setSaving(true);
    try {
      const next = await api<HostState>(`/api/host/${hash}`, { method: "PUT", body: draft, hostKey });
      setData(next);
      setDraft(toStructure(next));
      setDirty(false);
      toasts.push("Gespeichert", true);
      return true;
    } catch (e) {
      toasts.push((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const act = async (action: HostAction, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const next = await api<HostState>(`/api/host/${hash}/action`, { method: "POST", body: action, hostKey });
      setData(next);
    } catch (e) {
      toasts.push((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const goLive = async () => {
    if (dirty && !(await save())) return;
    if (draft && validate(draft)) return toasts.push(validate(draft)!);
    await act({ type: "go_live" }, "Quiz live schalten? Danach können Teams beitreten, die Fragen sind dann nicht mehr bearbeitbar.");
  };

  if (!state) {
    return (
      <main className="wrap">
        <TopBar />
        {error && !(error instanceof ApiError && error.status === 401) ? <div className="alert">{error.message}</div> : <p className="muted">Lade …</p>}
      </main>
    );
  }

  const q = state.quiz;
  const themePanel = (
    <ThemePanel theme={q.theme} hash={hash} hostKey={hostKey} onPreview={setPreviewTheme} onSaved={setData} onError={toasts.push} />
  );
  return (
    <main className="wrap">
      <TopBar>
        {q.status === "live" && <span className="badge live">Live</span>}
        {q.status === "draft" && <span className="badge">Entwurf</span>}
        {q.status === "finished" && <span className="badge ok">Beendet</span>}
        {!realtime && <span className="badge" title="Supabase Realtime nicht verbunden – Seite aktualisiert per Polling">Polling</span>}
      </TopBar>
      <div ref={yt.mountRef} className="yt-hidden" aria-hidden />

      <div className="row between" style={{ marginBottom: 20 }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="muted small">Host-Ansicht · <span className="mono">{q.hash}</span></p>
          <h1>{q.title}</h1>
        </div>
        <div className="row">
          <a className="btn sm" href={`/screen/${hash}`} target="_blank" rel="noreferrer" title="Öffentliche Ansicht für Beamer/TV – ohne Songtitel und Lösungen">
            📺 Beamer-Ansicht
          </a>
          {q.status === "live" && (
            <button
              className="btn sm"
              onClick={() => {
                setShowNotes(!showNotes);
                try { localStorage.setItem("mq-show-notes", showNotes ? "0" : "1"); } catch { /* ignore */ }
              }}
              title="Für Beamer: Songtitel in der Live-Ansicht ausblenden"
            >
              {showNotes ? "🙈 Songtitel ausblenden" : "👁 Songtitel zeigen"}
            </button>
          )}
          {q.status !== "draft" && (
            <button className="btn danger sm" disabled={busy} onClick={() => act({ type: "reset" }, "Quiz zurücksetzen? Alle Teams, Antworten und Punkte werden gelöscht und das Quiz ist wieder ein bearbeitbarer Entwurf.")}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {q.status === "draft" && draft && (
        <div className="host-grid">
          <div>
            <Editor
              value={draft}
              onChange={(v) => {
                setDraft(v);
                setDirty(true);
              }}
              playback={yt.playback}
              ytReady={yt.ready}
              onPreview={(key, id, start, secs) => yt.play(key, id, start, secs)}
              onStopPreview={yt.stop}
            />
            <div className="dirty-bar card tight row between">
              <span className="small muted">{dirty ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</span>
              <span className="row">
                <button className="btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Speichert …" : "Speichern"}</button>
                <button className="btn primary" disabled={saving || busy} onClick={() => void goLive()}>🔴 Live schalten</button>
              </span>
            </div>
          </div>
          <aside className="stack-lg sticky">
            <SharePanel accessCode={q.accessCode} live={false} />
            <HostAccessPanel hash={hash} hostKey={hostKey} />
            {themePanel}
            <section className="card stack small muted">
              <h3 style={{ color: "var(--text)" }}>So läuft’s</h3>
              <ol style={{ margin: 0, paddingLeft: 18 }} className="stack">
                <li>Runden, Songs (YouTube-Links) und Fragen anlegen, speichern.</li>
                <li>„Live schalten“ – Teams treten mit dem Code bei.</li>
                <li>Runde starten und Songs nacheinander freischalten. Teams hören selbst, {q.playSeconds} s lang.</li>
                <li>Runde beenden, Punkte vergeben, abschließen.</li>
                <li>Nach der letzten Runde: Podest zeigen.</li>
              </ol>
            </section>
          </aside>
        </div>
      )}

      {q.status === "live" && (
        <div className="stack-lg">
          <LivePanel state={state} hash={hash} hostKey={hostKey} act={act} busy={busy} onError={toasts.push} showNotes={showNotes} />
          <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <SharePanel accessCode={q.accessCode} live />
            <HostAccessPanel hash={hash} hostKey={hostKey} />
            {themePanel}
          </div>
        </div>
      )}

      {q.status === "finished" && (
        <div className="stack-lg">
          <div className="center stack">
            <h1>Endstand 🏆</h1>
            <p className="muted">Das Podest wird gerade bei allen Teams angezeigt.</p>
          </div>
          <Podium ranking={state.ranking} rounds={state.rounds.map((r) => ({ id: r.id, label: `R${r.position + 1}` }))} />
          <div style={{ maxWidth: 520, width: "100%", margin: "0 auto" }}>{themePanel}</div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" disabled={busy} onClick={() => act({ type: "reopen_quiz" }, "Quiz wieder öffnen, um Punkte zu korrigieren? Teams sehen dann wieder die Warteansicht.")}>
              Punkte korrigieren
            </button>
            <Link className="btn" href="/">Neues Quiz</Link>
          </div>
        </div>
      )}

      {welcome && (
        <Modal onClose={() => setWelcome(false)}>
          <h2>Quiz angelegt 🎉</h2>
          <p className="muted">
            Dein Quiz ist gespeichert. Mit <strong>Quiz-Hash</strong> und <strong>Host-Schlüssel</strong> öffnest du es jederzeit wieder –
            bitte den Schlüssel notieren.
          </p>
          <div className="sub stack" style={{ gap: 6 }}>
            <span className="small muted">Quiz-Hash</span>
            <span className="mono">{hash}</span>
            <span className="small muted">Host-Schlüssel</span>
            <span className="mono">{hostKey}</span>
            <span className="small muted">Zugangscode für Teams</span>
            <span className="mono">{q.accessCode}</span>
          </div>
          <div className="row">
            <CopyButton text={`Quiz-Hash: ${hash}\nHost-Schlüssel: ${hostKey}\nZugangscode: ${q.accessCode}`} label="Alles kopieren" className="btn" />
            <button className="btn primary" onClick={() => setWelcome(false)}>Los geht’s</button>
          </div>
        </Modal>
      )}
      {toasts.view}
    </main>
  );
}
