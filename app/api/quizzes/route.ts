import { db } from "@/lib/server/db";
import { newAccessCode, newHostKey, newQuizHash, sha256 } from "@/lib/server/auth";
import { fail, readJson, route } from "@/lib/server/http";

/** Neues Quiz anlegen → liefert Hash, Host-Schlüssel und Zugangscode. */
export const POST = route(async (req) => {
  const body = await readJson<{ title?: string }>(req);
  const title = (body.title ?? "").trim().slice(0, 120) || "Neues Musikquiz";
  const hostKey = newHostKey();
  for (let attempt = 0; attempt < 5; attempt++) {
    const hash = newQuizHash();
    const accessCode = newAccessCode();
    try {
      await db()`
        insert into quizzes (hash, access_code, host_key_hash, title)
        values (${hash}, ${accessCode}, ${sha256(hostKey)}, ${title})`;
      return { hash, hostKey, accessCode };
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // Kollision → neu würfeln
    }
  }
  fail(500, "Konnte keinen eindeutigen Code erzeugen");
});
