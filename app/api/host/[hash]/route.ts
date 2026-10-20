import { db } from "@/lib/server/db";
import { requireHost } from "@/lib/server/auth";
import { fail, readJson, route, uuid } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";
import { buildHostState } from "@/lib/server/state";
import { parseYouTube } from "@/lib/youtube";
import type { StructureInput } from "@/lib/types";

type Ctx = { params: Promise<{ hash: string }> };

/** Kompletter Zustand für den Host (inkl. Lösungen, Antworten, Punkte). */
export const GET = route(async (req, { params }: Ctx) => {
  const quiz = await requireHost(req, (await params).hash);
  return buildHostState(quiz);
});

/** Quiz-Struktur speichern (nur im Entwurf). Ersetzt Runden/Songs/Fragen atomar. */
export const PUT = route(async (req, { params }: Ctx) => {
  const quiz = await requireHost(req, (await params).hash);
  if (quiz.status !== "draft") fail(409, "Ein live geschaltetes Quiz kann nicht bearbeitet werden. Erst zurücksetzen.");

  const body = await readJson<StructureInput>(req);
  const title = String(body.title ?? "").trim().slice(0, 120) || "Neues Musikquiz";
  const playSeconds = Math.round(Number(body.playSeconds));
  if (!(playSeconds >= 3 && playSeconds <= 600)) fail(400, "Abspieldauer muss zwischen 3 und 600 Sekunden liegen");
  if (!Array.isArray(body.rounds)) fail(400, "Runden fehlen");

  // Validieren & normalisieren, bevor irgendetwas geschrieben wird
  const rounds = body.rounds.map((r, ri) => ({
    id: uuid(r.id, "Runden-ID"),
    position: ri,
    title: String(r.title ?? "").trim().slice(0, 120),
    // leere Zeilen der Vorlage werden einfach nicht gespeichert
    questionTemplate: (Array.isArray(r.questionTemplate) ? r.questionTemplate : [])
      .map((t) => ({ id: uuid(t.id, "Vorlagen-ID"), text: String(t.text ?? "").trim().slice(0, 500), maxPoints: Number(t.maxPoints) }))
      .filter((t) => t.text)
      .slice(0, 20)
      .map((t, ti) => {
        if (!(t.maxPoints >= 0 && t.maxPoints <= 1000)) fail(400, `Runde ${ri + 1}, Standardfrage ${ti + 1}: Ungültige Punktzahl`);
        return { ...t, maxPoints: Math.round(t.maxPoints * 100) / 100 };
      }),
    songs: (Array.isArray(r.songs) ? r.songs : []).map((s, si) => {
      const label = `Runde ${ri + 1}, Song ${si + 1}`;
      const yt = parseYouTube(String(s.youtubeUrl ?? ""));
      if (!yt) fail(400, `${label}: Kein gültiger YouTube-Link`);
      const start = Math.max(0, Math.round(Number(s.startSeconds) || 0));
      return {
        id: uuid(s.id, "Song-ID"),
        position: si,
        youtubeUrl: String(s.youtubeUrl).trim().slice(0, 500),
        videoId: yt.videoId,
        startSeconds: start,
        hostNote: String(s.hostNote ?? "").trim().slice(0, 200),
        questions: (Array.isArray(s.questions) ? s.questions : []).map((q, qi) => {
          const text = String(q.text ?? "").trim().slice(0, 500);
          if (!text) fail(400, `${label}, Frage ${qi + 1}: Fragetext fehlt`);
          const maxPoints = Number(q.maxPoints);
          if (!(maxPoints >= 0 && maxPoints <= 1000)) fail(400, `${label}, Frage ${qi + 1}: Ungültige Punktzahl`);
          return {
            id: uuid(q.id, "Frage-ID"),
            position: qi,
            text,
            maxPoints: Math.round(maxPoints * 100) / 100,
            solution: String(q.solution ?? "").trim().slice(0, 300),
          };
        }),
      };
    }),
  }));

  await db().begin(async (tx) => {
    await tx`update quizzes set title = ${title}, play_seconds = ${playSeconds}, updated_at = now()
             where id = ${quiz.id}`;
    await tx`delete from rounds where quiz_id = ${quiz.id}`; // kaskadiert auf Songs & Fragen
    for (const r of rounds) {
      await tx`insert into rounds (id, quiz_id, position, title, question_template)
               values (${r.id}, ${quiz.id}, ${r.position}, ${r.title}, ${tx.json(r.questionTemplate)})`;
      for (const s of r.songs) {
        await tx`insert into songs (id, round_id, position, youtube_url, video_id, start_seconds, host_note)
                 values (${s.id}, ${r.id}, ${s.position}, ${s.youtubeUrl}, ${s.videoId}, ${s.startSeconds}, ${s.hostNote})`;
        for (const q of s.questions) {
          await tx`insert into questions (id, song_id, position, text, max_points, solution)
                   values (${q.id}, ${s.id}, ${q.position}, ${q.text}, ${q.maxPoints}, ${q.solution})`;
        }
      }
    }
  });
  await notify(quiz.id, "host");
  return buildHostState({ ...quiz, title, play_seconds: playSeconds });
});
