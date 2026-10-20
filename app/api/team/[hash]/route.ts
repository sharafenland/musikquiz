import { requireTeam } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { buildTeamState } from "@/lib/server/state";

type Ctx = { params: Promise<{ hash: string }> };

/** Gefilterter Zustand für ein Team – nur freigeschaltete Songs, keine Lösungen. */
export const GET = route(async (req, { params }: Ctx) => {
  const { quiz, team } = await requireTeam(req, (await params).hash);
  return buildTeamState(quiz, team);
});
