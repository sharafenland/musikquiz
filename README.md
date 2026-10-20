# 🎵 Musikquiz

Web-App zum Hosten von Musik-Pub-Quizzen. Der Host legt Runden, Songs (YouTube-Links) und Fragen an,
schaltet das Quiz live und steuert den Ablauf. Teams treten mit einem Zugangscode bei und spielen die
Songs selbst am Handy ab – ohne sichtbaren Player und nur für eine festgelegte Dauer.

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres + Realtime Broadcast)

---

## Ablauf

| Wer | Was |
|---|---|
| Host | Quiz anlegen → erhält **Quiz-Hash** (`/host/<hash>`), **Host-Schlüssel** und **Zugangscode** für Teams |
| Host | Runden → Songs (YouTube-Link, optionale Startzeit, private Notiz) → Fragen (Text, Punkte, Lösung). Mehrere Fragen pro Song möglich, Teilpunkte im Editor (z. B. `1,5`) |
| Host | „Live schalten“ → Teams treten über `/join` (Code oder QR-Code) bei |
| Host | Runde starten, Songs einzeln freischalten |
| Team | Song selbst starten – unsichtbarer YouTube-Player, stoppt automatisch nach *N* Sekunden (Quiz-Einstellung). Antworten direkt eintippen (optional) |
| Team | „Erneut hören“ anfragen → Host gibt frei oder lehnt ab |
| Host | Runde beenden → Punkte pro Team & Frage vergeben (Schnellknöpfe 0 / ½ / voll oder freie Teilpunkte) → „Runde abschließen“ (leere Felder = 0) |
| Host | Nach der letzten Runde: „Podest zeigen“ → alle Teams sehen Podest + Endstand (Gleichstände teilen sich den Platz) |

Weitere Details:
- **Beamer-Ansicht** `/screen/<hash>` (Button „📺 Beamer-Ansicht“ beim Host): Vor dem Start großer QR-Code + Zugangscode
  und die beigetretenen Teams, während der Runde Rundentitel und welcher Song freigeschaltet ist (QR-Code klein in der Ecke für
  Nachzügler), danach Auswertungs-Hinweis und am Ende das Podest. Braucht keinen Host-Schlüssel und zeigt nie Songtitel,
  Lösungen oder Antworten – kann also gefahrlos auf einem zweiten Gerät am Beamer laufen.
- Ein Quiz ist nur im **Entwurf** bearbeitbar. „Zurücksetzen“ löscht Teams/Antworten/Punkte und macht es wieder zum Entwurf.
- „Songtitel ausblenden“ versteckt die Host-Notizen in der Live-Ansicht (praktisch, wenn der Host-Bildschirm am Beamer hängt).
- Abgeschlossene Runden lassen sich über „Korrigieren“ wieder öffnen, ein beendetes Quiz über „Punkte korrigieren“.

## Setup

### 1. Supabase-Projekt

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. **SQL Editor** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) ausführen.
3. Werte besorgen:
   - **Project Settings → Database → Connection string → Transaction pooler** (Port `6543`) → `DATABASE_URL`
   - **Project Settings → API** → Project-URL, `anon`-Key, `service_role`-Key
4. **Realtime:** Unter *Realtime → Settings* darf „Allow public access“ / öffentliche Channels nicht abgeschaltet sein
   (Standard). Die App schickt darüber nur datenfreie „Bitte neu laden“-Pings.

### 2. Lokal starten

```bash
cp .env.example .env.local   # Werte eintragen
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deployen (z. B. Vercel)

Repo importieren, die vier Variablen aus `.env.example` als Environment Variables setzen, fertig.
`DATABASE_URL` unbedingt mit dem **Transaction Pooler** (Port 6543) verwenden – Serverless-Funktionen
öffnen sonst zu viele Verbindungen.

## Architektur

```
Browser (Host / Team)                 Next.js (Route Handlers)              Supabase
──────────────────────               ─────────────────────────             ─────────────
GET /api/host/:hash    (x-host-key) ─▶ prüft Schlüssel, baut Host-Zustand ─▶ Postgres (DATABASE_URL)
GET /api/team/:hash  (x-team-token) ─▶ gefilterter Team-Zustand
POST …/action, …/play, …           ─▶ Änderung in Transaktion ──────────▶ Realtime Broadcast „update“
        ▲                                                                        │
        └──────────── Ping „neu laden“ (Channel quiz-<id>) ◀─────────────────────┘
```

- **Kein direkter DB-Zugriff aus dem Browser.** RLS ist auf allen Tabellen aktiv, ohne Policies –
  mit dem öffentlichen anon-Key kommt niemand an Songs, Lösungen oder Antworten.
- **Rollen-gefilterte Zustände:** Teams bekommen nur freigeschaltete Songs der aktuellen Runde und nie
  Lösungen oder Host-Notizen. Die YouTube-ID wird nur ausgeliefert, solange das Team noch eine Wiedergabe übrig hat.
- **Wiedergaben werden serverseitig gezählt** (`plays.used < plays.granted`, atomar per `UPDATE … WHERE`).
  Eine Freigabe für „Erneut hören“ erhöht `granted` um 1.
- **Realtime + Polling:** Clients laden bei jedem Ping sofort neu; zusätzlich Polling alle 15 s
  (bzw. alle 3 s, falls Realtime nicht verbunden ist). Die App funktioniert also auch ganz ohne Realtime.
- **Auth ohne Accounts:** Host-Schlüssel und Team-Tokens werden nur als SHA-256-Hash gespeichert und
  im `localStorage` des jeweiligen Browsers gehalten. Der Host-Link `…/host/<hash>#k=<schlüssel>`
  trägt den Schlüssel im URL-Fragment, das nie an den Server geht.

```
app/
  page.tsx                  Start: Mitspielen / Quiz erstellen / Quiz öffnen
  join/page.tsx             Beitreten (?code=XXXXXX)
  host/[hash]/page.tsx      Host: Editor, Live-Steuerung, Auswertung, Podest
  play/[hash]/page.tsx      Team: Songs abspielen, Antworten, Podest
  screen/[hash]/page.tsx    Beamer: Code/QR, Rundenfortschritt, Podest (öffentlich)
  api/…                     Route Handlers (siehe oben)
components/                 Editor, LivePanel, Grading, Podium, …
lib/server/                 DB, Auth, Zustände, Realtime-Ping (nur Server)
lib/client/                 API-Client, useLive (Realtime/Polling), useYouTubeAudio
supabase/schema.sql         Tabellen + RLS
```

## Hinweise & Grenzen

- **Einbettung:** Manche Videos (v. a. offizielle Label-Uploads) erlauben keine Einbettung. Im Editor
  mit „▶ Vorhören“ prüfen – das nutzt denselben unsichtbaren Player wie die Teams und zeigt den Fehler an.
- **Mobil/Autoplay:** Die Wiedergabe startet direkt im Klick des Teams, damit iOS/Android Ton erlauben.
  Handy nicht stumm schalten.
- **YouTube-Nutzungsbedingungen:** Die IFrame-API-Richtlinien verlangen grundsätzlich einen sichtbaren Player.
  Ein versteckter Player ist für private Quizabende üblich, für ein öffentliches/kommerzielles Produkt
  solltest du das prüfen (Alternative: kleiner, abgedeckter Player oder eigene Audiodateien).
- **Schummeln:** Wer die Browser-Entwicklertools öffnet, kann die Video-ID eines gerade spielenden Songs sehen.
  Für ein Pub-Quiz ist das ein Vertrauensthema – technisch lässt es sich mit YouTube nicht verhindern.
