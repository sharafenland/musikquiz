import "server-only";
import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

/** Wraps a route handler: JSON responses, HttpError → status, everything else → 500. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      const pg = e as { code?: string };
      if (pg.code === "23505") return NextResponse.json({ error: "Eintrag existiert bereits." }, { status: 409 });
      console.error(e);
      return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return fail(400, "Ungültiger Request-Body");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v: unknown, what = "ID"): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) fail(400, `Ungültige ${what}`);
  return v as string;
}
