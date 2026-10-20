"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JoinForm } from "@/components/JoinForm";
import { TopBar } from "@/components/ui";
import { api, hostKeyStore, myQuizzes, type KnownQuiz } from "@/lib/client/api";

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [openHash, setOpenHash] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [mine, setMine] = useState<KnownQuiz[]>([]);

  useEffect(() => setMine(myQuizzes.list()), []);

  return (
    <main className="wrap">
      <TopBar />
      <section className="hero">
        <h1>
          Pub-Quiz, aber mit <em>Musik</em>.
        </h1>
        <p>
          Runden und Songs anlegen, live schalten, Teams spielen die Ausschnitte selbst am Handy –
          du steuerst alles und vergibst am Ende die Punkte.
        </p>
      </section>

      <div className="grid-3">
        <section className="card stack">
          <h2>Mitspielen</h2>
          <p className="muted small">Code vom Host eingeben, Teamnamen wählen, los geht’s.</p>
          <JoinForm />
        </section>

        <section className="card stack">
          <h2>Quiz erstellen</h2>
          <p className="muted small">Du bekommst einen Quiz-Hash und einen geheimen Host-Schlüssel.</p>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setCreating(true);
              setCreateError(null);
              try {
                const res = await api<{ hash: string; hostKey: string; accessCode: string }>("/api/quizzes", {
                  method: "POST",
                  body: { title },
                });
                hostKeyStore.set(res.hash, res.hostKey);
                myQuizzes.upsert({ hash: res.hash, title: title || "Neues Musikquiz", createdAt: new Date().toISOString() });
                router.push(`/host/${res.hash}?neu=1`);
              } catch (err) {
                setCreateError((err as Error).message);
                setCreating(false);
              }
            }}
          >
            <label className="field">
              Titel
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. 90er-Abend im Hirsch" maxLength={120} />
            </label>
            {createError && <div className="alert">{createError}</div>}
            <button className="btn primary" disabled={creating}>{creating ? "Lege an …" : "Neues Quiz anlegen"}</button>
          </form>
        </section>

        <section className="card stack">
          <h2>Quiz öffnen</h2>
          <p className="muted small">Mit Quiz-Hash und Host-Schlüssel – auch von einem anderen Gerät.</p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const hash = openHash.trim().replace(/.*\/host\//, "").replace(/[#?].*/, "");
              if (openKey.trim()) hostKeyStore.set(hash, openKey.trim());
              router.push(`/host/${hash}`);
            }}
          >
            <label className="field">
              Quiz-Hash
              <input className="input mono" value={openHash} onChange={(e) => setOpenHash(e.target.value)} placeholder="k3x9q2mz" required />
            </label>
            <label className="field">
              Host-Schlüssel
              <input className="input mono" value={openKey} onChange={(e) => setOpenKey(e.target.value)} placeholder="••••••••••••" type="password" />
            </label>
            <button className="btn">Öffnen</button>
          </form>
          {mine.length > 0 && (
            <>
              <hr className="divider" />
              <p className="small muted">Zuletzt auf diesem Gerät</p>
              <ul className="list">
                {mine.map((q) => (
                  <li key={q.hash}>
                    <Link className="grow" href={`/host/${q.hash}`}>{q.title}</Link>
                    <span className="mono small faint">{q.hash}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
