"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JoinForm } from "@/components/JoinForm";
import { TopBar } from "@/components/ui";

function Join() {
  const params = useSearchParams();
  const code = (params.get("code") ?? "").toUpperCase().slice(0, 6);
  return (
    <main className="wrap narrow">
      <TopBar />
      <section className="card stack-lg" style={{ maxWidth: 440, margin: "24px auto" }}>
        <div className="stack">
          <h1>Mitspielen</h1>
          <p className="muted">Gebt euren Teamnamen ein – den Code habt ihr vom Host.</p>
        </div>
        <JoinForm initialCode={code} />
      </section>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
