/**
 * The title's drawn parts as SVG markup: the opening's ward line over the dark, the forged logo, the
 * panel's ward rim, the small icons and the peoples' emblems (warded brass, plan 17.1). Static markup;
 * TitleScreen.ts puts it in place and title.css animates it.
 */
import { Rng } from '@futuremagic/core';
import type { People } from './lines';

const WARD = '#8fe3ff', HOT = '#e8fbff';

/** A gently wandering line across the land (1600 × 900 picture units), different every start. */
export function wardLine(seed: number): string {
  const rng = new Rng(seed);
  const pts: [number, number][] = [];
  let y = rng.range(480, 600);
  for (let x = -60; x <= 1660; x += 86) {
    pts.push([x, y]);
    y = Math.min(660, Math.max(430, y + rng.range(-38, 38)));
  }
  // Smooth: quadratic curves through the midpoints.
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(0)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, yy] = pts[i], [nx, ny] = pts[i + 1];
    d += ` Q${x} ${yy.toFixed(0)} ${((x + nx) / 2).toFixed(0)} ${((yy + ny) / 2).toFixed(0)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]} ${last[1].toFixed(0)}`;
}

/** The dark over the painted land, the fuse and the dawn breaking along it. */
export function dawnSvg(line: string): string {
  return `<svg class="t-dawn" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<filter id="t-soft" filterUnits="userSpaceOnUse" x="-600" y="-1400" width="2800" height="3700"><feGaussianBlur stdDeviation="70"/></filter>
<filter id="t-haze" filterUnits="userSpaceOnUse" x="-400" y="-200" width="2400" height="1300"><feGaussianBlur stdDeviation="28"/></filter>
<filter id="t-bloom" filterUnits="userSpaceOnUse" x="-400" y="-200" width="2400" height="1300"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<mask id="t-night" maskUnits="userSpaceOnUse" x="-400" y="-400" width="2400" height="1700">
<rect x="-400" y="-400" width="2400" height="1700" fill="#fff"/>
<path class="reveal" d="${line}" fill="none" stroke="#000" stroke-linecap="round" filter="url(#t-soft)"/>
</mask>
</defs>
<rect x="-400" y="-400" width="2400" height="1700" fill="#030406" mask="url(#t-night)"/>
<path class="glow" d="${line}" fill="none" stroke="#ffb35a" stroke-width="150" stroke-linecap="round" filter="url(#t-haze)"/>
<path class="fuse" d="${line}" pathLength="100" fill="none" stroke="${WARD}" stroke-width="3" stroke-linecap="round" filter="url(#t-bloom)"/>
<circle class="sparkhead" r="7" fill="${HOT}" filter="url(#t-bloom)" opacity="0">
<animateMotion begin="0.4s" dur="1.7s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.6 1" path="${line}"/>
<animate attributeName="opacity" begin="0.4s" dur="1.75s" values="1;1;0" keyTimes="0;0.95;1" fill="freeze"/>
</circle>
</svg>`;
}

const GEAR = 'M21 2h6l1 6 4 2 5-4 4 4-4 5 2 4 6 1v6l-6 1-2 4 4 5-4 4-5-4-4 2-1 6h-6l-1-6-4-2-5 4-4-4 4-5-2-4-6-1v-6l6-1 2-4-4-5 4-4 5 4 4-2z';

/** A small gear (buttons). */
export const gearIcon = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="${GEAR}" fill="#6e4f17"/><circle cx="24" cy="24" r="7" fill="#e2bd68"/></svg>`;

/** The town crier's bell. */
export const bellIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v.7A6 6 0 0 1 18 10v4l2 3H4l2-3v-4a6 6 0 0 1 4.5-5.8v-.7A1.5 1.5 0 0 1 12 2z" fill="#3a2a12"/><circle cx="12" cy="19.5" r="2" fill="#3a2a12"/></svg>`;

/** The logo: "MasterWorld" poured in brass, ward-traced, a gear locking it. */
export function logoSvg(): string {
  const text = (cls: string, extra: string) =>
    `<text class="${cls}" x="440" y="158" text-anchor="middle" font-family="'Marcellus SC', Georgia, serif" font-size="112" textLength="790" lengthAdjust="spacingAndGlyphs" ${extra}>MASTERWORLD</text>`;
  return `<svg viewBox="0 0 880 240" role="img" aria-label="MasterWorld">
<defs>
<linearGradient id="t-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".32" stop-color="#e8c470"/><stop offset=".55" stop-color="#b08532"/><stop offset=".78" stop-color="#d9b25e"/><stop offset="1" stop-color="#6e4f17"/></linearGradient>
<linearGradient id="t-molten" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a1a" stop-opacity="0"/><stop offset=".7" stop-color="#ff8a2a"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>
<linearGradient id="t-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="t-letters">${text('', '')}</clipPath>
<filter id="t-wardglow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${text('', 'fill="#120c06" transform="translate(3 4)"')}
<g clip-path="url(#t-letters)">
<rect x="0" y="0" width="880" height="240" fill="#2a1c0c"/>
<g class="pour"><rect x="-10" y="0" width="900" height="240" fill="url(#t-brass)"/><rect class="melt" x="790" y="0" width="100" height="240" fill="url(#t-molten)"/></g>
<rect class="glint" x="0" y="0" width="150" height="240" fill="url(#t-shine)"/>
</g>
${text('ward', `fill="none" stroke="${WARD}" stroke-width="1.6" filter="url(#t-wardglow)"`)}
${text('run', `fill="none" stroke="${HOT}" stroke-width="2.6" stroke-linecap="round"`)}
<g transform="translate(818 26)"><g class="gear"><path d="${GEAR}" fill="#c99a3e" stroke="#6e4f17" stroke-width="1.5"/><circle cx="24" cy="24" r="7" fill="#1d1510" stroke="${WARD}" stroke-width="1.5"/></g></g>
</svg>`;
}

/** The panel's rim, where its ward runs. */
export const rimSvg = `<svg class="t-rim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<rect class="ward" x="1.5" y="1.5" width="97" height="97" rx="1.5" pathLength="100" fill="none" stroke="${WARD}" stroke-width="2" vector-effect="non-scaling-stroke" filter="drop-shadow(0 0 3px ${WARD})"/>
<rect class="run" x="1.5" y="1.5" width="97" height="97" rx="1.5" pathLength="100" fill="none" stroke="${HOT}" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</svg>`;

/** Each people's emblem, doing something in character. */
export function emblemSvg(id: People['id']): string {
  const open = '<svg class="emblem" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="25" fill="#1d1510" stroke="#b08532" stroke-width="2"/>';
  const brass = '#e2bd68';
  switch (id) {
    case 'humans':
      return `${open}<rect x="20" y="20" width="14" height="22" fill="${brass}"/><path d="M18 20h4v-4h3v4h4v-4h3v4h4v3H18z" fill="${brass}"/><rect x="25" y="32" width="4" height="10" fill="#1d1510"/><path d="M27 16V6" stroke="${brass}" stroke-width="1.5"/><path class="flag" d="M27.5 6h10l-3 3 3 3h-10z" fill="${WARD}"/></svg>`;
    case 'dwarves':
      return `${open}<path d="M12 36h30l-4 4H16zM16 32h22v4H16z" fill="${brass}"/><g class="hammer"><rect x="31" y="12" width="3" height="20" rx="1" fill="#8a6726"/><rect x="25" y="9" width="15" height="7" rx="1" fill="${brass}"/></g><g class="sparks" stroke="${WARD}" stroke-width="1.5"><path d="M24 30l-4-4M27 29v-5M30 30l4-4"/></g></svg>`;
    case 'halflings':
      return `${open}<path d="M17 20h18v18a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3z" fill="${brass}"/><path d="M35 24h3a4 4 0 0 1 0 8h-3" fill="none" stroke="${brass}" stroke-width="3"/><path d="M17 20h18v4H17z" fill="#fff0c0"/><path class="steam" d="M22 16c-2-3 2-4 0-7" fill="none" stroke="${WARD}" stroke-width="1.5"/><path class="steam b" d="M29 16c-2-3 2-4 0-7" fill="none" stroke="${WARD}" stroke-width="1.5"/></svg>`;
    case 'elves':
      return `${open}<g class="leaf"><path d="M27 44C14 34 16 18 27 9c11 9 13 25 0 35z" fill="${brass}"/><path d="M27 44V14M27 24l-5-4M27 30l5-4M27 36l-5-4" stroke="#6e4f17" stroke-width="1.4" fill="none"/></g><circle cx="38" cy="14" r="1.6" fill="${WARD}"/><circle cx="15" cy="20" r="1.2" fill="${WARD}"/></svg>`;
  }
}
