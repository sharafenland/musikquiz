"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, teamStore } from "@/lib/client/api";

export function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ hash: string; teamId: string; name: string; token: string }>("/api/join", {
            method: "POST",
            body: { accessCode: code, name },
          });
          teamStore.set(res.hash, { token: res.token, teamId: res.teamId, name: res.name });
          router.push(`/play/${res.hash}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Zugangscode
        <input
          className="input code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          autoComplete="off"
          inputMode="text"
          required
        />
      </label>
      <label className="field">
        Teamname
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Die Notenchecker"
          maxLength={40}
          required
        />
      </label>
      {error && <div className="alert">{error}</div>}
      <button className="btn primary lg" disabled={busy || code.length < 6 || !name.trim()}>
        {busy ? "Trete bei …" : "Mitspielen"}
      </button>
    </form>
  );
}
