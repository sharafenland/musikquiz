import { publicQuiz } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { buildScreenState } from "@/lib/server/state";

type Ctx = { params: Promise<{ hash: string }> };

/** Öffentlicher Zustand für den Beamer – kennt man den Quiz-Hash, darf man ihn sehen. */
export const GET = route(async (_req, { params }: Ctx) => buildScreenState(await publicQuiz((await params).hash)));
