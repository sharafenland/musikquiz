"use client";

import QRCode from "qrcode";
import { use, useCallback, useEffect, useState } from "react";
import { Podium } from "@/components/Podium";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/useLive";
import { useQuizTheme } from "@/lib/client/useQuizTheme";
import type { ScreenState } from "@/lib/types";

function useJoin(accessCode: string | undefined) {
  const [qr, setQr] = useState<string | null>(null);
  const [host, setHost] = useState("");
  useEffect(() => {
    if (!accessCode) return;
    const url = `${window.location.origin}/join?code=${accessCode}`;
    setHost(window.location.host);
    QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: "#121614", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [accessCode]);
  return { qr, host };
}

export default function ScreenPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const load = useCallback(() => api<ScreenState>(`/api/screen/${hash}`), [hash]);
  const { data: s, error } = useLive(load, (d) => d.quiz.id, ["all", "host"]);
  const { qr, host } = useJoin(s?.quiz.accessCode);
  useQuizTheme(s?.quiz.theme);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  if (!s) return <main className="screen"><p className="muted">{error ? error.message : "Lade …"}</p></main>;

  const canJoin = s.quiz.status === "live";
  const r = s.round;
  const lobby = s.quiz.status === "draft" || (s.quiz.status === "live" && !r);

  const joinBig = (
    <div className="screen-join">
      {qr && <img className="screen-qr" src={qr} alt="QR-Code zum Beitreten" />}
      <div className="stack" style={{ gap: "1vh" }}>
        <span className="screen-label">Zugangscode</span>
        <span className="screen-code">{s.quiz.accessCode}</span>
        <span className="screen-url">{host}/join</span>
      </div>
    </div>
  );

  return (
    <main className="screen">
      <header className="screen-head">
        <span className="brand"><span className="brand-mark" aria-hidden>♪</span>{s.quiz.title}</span>
        {!isFull && (
          <button className="btn sm" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            ⛶ Vollbild
          </button>
        )}
      </header>

      {lobby && (
        <section className="screen-center">
          <h1 className="screen-title">{s.quiz.status === "draft" ? "Gleich geht’s los" : "Jetzt mitspielen!"}</h1>
          {joinBig}
          <div className="screen-teams">
            {s.teams.length === 0 ? (
              <span className="muted">{canJoin ? "Noch keine Teams – scannt den Code!" : "Beitreten ist möglich, sobald das Quiz live ist."}</span>
            ) : (
              <>
                <span className="screen-label">{s.teams.length} {s.teams.length === 1 ? "Team" : "Teams"} dabei</span>
                <div className="screen-chips">
                  {s.teams.map((t) => <span key={t} className="screen-chip">{t}</span>)}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {s.quiz.status === "live" && r && (
        <section className="screen-center">
          <span className="screen-label">Runde {r.position + 1} von {s.quiz.roundCount}</span>
          <h1 className="screen-title">{r.title || `Runde ${r.position + 1}`}</h1>

          {r.status === "active" && (
            <>
              <p className="screen-sub">
                {r.unlockedCount === 0 ? "Gleich kommt der erste Song …" : <>Song <strong>{r.unlockedCount}</strong> von {r.songCount} ist freigeschaltet</>}
              </p>
              <div className="screen-songs">
                {Array.from({ length: r.songCount }, (_, i) => (
                  <span key={i} className={`screen-song${i < r.unlockedCount ? " on" : ""}${i === r.unlockedCount - 1 ? " cur" : ""}`}>{i + 1}</span>
                ))}
              </div>
              {r.unlockedCount > 0 && <p className="screen-hint">Startet den Song auf eurem Handy 🎧</p>}
            </>
          )}
          {r.status === "grading" && <p className="screen-sub">⏳ Runde beendet – die Punkte werden vergeben</p>}
          {r.status === "done" && (
            <p className="screen-sub">
              ✅ Ausgewertet – {r.position + 1 < s.quiz.roundCount ? "gleich geht’s mit der nächsten Runde weiter" : "gleich gibt’s den Endstand"}
            </p>
          )}
        </section>
      )}

      {s.quiz.status === "finished" && s.podium && (
        <section className="screen-center screen-podium">
          <h1 className="screen-title">Endstand 🏆</h1>
          <Podium ranking={s.podium} compact />
        </section>
      )}

      {/* Nachzügler: kleiner Code in der Ecke, solange eine Runde läuft */}
      {canJoin && r && (
        <aside className="screen-corner">
          {qr && <img src={qr} alt="" />}
          <span>
            <span className="screen-label">Noch nicht dabei?</span>
            <br />
            <span className="mono" style={{ fontSize: "2.2vh", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.15em" }}>{s.quiz.accessCode}</span>
          </span>
        </aside>
      )}
    </main>
  );
}
