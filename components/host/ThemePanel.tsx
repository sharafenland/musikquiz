"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { contrast, THEMES, type QuizTheme, type ThemeId } from "@/lib/themes";
import type { HostState } from "@/lib/types";

/**
 * Farbschema des Quiz wählen. Änderungen wirken sofort als Vorschau (onPreview)
 * und werden kurz danach gespeichert – Teams und Beamer übernehmen sie dann live.
 */
export function ThemePanel({
  theme, hash, hostKey, onPreview, onSaved, onError,
}: {
  theme: QuizTheme;
  hash: string;
  hostKey: string;
  onPreview: (t: QuizTheme | null) => void;
  onSaved: (s: HostState) => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState(theme);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editing = useRef(false);

  // Änderungen von außen (anderes Host-Gerät) übernehmen, solange hier nichts ansteht
  useEffect(() => {
    if (!editing.current) setValue(theme);
  }, [theme.preset, theme.accent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const change = (next: QuizTheme) => {
    setValue(next);
    onPreview(next);
    editing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        onSaved(await api<HostState>(`/api/host/${hash}/theme`, { method: "PUT", body: next, hostKey }));
      } catch (e) {
        onError((e as Error).message);
      } finally {
        editing.current = false;
        onPreview(null);
      }
    }, 400);
  };

  const colors = THEMES[value.preset].colors;
  const accent = value.accent ?? colors.accent;
  const lowContrast = contrast(accent, colors.bg) < 3;

  return (
    <section className="card stack">
      <h3>Farben</h3>
      <div className="theme-grid">
        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
          const c = THEMES[id].colors;
          return (
            <button
              key={id}
              type="button"
              className={`theme-swatch${value.preset === id ? " on" : ""}`}
              style={{ background: c.bg, color: c.text, borderColor: value.preset === id ? accent : c.line }}
              aria-pressed={value.preset === id}
              onClick={() => change({ ...value, preset: id })}
            >
              <span className="theme-dots" aria-hidden>
                <span style={{ background: c.surface2 }} />
                <span style={{ background: value.preset === id ? accent : c.accent }} />
              </span>
              {THEMES[id].label}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label className="row small" style={{ gap: 8, cursor: "pointer" }}>
          <input
            type="color"
            className="color-input"
            value={accent}
            onChange={(e) => change({ ...value, accent: e.target.value })}
          />
          Akzentfarbe
        </label>
        {value.accent && (
          <button className="btn ghost sm" onClick={() => change({ ...value, accent: null })}>
            zurück zur Schema-Farbe
          </button>
        )}
      </div>
      {lowContrast && <p className="small" style={{ color: "var(--warn)" }}>Diese Akzentfarbe ist auf dem Hintergrund schlecht lesbar.</p>}
      <p className="faint small">Gilt für dich, alle Teams und den Beamer – auch während das Quiz läuft.</p>
    </section>
  );
}
