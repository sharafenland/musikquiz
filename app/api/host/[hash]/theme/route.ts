import { db } from "@/lib/server/db";
import { requireHost } from "@/lib/server/auth";
import { fail, readJson, route } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";
import { buildHostState } from "@/lib/server/state";
import { HEX_RE, isThemeId, type QuizTheme } from "@/lib/themes";

type Ctx = { params: Promise<{ hash: string }> };

/** Farbschema setzen – geht in jedem Zustand, Teams und Beamer übernehmen es sofort. */
export const PUT = route(async (req, { params }: Ctx) => {
  const quiz = await requireHost(req, (await params).hash);
  const body = await readJson<Partial<QuizTheme>>(req);
  if (!isThemeId(body?.preset)) fail(400, "Unbekanntes Farbschema");
  const accent = body.accent ?? null;
  if (accent !== null && !(typeof accent === "string" && HEX_RE.test(accent))) fail(400, "Ungültige Akzentfarbe");

  await db()`update quizzes set theme = ${body.preset}, accent_color = ${accent}, updated_at = now() where id = ${quiz.id}`;
  await notify(quiz.id, "all");
  return buildHostState({ ...quiz, theme: body.preset, accent_color: accent });
});
