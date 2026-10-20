import "server-only";
import postgres from "postgres";

type Sql = postgres.Sql<Record<string, unknown>>;

const g = globalThis as unknown as { __mqSql?: Sql };

/** Lazily created Postgres client (one per server instance). */
export function db(): Sql {
  if (!g.__mqSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe README).");
    g.__mqSql = connect(url);
  }
  return g.__mqSql;
}

function connect(url: string): Sql {
  try {
    return postgres(url, {
      // Supabase-Transaction-Pooler (Port 6543) unterstützt keine Prepared Statements
      prepare: false,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idle_timeout: 20,
      // numeric -> JS number
      types: {
        numeric: {
          to: 1700,
          from: [1700],
          serialize: (x: number) => String(x),
          parse: (x: string) => Number(x),
        },
      },
    }) as unknown as Sql;
  } catch {
    // Den Originalfehler bewusst nicht weiterreichen: er enthält die komplette URL samt Passwort.
    throw new Error(
      "DATABASE_URL lässt sich nicht lesen. Häufigste Ursache: Sonderzeichen im Passwort " +
        "(# @ / ? % :) – Passwort ohne Sonderzeichen setzen oder URL-kodieren (z. B. # → %23).",
    );
  }
}
