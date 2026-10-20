import { db } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/auth";
import { fail, readJson, route } from "@/lib/server/http";
import { notify } from "@/lib/server/notify";
import { requirePlayableSong } from "@/lib/server/songs";

type Ctx = { params: Promise<{ hash: string }> };

/** „Erneut hören“ anfragen – der Host muss freigeben. */
export const POST = route(async (req, { params }: Ctx) => {
  const { quiz, team } = await requireTeam(req, (await params).hash);
  const body = await readJson<{ songId: string }>(req);
  const song = await requirePlayableSong(quiz, body.songId);
  const sql = db();
  const [p] = await sql<{ used: number; granted: number }[]>`
    select used, granted from plays where team_id = ${team.id} and song_id = ${song.id}`;
  if (!p || p.used < p.granted) fail(409, "Du kannst den Song noch abspielen");
  await sql`
    insert into replay_requests (team_id, song_id) values (${team.id}, ${song.id})
    on conflict (team_id, song_id) where status = 'pending' do nothing`;
  await notify(quiz.id, "all");
  return { ok: true };
});
