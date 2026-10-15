/**
 * Seeded PRNG (mulberry32). The seed lives in the game state so the engine
 * stays pure and replayable; only the host ever sees it.
 */
export function nextRandom(seed: number): [value: number, seed: number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Fisher-Yates shuffle in place. Returns the advanced seed. */
export function shuffle<T>(items: T[], seed: number): number {
  for (let i = items.length - 1; i > 0; i--) {
    const [r, s] = nextRandom(seed);
    seed = s;
    const j = Math.floor(r * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return seed;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! | 0;
}
