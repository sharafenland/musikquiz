import "server-only";
import { channelName, type LiveEvent } from "../realtime-shared";

/**
 * Sends a data-free "something changed" ping over Supabase Realtime Broadcast.
 * Clients re-fetch their (role-filtered) state from the API when they hear it.
 * If Realtime isn't configured, clients fall back to polling.
 *
 *  - "all":  host and teams refresh
 *  - "host": only the host refreshes (e.g. a team typed an answer)
 */
export async function notify(quizId: string, event: LiveEvent = "all"): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic: channelName(quizId), event, payload: { t: Date.now() }, private: false }],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn("Realtime-Broadcast fehlgeschlagen:", (e as Error).message);
  }
}
