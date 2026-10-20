import "server-only";
import { db } from "./db";
import type { QuizRow } from "./auth";
import { rankTeams } from "../ranking";
import { DEFAULT_THEME, isThemeId, type QuizTheme } from "../themes";
import type { HostRound, HostState, RankingRow, RoundStatus, ScreenState, TeamState, TemplateQuestion } from "../types";

interface RoundRow { id: string; position: number; title: string; status: RoundStatus; unlocked_count: number }
interface SongRow {
  id: string; round_id: string; position: number; youtube_url: string; video_id: string;
  start_seconds: number; host_note: string;
}
interface QuestionRow { id: string; song_id: string; position: number; text: string; max_points: number; solution: string }

const quizTheme = (q: QuizRow): QuizTheme => ({
  preset: isThemeId(q.theme) ? q.theme : DEFAULT_THEME,
  accent: q.accent_color,
});

export async function loadStructure(quizId: string): Promise<HostRound[]> {
  const sql = db();
  const [rounds, songs, questions] = await Promise.all([
    sql<(RoundRow & { question_template: TemplateQuestion[] })[]>`
      select id, position, title, status, unlocked_count, question_template from rounds
      where quiz_id = ${quizId} order by position`,
    sql<SongRow[]>`select s.id, s.round_id, s.position, s.youtube_url, s.video_id, s.start_seconds, s.host_note
                   from songs s join rounds r on r.id = s.round_id
                   where r.quiz_id = ${quizId} order by s.position`,
    sql<QuestionRow[]>`select q.id, q.song_id, q.position, q.text, q.max_points, q.solution
                       from questions q join songs s on s.id = q.song_id join rounds r on r.id = s.round_id
                       where r.quiz_id = ${quizId} order by q.position`,
  ]);
  return rounds.map((r) => ({
    id: r.id,
    position: r.position,
    title: r.title,
    status: r.status,
    unlockedCount: r.unlocked_count,
    questionTemplate: r.question_template ?? [],
    songs: songs
      .filter((s) => s.round_id === r.id)
      .map((s) => ({
        id: s.id,
        position: s.position,
        youtubeUrl: s.youtube_url,
        videoId: s.video_id,
        startSeconds: s.start_seconds,
        hostNote: s.host_note,
        questions: questions
          .filter((q) => q.song_id === s.id)
          .map((q) => ({ id: q.id, position: q.position, text: q.text, maxPoints: q.max_points, solution: q.solution })),
      })),
  }));
}

async function computeRanking(quizId: string, rounds: HostRound[]): Promise<RankingRow[]> {
  const sql = db();
  const [teams, scores] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from teams where quiz_id = ${quizId}`,
    sql<{ team_id: string; question_id: string; points: number }[]>`
      select sc.team_id, sc.question_id, sc.points from scores sc
      join teams t on t.id = sc.team_id where t.quiz_id = ${quizId}`,
  ]);
  const roundOfQuestion = new Map<string, string>();
  for (const r of rounds) for (const s of r.songs) for (const q of s.questions) roundOfQuestion.set(q.id, r.id);
  return rankTeams(
    teams.map((t) => {
      const perRound: Record<string, number> = {};
      let total = 0;
      for (const sc of scores) {
        if (sc.team_id !== t.id) continue;
        const rid = roundOfQuestion.get(sc.question_id);
        if (!rid) continue;
        perRound[rid] = (perRound[rid] ?? 0) + sc.points;
        total += sc.points;
      }
      return { teamId: t.id, name: t.name, total: Math.round(total * 100) / 100, perRound };
    }),
  );
}

export async function buildHostState(quiz: QuizRow): Promise<HostState> {
  const sql = db();
  const rounds = await loadStructure(quiz.id);
  const [teams, plays, requests, answers, scores, ranking] = await Promise.all([
    sql<{ id: string; name: string; created_at: Date }[]>`
      select id, name, created_at from teams where quiz_id = ${quiz.id} order by created_at`,
    sql<{ team_id: string; song_id: string; used: number; granted: number }[]>`
      select p.team_id, p.song_id, p.used, p.granted from plays p
      join teams t on t.id = p.team_id where t.quiz_id = ${quiz.id}`,
    sql<{ id: string; team_id: string; song_id: string; created_at: Date }[]>`
      select r.id, r.team_id, r.song_id, r.created_at from replay_requests r
      join teams t on t.id = r.team_id where t.quiz_id = ${quiz.id} and r.status = 'pending'
      order by r.created_at`,
    sql<{ team_id: string; question_id: string; text: string }[]>`
      select a.team_id, a.question_id, a.text from answers a
      join teams t on t.id = a.team_id where t.quiz_id = ${quiz.id}`,
    sql<{ team_id: string; question_id: string; points: number }[]>`
      select sc.team_id, sc.question_id, sc.points from scores sc
      join teams t on t.id = sc.team_id where t.quiz_id = ${quiz.id}`,
    computeRanking(quiz.id, rounds),
  ]);
  return {
    quiz: {
      id: quiz.id,
      hash: quiz.hash,
      title: quiz.title,
      playSeconds: quiz.play_seconds,
      theme: quizTheme(quiz),
      status: quiz.status,
      accessCode: quiz.access_code,
      currentRoundId: quiz.current_round_id,
    },
    rounds,
    teams: teams.map((t) => ({ id: t.id, name: t.name, createdAt: t.created_at.toISOString() })),
    plays: plays.map((p) => ({ teamId: p.team_id, songId: p.song_id, used: p.used, granted: p.granted })),
    requests: requests.map((r) => ({
      id: r.id, teamId: r.team_id, songId: r.song_id, createdAt: r.created_at.toISOString(),
    })),
    answers: answers.map((a) => ({ teamId: a.team_id, questionId: a.question_id, text: a.text })),
    scores: scores.map((s) => ({ teamId: s.team_id, questionId: s.question_id, points: s.points })),
    ranking,
  };
}

export async function buildTeamState(quiz: QuizRow, team: { id: string; name: string }): Promise<TeamState> {
  const sql = db();
  const [{ count: roundCount }] = await sql<{ count: number }[]>`
    select count(*)::int as count from rounds where quiz_id = ${quiz.id}`;

  const state: TeamState = {
    quiz: { id: quiz.id, title: quiz.title, status: quiz.status, playSeconds: quiz.play_seconds, roundCount, theme: quizTheme(quiz) },
    team,
    round: null,
    podium: null,
  };

  if (quiz.status === "finished") {
    state.podium = await computeRanking(quiz.id, await loadStructure(quiz.id));
    return state;
  }
  if (quiz.status !== "live" || !quiz.current_round_id) return state;

  const [round] = await sql<RoundRow[]>`
    select id, position, title, status, unlocked_count from rounds where id = ${quiz.current_round_id}`;
  if (!round) return state;

  const [songs, songCountRow] = await Promise.all([
    sql<(SongRow & { used: number | null; granted: number | null; replay: string | null })[]>`
      select s.id, s.position, s.video_id, s.start_seconds,
             p.used, p.granted,
             (select rr.status from replay_requests rr
               where rr.team_id = ${team.id} and rr.song_id = s.id
               order by rr.created_at desc limit 1) as replay
      from songs s
      left join plays p on p.song_id = s.id and p.team_id = ${team.id}
      where s.round_id = ${round.id} and s.position < ${round.unlocked_count}
      order by s.position`,
    sql<{ count: number }[]>`select count(*)::int as count from songs where round_id = ${round.id}`,
  ]);
  const songIds = songs.map((s) => s.id);
  const questions = songIds.length
    ? await sql<{ id: string; song_id: string; text: string; max_points: number; answer: string | null }[]>`
        select q.id, q.song_id, q.text, q.max_points, a.text as answer
        from questions q
        left join answers a on a.question_id = q.id and a.team_id = ${team.id}
        where q.song_id in ${sql(songIds)}
        order by q.position`
    : [];

  state.round = {
    id: round.id,
    position: round.position,
    title: round.title,
    status: round.status,
    songCount: songCountRow[0].count,
    songs: songs.map((s) => {
      const used = s.used ?? 0;
      const granted = s.granted ?? 1;
      const canPlay = round.status === "active" && used < granted;
      return {
        id: s.id,
        position: s.position,
        used,
        granted,
        ...(canPlay ? { videoId: s.video_id, startSeconds: s.start_seconds } : {}),
        replay: s.replay === "pending" ? "pending" : s.replay === "denied" ? "denied" : "none",
        questions: questions
          .filter((q) => q.song_id === s.id)
          .map((q) => ({ id: q.id, text: q.text, maxPoints: q.max_points, answer: q.answer ?? "" })),
      };
    }),
  };
  return state;
}

/** Öffentliche Beamer-Ansicht: keine Songs, keine Lösungen, keine Antworten. */
export async function buildScreenState(quiz: QuizRow): Promise<ScreenState> {
  const sql = db();
  const [rounds, teams] = await Promise.all([
    sql<(RoundRow & { song_count: number })[]>`
      select r.id, r.position, r.title, r.status, r.unlocked_count,
             (select count(*)::int from songs s where s.round_id = r.id) as song_count
      from rounds r where r.quiz_id = ${quiz.id} order by r.position`,
    sql<{ name: string }[]>`select name from teams where quiz_id = ${quiz.id} order by created_at`,
  ]);
  const cur = rounds.find((r) => r.id === quiz.current_round_id);
  return {
    quiz: { id: quiz.id, title: quiz.title, status: quiz.status, accessCode: quiz.access_code, roundCount: rounds.length, theme: quizTheme(quiz) },
    teams: teams.map((t) => t.name),
    round: cur
      ? { position: cur.position, title: cur.title, status: cur.status, unlockedCount: cur.unlocked_count, songCount: cur.song_count }
      : null,
    podium: quiz.status === "finished" ? await computeRanking(quiz.id, await loadStructure(quiz.id)) : null,
  };
}
