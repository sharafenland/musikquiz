/**
 * Dekorative Discokugel, die am rechten Rand ins Bild hängt. Reines SVG, Farben aus den
 * Theme-Variablen – passt sich also jedem Farbschema an. Liegt hinter allem (z-index -1).
 */

const R = 100; // Radius der Kugel
const CX = 130;
const CY = 250;
const STEP = 12; // Grad pro Spiegelplättchen
const RAD = Math.PI / 180;

// Licht von links oben (Bildschirm-y zeigt nach unten)
const L = (() => {
  const v = [-0.45, -0.55, 0.7];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
})();

const point = (lat: number, lon: number) =>
  `${(CX + R * Math.cos(lat * RAD) * Math.sin(lon * RAD)).toFixed(1)},${(CY - R * Math.sin(lat * RAD)).toFixed(1)}`;

interface Tile { d: string; fill: string }

/** Sichtbare Halbkugel als Raster aus Vierecken (orthografische Projektion). */
function buildTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let lat = -90; lat < 90; lat += STEP) {
    for (let lon = -90; lon < 90; lon += STEP) {
      const la = (lat + STEP / 2) * RAD;
      const lo = (lon + STEP / 2) * RAD;
      const n = [Math.cos(la) * Math.sin(lo), -Math.sin(la), Math.cos(la) * Math.cos(lo)];
      const light = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      // feste Pseudo-Zufallswerte, damit Server und Client dasselbe rendern
      const h = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453) % 1;
      const pct = Math.round(Math.min(100, 12 + 70 * light + (h - 0.5) * 22));
      let fill = `color-mix(in srgb, var(--text) ${pct}%, var(--bg))`;
      if (light > 0.93) fill = "var(--text)";
      else if (h < 0.12) fill = `color-mix(in srgb, var(--accent) ${Math.round(35 + 55 * light)}%, var(--bg))`;
      tiles.push({
        d: `M${point(lat, lon)}L${point(lat, lon + STEP)}L${point(lat + STEP, lon + STEP)}L${point(lat + STEP, lon)}Z`,
        fill,
      });
    }
  }
  return tiles;
}

const TILES = buildTiles();

const SPARKLES = [
  { x: 22, y: 150, s: 14, delay: "0s" },
  { x: 48, y: 372, s: 10, delay: "1.1s" },
  { x: 70, y: 196, s: 7, delay: "2.2s" },
];

const star = (x: number, y: number, s: number) =>
  `M${x},${y - s}Q${x},${y} ${x + s},${y}Q${x},${y} ${x},${y + s}Q${x},${y} ${x - s},${y}Q${x},${y} ${x},${y - s}Z`;

export function DiscoBall() {
  return (
    <div className="disco" aria-hidden>
      <svg viewBox="0 0 260 400" className="disco-svg">
        <defs>
          <radialGradient id="disco-glow">
            <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        {/* Schein muss ins viewBox passen, sonst sieht man eine eckige Kante */}
        <circle cx={CX} cy={CY} r={R * 1.28} fill="url(#disco-glow)" />
        <line x1={CX} y1={0} x2={CX} y2={CY - R - 8} style={{ stroke: "var(--faint)" }} strokeWidth={2} />
        <rect x={CX - 9} y={CY - R - 10} width={18} height={12} rx={3} style={{ fill: "var(--faint)" }} />
        <g style={{ stroke: "var(--bg)" }} strokeWidth={1.2} strokeLinejoin="round">
          {TILES.map((t, i) => <path key={i} d={t.d} style={{ fill: t.fill }} />)}
        </g>
        <circle cx={CX} cy={CY} r={R} fill="none" style={{ stroke: "var(--line)" }} strokeWidth={1.5} />
        {SPARKLES.map((p, i) => (
          <path key={i} className="disco-sparkle" d={star(p.x, p.y, p.s)} style={{ fill: "var(--accent)", animationDelay: p.delay }} />
        ))}
      </svg>
    </div>
  );
}
