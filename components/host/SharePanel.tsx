"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/ui";

export function SharePanel({ accessCode, live }: { accessCode: string; live: boolean }) {
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = origin ? `${origin}/join?code=${accessCode}` : "";
  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 264, color: { dark: "#121614", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  return (
    <section className="card stack">
      <div className="row between">
        <h3>Teams einladen</h3>
        {!live && <span className="badge">ab Live-Start</span>}
      </div>
      <div className="row" style={{ alignItems: "center", gap: 16 }}>
        {qr && <img className="qr" src={qr} alt="QR-Code zum Beitreten" />}
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Zugangscode</span>
          <span className="code-box">{accessCode}</span>
          <span className="small faint">{origin.replace(/^https?:\/\//, "")}/join</span>
        </div>
      </div>
      {joinUrl && (
        <div className="row">
          <CopyButton text={joinUrl} label="Beitrittslink kopieren" />
          <a className="btn sm" href={`/join?code=${accessCode}`} target="_blank" rel="noreferrer">Testen ↗</a>
        </div>
      )}
    </section>
  );
}

export function HostAccessPanel({ hash, hostKey }: { hash: string; hostKey: string }) {
  const [origin, setOrigin] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <section className="card stack">
      <h3>Host-Zugang</h3>
      <div className="small stack" style={{ gap: 4 }}>
        <span className="muted">Quiz-Hash</span>
        <span className="mono">{hash}</span>
        <span className="muted" style={{ marginTop: 6 }}>Host-Schlüssel</span>
        <span className="row">
          <span className="mono">{show ? hostKey : "••••••••••••"}</span>
          <button className="btn ghost sm" onClick={() => setShow(!show)}>{show ? "verbergen" : "zeigen"}</button>
        </span>
      </div>
      {origin && <CopyButton text={`${origin}/host/${hash}#k=${hostKey}`} label="Host-Link mit Schlüssel kopieren" />}
      <p className="faint small">Damit öffnest du das Quiz auf jedem Gerät (z. B. Laptop + Tablet). Nicht an Teams weitergeben.</p>
    </section>
  );
}
