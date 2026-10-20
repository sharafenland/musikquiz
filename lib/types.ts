import type { QuizTheme } from "./themes";

export type QuizStatus = "draft" | "live" | "finished";
export type RoundStatus = "pending" | "active" | "grading" | "done";

/* ---------- Editor payload (host → server) ---------- */

/** Standardfrage einer Runde – ohne Lösung, die ist je Song verschieden. */
export interface TemplateQuestion {
  id: string;
  text: string;
  maxPoints: number;
}
export interface QuestionInput {
  id: string;
  text: string;
  maxPoints: number;
  solution: string;
}
export interface SongInput {
  id: string;
  youtubeUrl: string;
  startSeconds: number;
  hostNote: string;
  questions: QuestionInput[];
}
export interface RoundInput {
  id: string;
  title: string;
  questionTemplate: TemplateQuestion[];
  songs: SongInput[];
}
export interface StructureInput {
  title: string;
  playSeconds: number;
  rounds: RoundInput[];
}

/* ---------- Host state (server → host) ---------- */

export interface HostQuestion extends QuestionInput {
  position: number;
}
export interface HostSong extends Omit<SongInput, "questions"> {
  position: number;
  videoId: string;
  questions: HostQuestion[];
}
export interface HostRound {
  id: string;
  position: number;
  title: string;
  status: RoundStatus;
  unlockedCount: number;
  questionTemplate: TemplateQuestion[];
  songs: HostSong[];
}
export interface RankingRow {
  teamId: string;
  name: string;
  total: number;
  rank: number;
  perRound: Record<string, number>;
}
export interface HostState {
  quiz: {
    id: string;
    hash: string;
    title: string;
    playSeconds: number;
    status: QuizStatus;
    accessCode: string;
    currentRoundId: string | null;
    theme: QuizTheme;
  };
  rounds: HostRound[];
  teams: { id: string; name: string; createdAt: string }[];
  plays: { teamId: string; songId: string; used: number; granted: number }[];
  requests: { id: string; teamId: string; songId: string; createdAt: string }[];
  answers: { teamId: string; questionId: string; text: string }[];
  scores: { teamId: string; questionId: string; points: number }[];
  ranking: RankingRow[];
}

/* ---------- Team state (server → team) ---------- */

export interface TeamSong {
  id: string;
  position: number;
  used: number;
  granted: number;
  /** only present while the team may still play the song */
  videoId?: string;
  startSeconds?: number;
  replay: "none" | "pending" | "denied";
  questions: { id: string; text: string; maxPoints: number; answer: string }[];
}
export interface TeamState {
  quiz: { id: string; title: string; status: QuizStatus; playSeconds: number; roundCount: number; theme: QuizTheme };
  team: { id: string; name: string };
  round: null | {
    id: string;
    position: number;
    title: string;
    status: RoundStatus;
    songCount: number;
    songs: TeamSong[];
  };
  podium: RankingRow[] | null;
}

/* ---------- Host-Aktionen ---------- */

export type HostAction =
  | { type: "go_live" }
  | { type: "start_round"; roundId: string }
  | { type: "unlock_next"; roundId: string }
  | { type: "close_round"; roundId: string }
  | { type: "reopen_round"; roundId: string }
  | { type: "complete_grading"; roundId: string }
  | { type: "reopen_grading"; roundId: string }
  | { type: "finish_quiz" }
  | { type: "reopen_quiz" }
  | { type: "reset" }
  | { type: "approve_replay"; requestId: string }
  | { type: "deny_replay"; requestId: string }
  | { type: "remove_team"; teamId: string };

/* ---------- Beamer-Ansicht (öffentlich) ---------- */

export interface ScreenState {
  quiz: { id: string; title: string; status: QuizStatus; accessCode: string; roundCount: number; theme: QuizTheme };
  teams: string[];
  round: null | { position: number; title: string; status: RoundStatus; unlockedCount: number; songCount: number };
  podium: RankingRow[] | null;
}
