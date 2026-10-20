"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { channelName, type LiveEvent } from "../realtime-shared";

let client: SupabaseClient | null | undefined;
function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client;
}

/**
 * Lädt einen Zustand per API und hält ihn aktuell:
 * Supabase-Realtime-Ping → sofort neu laden; zusätzlich Polling als Sicherheitsnetz
 * (alle 15 s mit Realtime, alle 3 s ohne).
 */
export function useLive<T>(
  load: (() => Promise<T>) | null,
  quizIdOf: (data: T) => string,
  events: LiveEvent[],
) {
  const [data, setData] = useState<T | null>(null);
  const quizId = data ? quizIdOf(data) : undefined;
  const [error, setError] = useState<Error | null>(null);
  const [realtime, setRealtime] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const inFlight = useRef(false);
  const again = useRef(false);

  const reload = useCallback(async () => {
    if (!loadRef.current) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const d = await loadRef.current();
        setData(d);
        setError(null);
      } while (again.current);
    } catch (e) {
      setError(e as Error);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (load) void reload();
  }, [load, reload]);

  const eventsKey = events.join(",");
  useEffect(() => {
    const sb = supabase();
    if (!sb || !quizId) return;
    const ch = sb.channel(channelName(quizId));
    for (const ev of eventsKey.split(",")) ch.on("broadcast", { event: ev }, () => void reload());
    ch.subscribe((status) => {
      setRealtime(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") void reload(); // evtl. verpasste Änderungen nachholen
    });
    return () => {
      void sb.removeChannel(ch);
      setRealtime(false);
    };
  }, [quizId, eventsKey, reload]);

  useEffect(() => {
    if (!load) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, realtime ? 15000 : 3000);
    const onVis = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, realtime, reload]);

  return { data, setData, error, reload, realtime };
}
