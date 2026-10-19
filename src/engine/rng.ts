/**
 * Shuffling. Real games use the browser's cryptographically secure random
 * source, so every one of the 108! deck orders is possible and no shuffle can
 * be predicted from earlier ones. Tests pass a seed instead and get a
 * repeatable mulberry32 sequence.
 */

/** Seed for repeatable shuffles in tests; null means secure randomness. */
export type Seed = number | null;

/** Seeded PRNG (mulberry32), tests only. */
export function nextRandom(seed: number): [value: number, seed: number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

const buf = new Uint32Array(1);
const RANGE = 2 ** 32;

/** Uniform integer in [0, n) from crypto.getRandomValues. */
export function secureInt(n: number): number {
  // Rejection sampling: values in the incomplete top slice of the 32-bit range
  // would make some results slightly more likely, so redraw those.
  const limit = RANGE - (RANGE % n);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % n;
}

/** Fisher-Yates shuffle in place. Returns the advanced seed (null stays null). */
export function shuffle<T>(items: T[], seed: Seed): Seed {
  for (let i = items.length - 1; i > 0; i--) {
    let j: number;
    if (seed === null) {
      j = secureInt(i + 1);
    } else {
      const [r, s] = nextRandom(seed);
      seed = s;
      j = Math.floor(r * (i + 1));
    }
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return seed;
}
