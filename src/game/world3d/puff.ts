import { inputTuning } from "../tuning/input";

/** One mote of the click marker's puff. */
export type Mote = {
  /** Where it is from the click point, in the floor plane (tiles). */
  offset: { x: number; y: number };
  /** How high its centre is above the floor (tiles). */
  height: number;
  /** How big it is (tiles across). */
  size: number;
};

/** A small seeded random source (mulberry32), so a point always scatters alike. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the click point. */
function seedOf(at: { x: number; y: number }): number {
  const x = Math.round(at.x * 1000);
  const y = Math.round(at.y * 1000);
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/** How much of the reach the nearest mote gets, as a fraction (the rest is random). */
const REACH_FLOOR = 0.55;
/** How much of the rise the lowest mote gets, as a fraction (the rest is random). */
const RISE_FLOOR = 0.4;
/** How small the smallest mote is, as a fraction of the tuned size. */
const SIZE_FLOOR = 0.7;
/** How far a mote may be pushed off its even spacing round the point (of one gap). */
const ANGLE_JITTER = 0.6;
/** How far above the floor the lowest mote's underside lies, so it doesn't fight with it (tiles). */
const LIFT = 0.07;
/** How fast the spread slows down: higher is more front-loaded. */
const EASE_POWER = 3;

/** The part of one mote's puff that doesn't change with progress. */
type Spoke = {
  cos: number;
  sin: number;
  reach: number;
  rise: number;
  size: number;
};

/**
 * A click point's scatter: the seeded part of the puff, worked out once per
 * point, and the motes `puffOf` poses from it (reused, so drawing allocates
 * nothing).
 */
export type Scatter = { spokes: Spoke[]; motes: Mote[] };

/** The seeded scatter of a puff at `at`: the same point always scatters alike. */
export function scatterOf(at: { x: number; y: number }): Scatter {
  const { motes, reach, rise, size } = inputTuning.clickPuff;
  const random = seeded(seedOf(at));
  const turn = random() * Math.PI * 2;
  const spokes = Array.from({ length: motes }, (_, i) => {
    const angle = turn + ((i + ANGLE_JITTER * random()) / motes) * Math.PI * 2;
    return {
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      reach: reach * (REACH_FLOOR + (1 - REACH_FLOOR) * random()),
      rise: rise * (RISE_FLOOR + (1 - RISE_FLOOR) * random()),
      size: size * (SIZE_FLOOR + (1 - SIZE_FLOOR) * random()),
    };
  });
  return {
    spokes,
    motes: spokes.map((spoke) => ({
      offset: { x: 0, y: 0 },
      height: 0,
      size: spoke.size,
    })),
  };
}

/** How opaque the whole puff is `progress` (0..1) of the way through. */
export function puffOpacity(progress: number): number {
  return Math.max(0, 1 - progress);
}

/**
 * Poses the scatter's motes `progress` (0..1) of the way through the click
 * marker and returns them. Most of the spread happens early. A mote's height
 * is its centre's, so every mote lies fully above the floor. The motes are
 * the scatter's own, overwritten by the next call.
 */
export function puffOf(scatter: Scatter, progress: number): Mote[] {
  const eased = 1 - (1 - progress) ** EASE_POWER;
  scatter.spokes.forEach((spoke, i) => {
    const mote = scatter.motes[i];
    mote.offset.x = spoke.cos * spoke.reach * eased;
    mote.offset.y = spoke.sin * spoke.reach * eased;
    mote.height = LIFT + spoke.size / 2 + spoke.rise * eased;
  });
  return scatter.motes;
}
