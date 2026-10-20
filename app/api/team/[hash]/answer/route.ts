import { db } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/auth";
import { fail, readJson, route, uuid } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";

type Ctx = { params: Promise<{ hash: string }> };

/** Antwort eines Teams speichern (nur solange die Runde läuft). */
export const PUT = route(async (req, { params }: Ctx) => {
  const { quiz, team } = await requireTeam(req, (await params).hash);
  if (quiz.status !== "live") fail(409, "Das Quiz ist nicht live");
  const body = await readJson<{ questionId: string; text: string }>(req);
  const questionId = uuid(body.questionId, "Frage-ID");
  const text = String(body.text ?? "").slice(0, 500);
  const sql = db();
  const [q] = await sql`
    select 1 from questions q join songs s on s.id = q.song_id join rounds r on r.id = s.round_id
    where q.id = ${questionId} and r.quiz_id = ${quiz.id} and r.status = 'active' and s.position < r.unlocked_count`;
  if (!q) fail(409, "Antworten sind für diese Frage nicht (mehr) möglich");
  await sql`
    insert into answers (team_id, question_id, text) values (${team.id}, ${questionId}, ${text})
    on conflict (team_id, question_id) do update set text = excluded.text, updated_at = now()`;
  await notify(quiz.id, "host");
  return { ok: true };
});
