import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { fail } from "./http";
import type { QuizStatus } from "../types";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function randomString(alphabet: string, len: number) {
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Quiz-Hash für URLs, z. B. "k3x9q2mz" */
export const newQuizHash = () => randomString("abcdefghijkmnpqrstuvwxyz23456789", 8);
/** Zugangscode für Teams, ohne verwechselbare Zeichen (0/O, 1/I) */
export const newAccessCode = () => randomString("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
/** Geheimer Host-Schlüssel */
export const newHostKey = () => randomString("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 12);
/** Geheimes Team-Token (bleibt im Browser des Teams) */
export const newTeamToken = () => randomString("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", 32);

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface QuizRow {
  id: string;
  hash: string;
  access_code: string;
  title: string;
  play_seconds: number;
  theme: string;
  accent_color: string | null;
  status: QuizStatus;
  current_round_id: string | null;
}

async function quizByHash(hash: string): Promise<QuizRow & { host_key_hash: string }> {
  const [q] = await db()<(QuizRow & { host_key_hash: string })[]>`
    select id, hash, access_code, host_key_hash, title, play_seconds, status, current_round_id, theme, accent_color
    from quizzes where hash = ${hash}`;
  if (!q) fail(404, "Quiz nicht gefunden");
  return q;
}

/** Checks the x-host-key header against the quiz. */
export async function requireHost(req: Request, hash: string): Promise<QuizRow> {
  const key = req.headers.get("x-host-key") ?? "";
  const q = await quizByHash(hash);
  if (!key || !safeEqualHex(sha256(key), q.host_key_hash)) fail(401, "Falscher Host-Schlüssel");
  return q;
}

/** Checks the x-team-token header; returns quiz and team. */
export async function requireTeam(req: Request, hash: string) {
  const token = req.headers.get("x-team-token") ?? "";
  if (!token) fail(401, "Kein Team-Token");
  const q = await quizByHash(hash);
  const [team] = await db()<{ id: string; name: string }[]>`
    select id, name from teams where quiz_id = ${q.id} and token_hash = ${sha256(token)}`;
  if (!team) fail(401, "Team nicht gefunden – bitte erneut beitreten");
  return { quiz: q, team };
}

/** Quiz ohne Authentifizierung laden (für die öffentliche Beamer-Ansicht). */
export async function publicQuiz(hash: string): Promise<QuizRow> {
  const { host_key_hash: _omit, ...q } = await quizByHash(hash);
  void _omit;
  return q;
}
