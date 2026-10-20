/** Farbschemata pro Quiz. Wird von Server (Validierung) und Client (Anwenden) genutzt. */

export interface ThemeColors {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  ok: string;
  warn: string;
  info: string;
  scheme: "dark" | "light";
}

export const THEMES = {
  nacht: {
    label: "Nachtblau",
    colors: {
      bg: "#0f1222", bg2: "#151a2e", surface: "#1b2138", surface2: "#242b46", line: "#313a5c",
      text: "#eef0fb", muted: "#a3a9c7", faint: "#6b7193", accent: "#8b97ff",
      ok: "#6fd39a", warn: "#ff7a6b", info: "#7cc4ff", scheme: "dark",
    },
  },
  beere: {
    label: "Beere",
    colors: {
      bg: "#180e16", bg2: "#20131e", surface: "#2a1927", surface2: "#352131", line: "#4a2e44",
      text: "#fbeef5", muted: "#c4a6b8", faint: "#86687a", accent: "#ff5c8a",
      ok: "#74d39b", warn: "#ff8a5c", info: "#9fb8ff", scheme: "dark",
    },
  },
  petrol: {
    label: "Petrol",
    colors: {
      bg: "#0b1a1c", bg2: "#102326", surface: "#142c30", surface2: "#1c383d", line: "#284b51",
      text: "#e9f6f4", muted: "#9dbcb8", faint: "#64817d", accent: "#2dd4bf",
      ok: "#86e08f", warn: "#ff7f6b", info: "#8fc7ff", scheme: "dark",
    },
  },
  bernstein: {
    label: "Bernstein",
    colors: {
      bg: "#121614", bg2: "#1a201d", surface: "#202824", surface2: "#29332e", line: "#34413a",
      text: "#f4ecdc", muted: "#a9a593", faint: "#6f7468", accent: "#f2a93b",
      ok: "#7fcf8f", warn: "#ff7a5c", info: "#8fbfe8", scheme: "dark",
    },
  },
  hell: {
    label: "Hell",
    colors: {
      bg: "#f5f4f1", bg2: "#ecebe6", surface: "#ffffff", surface2: "#f3f2ee", line: "#dad7cf",
      text: "#1d1c1a", muted: "#5d5a54", faint: "#8d8a83", accent: "#5b4cf0",
      ok: "#1d8a4b", warn: "#d4432a", info: "#2563eb", scheme: "light",
    },
  },
} satisfies Record<string, { label: string; colors: ThemeColors }>;

export type ThemeId = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeId = "nacht";

export interface QuizTheme {
  preset: ThemeId;
  /** eigene Akzentfarbe (#rrggbb) oder null = Akzent des Schemas */
  accent: string | null;
}

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && Object.hasOwn(THEMES, v);
export const HEX_RE = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG-Kontrast zweier Farben (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Alle CSS-Variablen für ein Quiz-Farbschema. */
export function themeVars(theme: QuizTheme | null | undefined): Record<string, string> {
  const preset = theme && isThemeId(theme.preset) ? theme.preset : DEFAULT_THEME;
  const c = THEMES[preset].colors;
  const accent = theme?.accent && HEX_RE.test(theme.accent) ? theme.accent : c.accent;
  return {
    "--bg": c.bg,
    "--bg-2": c.bg2,
    "--surface": c.surface,
    "--surface-2": c.surface2,
    "--line": c.line,
    "--text": c.text,
    "--muted": c.muted,
    "--faint": c.faint,
    "--accent": accent,
    // Schrift auf Akzent-Flächen: Schwarz oder Weiß, je nachdem was besser lesbar ist
    "--accent-ink": contrast(accent, "#111111") >= contrast(accent, "#ffffff") ? "#111111" : "#ffffff",
    "--ok": c.ok,
    "--warn": c.warn,
    "--info": c.info,
    "color-scheme": c.scheme,
  };
}
