import "server-only";
import { db } from "./db";
import { fail, uuid } from "./http";
import type { QuizRow } from "./auth";

/** Ensures the song belongs to the quiz's active round and is already unlocked. */
export async function requirePlayableSong(quiz: QuizRow, songId: unknown) {
  if (quiz.status !== "live") fail(409, "Das Quiz ist nicht live");
  const id = uuid(songId, "Song-ID");
  const [s] = await db()<{ id: string; video_id: string; start_seconds: number }[]>`
    select s.id, s.video_id, s.start_seconds
    from songs s join rounds r on r.id = s.round_id
    where s.id = ${id} and r.quiz_id = ${quiz.id} and r.status = 'active' and s.position < r.unlocked_count`;
  if (!s) fail(409, "Dieser Song ist gerade nicht freigeschaltet");
  return s;
}
