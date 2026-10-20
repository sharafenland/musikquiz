-- Musikquiz – Datenbankschema
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.
--
-- Die App greift ausschließlich serverseitig (über DATABASE_URL) auf die
-- Tabellen zu. RLS ist aktiviert und es gibt bewusst KEINE Policies:
-- Damit kann niemand mit dem öffentlichen anon-Key Songs oder Fragen
-- auslesen. Realtime wird nur als "Broadcast"-Ping genutzt (ohne Daten).

create table if not exists quizzes (
  id              uuid primary key default gen_random_uuid(),
  hash            text not null unique,              -- öffentliche Quiz-ID in der URL
  access_code     text not null unique,              -- Code, mit dem Teams beitreten
  host_key_hash   text not null,                     -- sha256 des Host-Schlüssels
  title           text not null default 'Neues Musikquiz',
  play_seconds    int  not null default 30 check (play_seconds between 3 and 600),
  status          text not null default 'draft' check (status in ('draft','live','finished')),
  current_round_id uuid,
  theme           text not null default 'nacht',     -- Farbschema, siehe lib/themes.ts
  accent_color    text check (accent_color ~* '^#[0-9a-f]{6}$'), -- eigene Akzentfarbe, null = vom Schema
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists rounds (
  id              uuid primary key,
  quiz_id         uuid not null references quizzes(id) on delete cascade,
  position        int  not null,
  title           text not null default '',
  status          text not null default 'pending' check (status in ('pending','active','grading','done')),
  unlocked_count  int  not null default 0,
  -- Standardfragen, die jeder neue Song dieser Runde bekommt: [{id, text, maxPoints}]
  question_template jsonb not null default '[]'
);
-- für bestehende Datenbanken (Spalten kamen später dazu)
alter table quizzes add column if not exists theme text not null default 'nacht';
alter table quizzes add column if not exists accent_color text check (accent_color ~* '^#[0-9a-f]{6}$');
alter table rounds add column if not exists question_template jsonb not null default '[]';
create index if not exists rounds_quiz_idx on rounds(quiz_id, position);

create table if not exists songs (
  id              uuid primary key,
  round_id        uuid not null references rounds(id) on delete cascade,
  position        int  not null,
  youtube_url     text not null,
  video_id        text not null,
  start_seconds   int  not null default 0 check (start_seconds >= 0),
  host_note       text not null default ''           -- z. B. "Queen – Bohemian Rhapsody", nur für den Host
);
create index if not exists songs_round_idx on songs(round_id, position);

create table if not exists questions (
  id              uuid primary key,
  song_id         uuid not null references songs(id) on delete cascade,
  position        int  not null,
  text            text not null,
  max_points      numeric(6,2) not null default 1 check (max_points >= 0),
  solution        text not null default ''           -- Lösung, nur für den Host
);
create index if not exists questions_song_idx on questions(song_id, position);

create table if not exists teams (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references quizzes(id) on delete cascade,
  name            text not null,
  token_hash      text not null,
  created_at      timestamptz not null default now(),
  unique (quiz_id, name)
);

-- Wie oft ein Team einen Song hören darf (granted) und schon gehört hat (used)
create table if not exists plays (
  team_id         uuid not null references teams(id) on delete cascade,
  song_id         uuid not null references songs(id) on delete cascade,
  used            int  not null default 0,
  granted         int  not null default 1,
  primary key (team_id, song_id)
);

create table if not exists replay_requests (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  song_id         uuid not null references songs(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at      timestamptz not null default now()
);
create index if not exists replay_team_song_idx on replay_requests(team_id, song_id);
-- höchstens eine offene Anfrage pro Team und Song
create unique index if not exists replay_one_pending
  on replay_requests(team_id, song_id) where status = 'pending';

create table if not exists answers (
  team_id         uuid not null references teams(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  text            text not null default '',
  updated_at      timestamptz not null default now(),
  primary key (team_id, question_id)
);

create table if not exists scores (
  team_id         uuid not null references teams(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  points          numeric(6,2) not null check (points >= 0),
  primary key (team_id, question_id)
);

alter table quizzes         enable row level security;
alter table rounds          enable row level security;
alter table songs           enable row level security;
alter table questions       enable row level security;
alter table teams           enable row level security;
alter table plays           enable row level security;
alter table replay_requests enable row level security;
alter table answers         enable row level security;
alter table scores          enable row level security;
