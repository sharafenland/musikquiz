"use client";

import { useEffect } from "react";
import { themeVars, type QuizTheme } from "../themes";

/**
 * Setzt die Farben des Quiz als CSS-Variablen auf <html>. Beim Verlassen der Seite
 * (oder bevor der Zustand geladen ist) gilt wieder das Standardschema aus globals.css.
 */
export function useQuizTheme(theme: QuizTheme | null | undefined) {
  const key = theme ? `${theme.preset}|${theme.accent ?? ""}` : "";
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const vars = themeVars(theme);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content");
    meta?.setAttribute("content", vars["--bg"]);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
      if (meta && prevMeta) meta.setAttribute("content", prevMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
