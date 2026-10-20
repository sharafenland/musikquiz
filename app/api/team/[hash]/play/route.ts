import { db } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/auth";
import { fail, readJson, route } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";
import { requirePlayableSong } from "@/lib/server/songs";

type Ctx = { params: Promise<{ hash: string }> };

/** Verbraucht eine Wiedergabe. Schlägt fehl, wenn keine mehr übrig ist. */
export const POST = route(async (req, { params }: Ctx) => {
  const { quiz, team } = await requireTeam(req, (await params).hash);
  const body = await readJson<{ songId: string }>(req);
  const song = await requirePlayableSong(quiz, body.songId);
  const sql = db();
  const ok = await sql.begin(async (tx) => {
    await tx`insert into plays (team_id, song_id) values (${team.id}, ${song.id}) on conflict do nothing`;
    const res = await tx`
      update plays set used = used + 1
      where team_id = ${team.id} and song_id = ${song.id} and used < granted`;
    return res.count > 0;
  });
  if (!ok) fail(409, "Du hast diesen Song schon gehört – frag beim Host nach „Erneut hören“");
  await notify(quiz.id, "host");
  return { videoId: song.video_id, startSeconds: song.start_seconds, playSeconds: quiz.play_seconds };
});
