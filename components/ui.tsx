"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden>♪</span>
        Musikquiz
      </Link>
      <div className="row">{children}</div>
    </div>
  );
}

interface Toast { id: number; text: string; good?: boolean }

/** Kleine Toast-Meldungen für Fehler & Bestätigungen. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, good = false) => {
    const id = next.current++;
    setToasts((t) => [...t, { id, text, good }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), good ? 2500 : 5000);
  }, []);
  const view = (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.good ? " good" : ""}`}>{t.text}</div>
      ))}
    </div>
  );
  return { push, view };
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Kopieren", className = "btn sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Zum Kopieren:", text);
        }
      }}
    >
      {done ? "✓ Kopiert" : label}
    </button>
  );
}
