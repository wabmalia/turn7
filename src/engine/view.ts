import type { GameState } from './game';

/** What clients receive: everything is face up except the deck order and seed. */
export type PublicState = Omit<GameState, 'deck' | 'seed'> & { deckCount: number };

export function publicView(s: GameState): PublicState {
  const { deck, seed: _seed, ...rest } = s;
  return { ...rest, deckCount: deck.length };
}
