import { ownerOf, player, type GameAction, type GameState, type PlayerId } from './game';

/**
 * A simple legal-move bot. Used by the simulation tests and to keep the game
 * moving when a player disconnects.
 */
export function botAction(s: GameState, id: PlayerId, rand: () => number = Math.random): GameAction | null {
  const prompt = s.prompt;
  if (!prompt || prompt.player !== id) return null;
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  switch (prompt.kind) {
    case 'ack':
      return { t: 'ack' };
    case 'turn': {
      if (!prompt.canStay) return { t: 'hit' };
      const sum = player(s, id).line.reduce((acc, c) => acc + (c.kind === 'num' ? c.value : 0), 0);
      return sum < 20 + rand() * 15 ? { t: 'hit' } : { t: 'stay' };
    }
    case 'player': {
      // Everything you can hand out hurts, so prefer someone else.
      const others = prompt.options.filter((o) => o !== id);
      return { t: 'player', target: pick(others.length ? others : prompt.options) };
    }
    case 'cards': {
      const first = pick(prompt.options);
      if (prompt.count === 1) return { t: 'cards', cards: [first] };
      const firstOwner = ownerOf(s, first);
      const second = pick(prompt.options.filter((c) => ownerOf(s, c) !== firstOwner));
      return { t: 'cards', cards: [first, second] };
    }
  }
}
