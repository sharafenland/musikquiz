"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; hostKey?: string; teamToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.hostKey) headers["x-host-key"] = opts.hostKey;
  if (opts.teamToken) headers["x-team-token"] = opts.teamToken;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Keine Verbindung zum Server");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}

/* ---------- lokale Speicherung (nur in diesem Browser) ---------- */

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* privater Modus o. Ä. */
  }
}

export const hostKeyStore = {
  get: (hash: string) => get(`mq-host-${hash}`),
  set: (hash: string, key: string | null) => set(`mq-host-${hash}`, key),
};

export interface TeamSession {
  token: string;
  teamId: string;
  name: string;
}
export const teamStore = {
  get: (hash: string): TeamSession | null => {
    const raw = get(`mq-team-${hash}`);
    try {
      return raw ? (JSON.parse(raw) as TeamSession) : null;
    } catch {
      return null;
    }
  },
  set: (hash: string, s: TeamSession | null) => set(`mq-team-${hash}`, s ? JSON.stringify(s) : null),
};

export interface KnownQuiz {
  hash: string;
  title: string;
  createdAt: string;
}
export const myQuizzes = {
  list: (): KnownQuiz[] => {
    try {
      return JSON.parse(get("mq-my-quizzes") ?? "[]") as KnownQuiz[];
    } catch {
      return [];
    }
  },
  upsert: (q: KnownQuiz) => {
    const list = myQuizzes.list().filter((x) => x.hash !== q.hash);
    set("mq-my-quizzes", JSON.stringify([q, ...list].slice(0, 30)));
  },
  remove: (hash: string) => set("mq-my-quizzes", JSON.stringify(myQuizzes.list().filter((x) => x.hash !== hash))),
};

/** "0,5" → 0.5; leer → null; ungültig → NaN */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : Number.NaN;
}
