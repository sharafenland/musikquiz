"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let apiPromise: Promise<typeof YT> | null = null;
function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as unknown as { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

export type PlaybackPhase = "idle" | "loading" | "playing" | "finished" | "error";

export interface Playback {
  key: string | null; // z. B. Song-ID
  phase: PlaybackPhase;
  progress: number; // 0..1
  remaining: number; // Sekunden
  error?: string;
}

const ERRORS: Record<number, string> = {
  2: "Ungültige Video-ID",
  5: "Video kann im Browser nicht abgespielt werden",
  100: "Video nicht gefunden oder privat",
  101: "Der Rechteinhaber erlaubt keine Einbettung",
  150: "Der Rechteinhaber erlaubt keine Einbettung",
};

/**
 * Unsichtbarer YouTube-Player: spielt `seconds` Sekunden ab `start` und stoppt dann.
 * Den zurückgegebenen `mountRef` an ein (verstecktes) Element hängen.
 *
 * Wichtig für Mobilgeräte: `play()` direkt im Klick-Handler aufrufen (nicht nach einem
 * await), sonst blockiert der Browser die Audiowiedergabe.
 */
export function useYouTubeAudio() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [ready, setReady] = useState(false);
  const [pb, setPb] = useState<Playback>({ key: null, phase: "idle", progress: 0, remaining: 0 });
  const job = useRef<{ key: string; start: number; seconds: number; startedAt: number | null } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (tick.current) clearInterval(tick.current);
    if (loadTimeout.current) clearTimeout(loadTimeout.current);
    tick.current = null;
    loadTimeout.current = null;
  };

  const finish = useCallback((phase: PlaybackPhase, error?: string) => {
    clearTimers();
    try {
      playerRef.current?.stopVideo();
    } catch {
      /* ignore */
    }
    const key = job.current?.key ?? null;
    job.current = null;
    setPb({ key, phase, progress: phase === "finished" ? 1 : 0, remaining: 0, error });
  }, []);

  useEffect(() => {
    let destroyed = false;
    loadYouTubeApi().then((YTApi) => {
      if (destroyed || !mountRef.current) return;
      const el = document.createElement("div");
      mountRef.current.appendChild(el);
      playerRef.current = new YTApi.Player(el, {
        width: 200,
        height: 200,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => !destroyed && setReady(true),
          onStateChange: (e) => {
            const j = job.current;
            if (!j) return;
            if (e.data === YTApi.PlayerState.PLAYING && j.startedAt === null) {
              j.startedAt = Date.now();
              if (loadTimeout.current) clearTimeout(loadTimeout.current);
              setPb((p) => ({ ...p, phase: "playing" }));
              tick.current = setInterval(() => {
                const cur = job.current;
                const pl = playerRef.current;
                if (!cur || !pl) return;
                // Abspielposition statt Wanduhr: Puffern zählt nicht zur Hörzeit
                const t = Math.max(0, (pl.getCurrentTime?.() ?? cur.start) - cur.start);
                const progress = Math.min(1, t / cur.seconds);
                setPb((p) => ({ ...p, progress, remaining: Math.max(0, Math.ceil(cur.seconds - t)) }));
                if (t >= cur.seconds) finish("finished");
              }, 200);
            } else if (e.data === YTApi.PlayerState.ENDED) {
              finish("finished");
            }
          },
          onError: (e) => finish("error", ERRORS[e.data as number] ?? `YouTube-Fehler ${e.data}`),
        },
      });
    });
    return () => {
      destroyed = true;
      clearTimers();
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [finish]);

  /** Startet die Wiedergabe – synchron im Klick-Handler aufrufen. */
  const play = useCallback(
    (key: string, videoId: string, start: number, seconds: number) => {
      const pl = playerRef.current;
      if (!pl) return false;
      clearTimers();
      job.current = { key, start, seconds, startedAt: null };
      setPb({ key, phase: "loading", progress: 0, remaining: seconds });
      pl.setVolume(100);
      pl.unMute();
      pl.loadVideoById({ videoId, startSeconds: start });
      loadTimeout.current = setTimeout(() => {
        if (job.current && job.current.startedAt === null)
          finish("error", "Wiedergabe startet nicht – Ton/Autoplay im Browser erlaubt?");
      }, 15000);
      return true;
    },
    [finish],
  );

  const stop = useCallback(() => {
    if (job.current) finish("finished");
  }, [finish]);

  /** Wiedergabe abbrechen, ohne sie als „gehört“ anzuzeigen (z. B. Server hat abgelehnt). */
  const abort = useCallback(
    (error?: string) => {
      if (job.current) finish(error ? "error" : "idle", error);
    },
    [finish],
  );

  return { mountRef, ready, playback: pb, play, stop, abort };
}
