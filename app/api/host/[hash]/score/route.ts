import { db } from "@/lib/server/db";
import { requireHost } from "@/lib/server/auth";
import { fail, readJson, route, uuid } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";

type Ctx = { params: Promise<{ hash: string }> };

/** Punkte für ein Team und eine Frage setzen (auch Teilpunkte). points = null löscht den Eintrag. */
export const PUT = route(async (req, { params }: Ctx) => {
  const quiz = await requireHost(req, (await params).hash);
  if (quiz.status !== "live") fail(409, "Punkte können nur während des Live-Quiz vergeben werden");
  const body = await readJson<{ teamId: string; questionId: string; points: number | null }>(req);
  const teamId = uuid(body.teamId, "Team-ID");
  const questionId = uuid(body.questionId, "Frage-ID");
  const sql = db();

  const [q] = await sql<{ max_points: number; round_status: string }[]>`
    select q.max_points, r.status as round_status
    from questions q join songs s on s.id = q.song_id join rounds r on r.id = s.round_id
    where q.id = ${questionId} and r.quiz_id = ${quiz.id}`;
  if (!q) fail(404, "Frage nicht gefunden");
  if (q.round_status !== "grading") fail(409, "Punkte gibt es erst, wenn die Runde beendet ist (und bevor sie abgeschlossen wird)");
  const [team] = await sql`select 1 from teams where id = ${teamId} and quiz_id = ${quiz.id}`;
  if (!team) fail(404, "Team nicht gefunden");

  if (body.points === null || body.points === undefined) {
    await sql`delete from scores where team_id = ${teamId} and question_id = ${questionId}`;
  } else {
    const points = Math.round(Number(body.points) * 100) / 100;
    if (!(points >= 0)) fail(400, "Ungültige Punktzahl");
    if (points > q.max_points) fail(400, `Maximal ${q.max_points} Punkte für diese Frage`);
    await sql`
      insert into scores (team_id, question_id, points) values (${teamId}, ${questionId}, ${points})
      on conflict (team_id, question_id) do update set points = excluded.points`;
  }
  await notify(quiz.id, "host");
  return { ok: true };
});
