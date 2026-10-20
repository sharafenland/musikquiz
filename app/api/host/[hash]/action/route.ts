import { db } from "@/lib/server/db";
import { requireHost, type QuizRow } from "@/lib/server/auth";
import { fail, readJson, route, uuid } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";
import { buildHostState } from "@/lib/server/state";
import type { HostAction } from "@/lib/types";

type Ctx = { params: Promise<{ hash: string }> };


async function roundOf(quiz: QuizRow, roundId: string) {
  const [r] = await db()<{ id: string; status: string; unlocked_count: number; song_count: number }[]>`
    select r.id, r.status, r.unlocked_count, (select count(*)::int from songs s where s.round_id = r.id) as song_count
    from rounds r where r.id = ${uuid(roundId, "Runden-ID")} and r.quiz_id = ${quiz.id}`;
  if (!r) fail(404, "Runde nicht gefunden");
  return r;
}

const requireLive = (quiz: QuizRow) => {
  if (quiz.status !== "live") fail(409, "Das Quiz ist nicht live");
};

export const POST = route(async (req, { params }: Ctx) => {
  const quiz = await requireHost(req, (await params).hash);
  const action = await readJson<HostAction>(req);
  const sql = db();

  switch (action.type) {
    case "go_live": {
      if (quiz.status !== "draft") fail(409, "Das Quiz ist schon live");
      const [check] = await sql<{ rounds: number; empty_rounds: number; empty_songs: number }[]>`
        select
          (select count(*)::int from rounds where quiz_id = ${quiz.id}) as rounds,
          (select count(*)::int from rounds r where r.quiz_id = ${quiz.id}
             and not exists (select 1 from songs s where s.round_id = r.id)) as empty_rounds,
          (select count(*)::int from songs s join rounds r on r.id = s.round_id where r.quiz_id = ${quiz.id}
             and not exists (select 1 from questions q where q.song_id = s.id)) as empty_songs`;
      if (check.rounds === 0) fail(400, "Lege mindestens eine Runde an");
      if (check.empty_rounds > 0) fail(400, "Jede Runde braucht mindestens einen Song");
      if (check.empty_songs > 0) fail(400, "Jeder Song braucht mindestens eine Frage");
      await sql`update quizzes set status = 'live', updated_at = now() where id = ${quiz.id}`;
      break;
    }

    case "start_round": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "pending") fail(409, "Diese Runde wurde schon gestartet");
      const [active] = await sql`select 1 from rounds where quiz_id = ${quiz.id} and status = 'active'`;
      if (active) fail(409, "Es läuft noch eine andere Runde – erst beenden");
      await sql.begin(async (tx) => {
        await tx`update rounds set status = 'active', unlocked_count = 0 where id = ${r.id}`;
        await tx`update quizzes set current_round_id = ${r.id}, updated_at = now() where id = ${quiz.id}`;
      });
      break;
    }

    case "unlock_next": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "active") fail(409, "Die Runde ist nicht aktiv");
      const res = await sql`
        update rounds set unlocked_count = unlocked_count + 1
        where id = ${r.id} and unlocked_count < ${r.song_count}`;
      if (res.count === 0) fail(409, "Alle Songs dieser Runde sind bereits freigeschaltet");
      break;
    }

    case "close_round": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "active") fail(409, "Die Runde ist nicht aktiv");
      await sql.begin(async (tx) => {
        await tx`update rounds set status = 'grading' where id = ${r.id}`;
        // offene Wiederhol-Anfragen dieser Runde verwerfen
        await tx`update replay_requests set status = 'denied'
                 where status = 'pending' and song_id in (select id from songs where round_id = ${r.id})`;
      });
      break;
    }

    case "reopen_round": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "grading") fail(409, "Nur Runden in der Auswertung können wieder geöffnet werden");
      const [active] = await sql`select 1 from rounds where quiz_id = ${quiz.id} and status = 'active'`;
      if (active) fail(409, "Es läuft gerade eine andere Runde");
      await sql.begin(async (tx) => {
        await tx`update rounds set status = 'active' where id = ${r.id}`;
        await tx`update quizzes set current_round_id = ${r.id} where id = ${quiz.id}`;
      });
      break;
    }

    case "complete_grading": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "grading") fail(409, "Die Runde ist nicht in der Auswertung");
      await sql.begin(async (tx) => {
        // leere Felder zählen als 0 Punkte
        await tx`
          insert into scores (team_id, question_id, points)
          select t.id, q.id, 0 from teams t
          cross join questions q join songs s on s.id = q.song_id
          where t.quiz_id = ${quiz.id} and s.round_id = ${r.id}
          on conflict (team_id, question_id) do nothing`;
        await tx`update rounds set status = 'done' where id = ${r.id}`;
      });
      break;
    }

    case "reopen_grading": {
      requireLive(quiz);
      const r = await roundOf(quiz, action.roundId);
      if (r.status !== "done") fail(409, "Die Runde ist noch nicht abgeschlossen");
      await sql`update rounds set status = 'grading' where id = ${r.id}`;
      break;
    }

    case "finish_quiz": {
      requireLive(quiz);
      const [open] = await sql<{ n: number }[]>`
        select count(*)::int as n from rounds where quiz_id = ${quiz.id} and status <> 'done'`;
      if (open.n > 0) fail(409, `Noch ${open.n} Runde(n) nicht fertig ausgewertet`);
      await sql`update quizzes set status = 'finished', updated_at = now() where id = ${quiz.id}`;
      break;
    }

    case "reopen_quiz": {
      if (quiz.status !== "finished") fail(409, "Das Quiz ist nicht beendet");
      await sql`update quizzes set status = 'live', updated_at = now() where id = ${quiz.id}`;
      break;
    }

    case "reset": {
      await sql.begin(async (tx) => {
        await tx`delete from teams where quiz_id = ${quiz.id}`; // kaskadiert: Plays, Antworten, Punkte, Anfragen
        await tx`update rounds set status = 'pending', unlocked_count = 0 where quiz_id = ${quiz.id}`;
        await tx`update quizzes set status = 'draft', current_round_id = null, updated_at = now() where id = ${quiz.id}`;
      });
      break;
    }

    case "approve_replay":
    case "deny_replay": {
      requireLive(quiz);
      const id = uuid(action.requestId, "Anfrage-ID");
      await sql.begin(async (tx) => {
        const [rq] = await tx<{ team_id: string; song_id: string }[]>`
          update replay_requests rr set status = ${action.type === "approve_replay" ? "approved" : "denied"}
          from teams t
          where rr.id = ${id} and rr.status = 'pending' and t.id = rr.team_id and t.quiz_id = ${quiz.id}
          returning rr.team_id, rr.song_id`;
        if (!rq) fail(404, "Anfrage nicht gefunden oder schon bearbeitet");
        if (action.type === "approve_replay") {
          await tx`
            insert into plays (team_id, song_id, used, granted) values (${rq.team_id}, ${rq.song_id}, 0, 2)
            on conflict (team_id, song_id) do update set granted = plays.granted + 1`;
        }
      });
      break;
    }

    case "remove_team": {
      await sql`delete from teams where id = ${uuid(action.teamId, "Team-ID")} and quiz_id = ${quiz.id}`;
      break;
    }

    default:
      fail(400, "Unbekannte Aktion");
  }

  await notify(quiz.id, "all");
  const [fresh] = await sql<QuizRow[]>`
    select id, hash, access_code, title, play_seconds, status, current_round_id, theme, accent_color from quizzes where id = ${quiz.id}`;
  return buildHostState(fresh);
});
