import { MINUS } from './cards';
import type { Player, PlayerId } from './game';

export interface RoundResult {
  player: PlayerId;
  numbers: number;
  half: boolean;
  minus: number;
  zero: boolean;
  flip7: boolean;
  busted: boolean;
  score: number;
}

/** Scoring order from the rulebook: sum, ÷2 (round down), minus, floor 0, +15. */
export function scorePlayer(p: Player, flip7: boolean): RoundResult {
  let numbers = 0;
  let half = false;
  let minus = 0;
  let zero = false;
  for (const c of p.line) {
    if (c.kind === 'num') {
      numbers += c.value;
      if (c.special === 'zero') zero = true;
    } else if (c.mod === 'half') {
      half = true;
    } else {
      minus += MINUS[c.mod];
    }
  }
  const busted = p.status === 'busted';
  let score = 0;
  if (!busted && !(zero && !flip7)) {
    score = Math.max(0, (half ? Math.floor(numbers / 2) : numbers) - minus);
    if (flip7) score += 15;
  }
  return { player: p.id, numbers, half, minus, zero, flip7, busted, score };
}
