import { db } from "@/lib/server/db";
import { newTeamToken, sha256 } from "@/lib/server/auth";
import { fail, readJson, route } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";

/** Team tritt mit Zugangscode bei. */
export const POST = route(async (req) => {
  const body = await readJson<{ accessCode?: string; name?: string }>(req);
  const code = (body.accessCode ?? "").trim().toUpperCase();
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!code) fail(400, "Bitte Zugangscode eingeben");
  if (!name) fail(400, "Bitte Teamnamen eingeben");

  const sql = db();
  const [quiz] = await sql<{ id: string; hash: string; status: string }[]>`
    select id, hash, status from quizzes where access_code = ${code}`;
  if (!quiz) fail(404, "Unbekannter Zugangscode");
  if (quiz.status === "draft") fail(409, "Das Quiz ist noch nicht live");
  if (quiz.status === "finished") fail(409, "Das Quiz ist bereits beendet");

  const token = newTeamToken();
  try {
    const [team] = await sql<{ id: string }[]>`
      insert into teams (quiz_id, name, token_hash) values (${quiz.id}, ${name}, ${sha256(token)})
      returning id`;
    await notify(quiz.id, "host");
    return { hash: quiz.hash, teamId: team.id, name, token };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") fail(409, "Dieser Teamname ist schon vergeben");
    throw e;
  }
});
