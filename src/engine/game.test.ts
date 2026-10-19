import { describe, expect, it } from 'vitest';
import { buildDeck, DECK_SIZE, type Act, type Card, type Mod } from './cards';
import { advance, apply, createGame, player, type GameAction, type GameState } from './game';
import { scorePlayer } from './score';
import { botAction } from './bot';
import { nextRandom, secureInt } from './rng';

// Test card factories. Ids start high so they never clash with buildDeck().
let nextId = 1000;
const n = (value: number): Card => ({ id: nextId++, kind: 'num', value });
const zero = (): Card => ({ id: nextId++, kind: 'num', value: 0, special: 'zero' });
const u7 = (): Card => ({ id: nextId++, kind: 'num', value: 7, special: 'unlucky7' });
const l13 = (): Card => ({ id: nextId++, kind: 'num', value: 13, special: 'lucky13' });
const mod = (m: Mod): Card => ({ id: nextId++, kind: 'mod', mod: m });
const act = (a: Act): Card => ({ id: nextId++, kind: 'act', act: a });

/** Players A, B, C with C dealing, so the deal and turns start at A. */
function game(deck: Card[], names = ['A', 'B', 'C'], target = 200): GameState {
  const players = names.map((id) => ({ id, name: id }));
  return settle(createGame(players, { seed: 1, deck, dealer: names.length - 1, target }));
}

/** Skip through Flip Four pauses, like the host's timer does. */
function settle(s: GameState): GameState {
  while (s.paused) s = advance(s);
  return s;
}

function play(s: GameState, who: string, ...actions: GameAction[]): GameState {
  for (const a of actions) s = settle(apply(s, who, a));
  return s;
}
const HIT: GameAction = { t: 'hit' };
const STAY: GameAction = { t: 'stay' };
const OK: GameAction = { t: 'ack' };
const target = (id: string): GameAction => ({ t: 'player', target: id });
const pickCards = (...cards: Card[]): GameAction => ({ t: 'cards', cards: cards.map((c) => c.id) });
const values = (s: GameState, id: string) =>
  player(s, id).line.map((c) => (c.kind === 'num' ? c.value : c.kind === 'mod' ? c.mod : '?'));
const status = (s: GameState, id: string) => player(s, id).status;

describe('deck', () => {
  it('has the Vengeance composition', () => {
    const d = buildDeck();
    expect(d).toHaveLength(DECK_SIZE);
    expect(new Set(d.map((c) => c.id)).size).toBe(DECK_SIZE);
    const count = (v: number) => d.filter((c) => c.kind === 'num' && c.value === v).length;
    expect(count(13)).toBe(13); // 12 + Lucky 13
    expect(count(12)).toBe(12);
    expect(count(7)).toBe(7); // 6 + Unlucky 7
    expect(count(1)).toBe(1);
    expect(count(0)).toBe(1); // The Zero
    expect(d.filter((c) => c.kind === 'mod')).toHaveLength(6);
    expect(d.filter((c) => c.kind === 'act')).toHaveLength(10);
  });
});

describe('shuffling', () => {
  it('secureInt stays in range and reaches every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = secureInt(7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(7);
      seen.add(x);
    }
    expect(seen.size).toBe(7);
  });

  it('real games use secure randomness: no seed, and different decks each time', () => {
    const players = [{ id: 'A', name: 'A' }];
    const a = createGame(players, {});
    const b = createGame(players, {});
    expect(a.seed).toBeNull();
    const order = (s: GameState) => [...s.players[0]!.line, ...s.deck].map((c) => c.id).join(',');
    expect(order(a)).not.toBe(order(b));
    expect(a.deck.length + a.players[0]!.line.length + a.discard.length).toBeLessThanOrEqual(DECK_SIZE);
  });
});

describe('round flow', () => {
  it('deals one card each starting left of the dealer, then A takes the first turn', () => {
    const s = game([n(5), n(6), n(8), n(9)]);
    expect(values(s, 'A')).toEqual([5]);
    expect(values(s, 'B')).toEqual([6]);
    expect(values(s, 'C')).toEqual([8]);
    expect(s.phase).toBe('playing');
    expect(s.prompt).toEqual({ kind: 'turn', player: 'A', canStay: true });
    const s2 = play(s, 'A', HIT);
    expect(values(s2, 'A')).toEqual([5, 9]);
    expect(s2.prompt?.player).toBe('B');
  });

  it('rejects decisions from the wrong player', () => {
    const s = game([n(5), n(6), n(8)]);
    expect(() => apply(s, 'B', HIT)).toThrow('Not your decision');
  });

  it('busts on a duplicate number', () => {
    const s = play(game([n(5), n(6), n(8), n(5)]), 'A', HIT);
    expect(status(s, 'A')).toBe('busted');
  });

  it('skips stayed and busted players and ends when nobody is active', () => {
    let s = game([n(5), n(6), n(8), n(5)]);
    s = play(s, 'A', HIT); // busts
    s = play(s, 'B', STAY);
    expect(s.prompt?.player).toBe('C');
    s = play(s, 'C', STAY);
    expect(s.phase).toBe('roundEnd');
    expect(s.results!.map((r) => r.score)).toEqual([0, 6, 8]);
    expect(player(s, 'C').total).toBe(8);
  });

  it('Flip 7 ends the round immediately with a 15 point bonus', () => {
    let s = game([n(1), n(2), n(3), n(4), n(5), n(6), n(8), n(9)], ['A']);
    for (let i = 0; i < 6; i++) s = play(s, 'A', HIT);
    expect(s.phase).toBe('roundEnd');
    expect(s.flip7).toEqual(['A']);
    expect(player(s, 'A').total).toBe(1 + 2 + 3 + 4 + 5 + 6 + 8 + 15);
    expect(s.deck).toHaveLength(1); // the 9 was never drawn
  });

  it('next round rotates the dealer, discards lines and keeps the deck', () => {
    let s = game([n(5), n(6), n(8), n(9), n(10), n(11), n(12)]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    s = play(s, 'C', STAY);
    s = apply(s, 'A', { t: 'nextRound' });
    expect(s.round).toBe(2);
    expect(s.dealer).toBe(0);
    // A deals now, so B gets the first card.
    expect(values(s, 'B')).toEqual([9]);
    expect(values(s, 'C')).toEqual([10]);
    expect(values(s, 'A')).toEqual([11]);
    expect(s.discard).toHaveLength(3);
  });

  it('reshuffles the discard pile when the deck runs out, leaving lines alone', () => {
    let s = game([n(5), n(6), n(8), n(9), n(10), n(11)]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    s = play(s, 'C', STAY);
    s = apply(s, 'A', { t: 'nextRound' }); // deals 9, 10, 11: deck empty
    expect(s.deck).toHaveLength(0);
    s = play(s, 'B', HIT); // reshuffles the 5, 6, 8 from round one
    expect(s.log).toContain('Deck reshuffled');
    expect(player(s, 'B').line).toHaveLength(2);
    expect(s.deck).toHaveLength(2);
  });

  it('forces a stay when no cards are left anywhere', () => {
    let s = game([n(5)], ['A']);
    s = play(s, 'A', HIT);
    expect(status(s, 'A')).toBe('stayed');
    expect(s.phase).toBe('roundEnd');
  });

  it('ties at the target are a shared win', () => {
    let s = game([n(9), n(9), n(1)], ['A', 'B'], 5);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    expect(s.phase).toBe('gameOver');
    expect(s.winners).toEqual(['A', 'B']);
  });
});

describe('scoring', () => {
  const p = (cards: Card[], st: 'active' | 'busted' = 'active') =>
    ({ id: 'X', name: 'X', line: cards, status: st, total: 0 }) as Parameters<typeof scorePlayer>[0];

  it('matches the rulebook example: 48, ÷2, -4, Flip 7 = 35', () => {
    const cards = [n(3), n(11), n(5), n(7), n(10), n(8), n(4), mod('half'), mod('m4')];
    expect(scorePlayer(p(cards), true).score).toBe(35);
  });

  it('halves rounding down before subtracting, and never goes below zero', () => {
    expect(scorePlayer(p([n(9), mod('half')]), false).score).toBe(4);
    expect(scorePlayer(p([n(3), mod('m10')]), false).score).toBe(0);
  });

  it('scores zero when busted', () => {
    expect(scorePlayer(p([n(9)], 'busted'), false).score).toBe(0);
  });
});

describe('The Zero', () => {
  it('hits automatically, after a pause, instead of offering hit or stay', () => {
    // No settle(): look at the raw pause.
    const s = createGame([{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], {
      seed: 1,
      dealer: 1,
      deck: [zero(), n(6), n(8), n(9)],
    });
    expect(s.paused).toBe(true);
    expect(s.prompt).toBeNull();
    expect(s.log).toContain('A hit automatically (The Zero)');
    expect(() => apply(s, 'A', STAY)).toThrow();
    const after = advance(s);
    expect(values(after, 'A')).toEqual([0, 8]);
    expect(after.prompt).toMatchObject({ kind: 'turn', player: 'B' });
  });

  it('scores zero unless you Flip 7', () => {
    // A auto-hits the 12, B and C stay, then A auto-hits an empty deck and must stay.
    let s = game([zero(), n(6), n(8), n(12)]);
    s = play(s, 'B', STAY);
    s = play(s, 'C', STAY);
    expect(values(s, 'A')).toEqual([0, 12]);
    expect(s.phase).toBe('roundEnd');
    expect(s.results![0]!.score).toBe(0);
    const flipped = scorePlayer({ id: 'X', name: 'X', status: 'active', total: 0, line: [zero(), n(1), n(2), n(3), n(4), n(5), n(6)] as never }, true);
    expect(flipped.score).toBe(21 + 15);
  });

  it('counts toward the 7 cards', () => {
    // Solo with The Zero: every hit is automatic.
    const s = game([zero(), n(1), n(2), n(3), n(4), n(5), n(6)], ['A']);
    expect(s.flip7).toEqual(['A']);
  });

  it('a forced stay from Just One More overrides must-hit', () => {
    // A: Zero. B: JOM targets A, A draws 9 and stays.
    let s = game([zero(), act('justOneMore'), n(9), n(8)]);
    s = play(s, 'B', target('A'));
    expect(values(s, 'A')).toEqual([0, 9]);
    expect(status(s, 'A')).toBe('stayed');
  });
});

describe('Unlucky 7', () => {
  it('discards your line and cannot bust you, but a later 7 does', () => {
    let s = game([n(7), n(6), n(8), mod('m2'), u7(), n(7)], ['A', 'B', 'C']);
    // A holds a 7 and keeps a -2, then flips the Unlucky 7.
    s = play(s, 'A', HIT, target('A'));
    expect(values(s, 'A')).toEqual([7, 'm2']);
    s = play(s, 'B', STAY);
    s = play(s, 'C', STAY);
    s = play(s, 'A', HIT); // Unlucky 7
    expect(status(s, 'A')).toBe('active');
    expect(player(s, 'A').line).toHaveLength(1);
    expect(player(s, 'A').line[0]).toMatchObject({ special: 'unlucky7' });
    s = play(s, 'A', HIT); // regular 7
    expect(status(s, 'A')).toBe('busted');
  });

  it('during Flip Four, discards earlier cards and set-aside modifiers but keeps set-aside actions', () => {
    // C is dealt Flip Four and targets B (holding 5). B flips -2, Steal, Unlucky 7, 10.
    let s = game([n(3), n(5), act('flipFour'), mod('m2'), act('steal'), u7(), n(10)]);
    s = play(s, 'C', target('B'));
    // The 5 and the set-aside -2 are gone; the Steal still resolves (A's 3 is the only option).
    expect(s.prompt).toMatchObject({ kind: 'ack', player: 'B', text: "Steal: the only card to steal is A's 3" });
    s = play(s, 'B', OK);
    expect(values(s, 'B')).toEqual([7, 10, 3]);
    expect(s.discard.some((c) => c.kind === 'mod' && c.mod === 'm2')).toBe(true);
  });

  it('wipes the receiver when swapped to an opponent', () => {
    // A: U7, 2. B: 5, 4. C flips Swap and swaps A's U7 with B's 4.
    const unlucky = u7();
    const four = n(4);
    let s = game([unlucky, n(5), n(9), n(2), four, act('swap')]);
    s = play(s, 'A', HIT);
    s = play(s, 'B', HIT);
    s = play(s, 'C', HIT, pickCards(unlucky, four));
    expect(values(s, 'B')).toEqual([7]);
    expect(values(s, 'A')).toEqual([2, 4]);
  });
});

describe('Lucky 13', () => {
  it('allows a second 13 but busts on a third', () => {
    let s = game([n(13), n(1), n(2), l13(), n(13)], ['A', 'B', 'C']);
    s = play(s, 'A', HIT);
    expect(status(s, 'A')).toBe('active');
    s = play(s, 'B', STAY);
    s = play(s, 'C', STAY);
    s = play(s, 'A', HIT);
    expect(status(s, 'A')).toBe('busted');
  });

  it('the pair counts once toward Flip 7', () => {
    let s = game([l13(), n(13), n(1), n(2), n(3), n(4), n(5), n(6)], ['A']);
    for (let i = 0; i < 6; i++) s = play(s, 'A', HIT);
    expect(s.flip7).toEqual([]); // 13,13,1,2,3,4,5 = 6 distinct
    s = play(s, 'A', HIT);
    expect(s.flip7).toEqual(['A']);
  });

  it('a regular 13 left behind after the Lucky 13 is discarded is fine', () => {
    const lucky = l13();
    let s = game([lucky, n(1), n(2), n(13), act('discard')], ['A', 'B', 'C']);
    s = play(s, 'A', HIT);
    s = play(s, 'B', HIT, pickCards(lucky));
    expect(values(s, 'A')).toEqual([13]);
    expect(status(s, 'A')).toBe('active');
  });
});

describe('modifiers', () => {
  it('can be given to any non-busted player, including stayed ones', () => {
    let s = game([n(5), n(5), n(8), n(5), mod('m4')]);
    s = play(s, 'A', HIT); // A busts
    s = play(s, 'B', STAY);
    s = play(s, 'C', HIT);
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'C', options: ['B', 'C'] });
    s = play(s, 'C', target('B'));
    expect(values(s, 'B')).toEqual([5, 'm4']);
  });

  it('let you choose anyone when nobody has busted, in a 2 player game', () => {
    let s = game([n(5), n(6), mod('m8')], ['A', 'B']);
    s = play(s, 'A', HIT);
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'A', options: ['A', 'B'] });
  });

  it('let you choose when dealt in the opening deal', () => {
    const s = game([mod('m8'), n(6)], ['A', 'B']);
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'A', options: ['A', 'B'] });
  });

  it('are kept when you are the only non-busted player', () => {
    let s = game([n(5), n(6), n(5), mod('m2')], ['A', 'B']);
    s = play(s, 'A', HIT); // A busts
    s = play(s, 'B', HIT); // B flips -2 and must keep it
    expect(s.prompt).toMatchObject({ kind: 'ack', player: 'B', text: 'B must keep -2: everyone else has busted' });
    expect(() => apply(s, 'B', HIT)).toThrow('Click OK');
    s = play(s, 'B', OK);
    expect(values(s, 'B')).toEqual([6, 'm2']);
  });
});

describe('actions', () => {
  it('auto-target yourself when you are the only player left', () => {
    let s = game([n(5), n(6), n(5), act('flipFour'), n(1), n(2), n(3), n(4)], ['A', 'B']);
    s = play(s, 'A', HIT); // A busts
    s = play(s, 'B', HIT); // B flips Flip Four, must target self
    expect(s.prompt).toMatchObject({ kind: 'ack', text: 'B is the only player left, so Flip Four! must be played on them' });
    s = play(s, 'B', OK);
    expect(values(s, 'B')).toEqual([6, 1, 2, 3, 4]);
  });

  it('are discarded with no effect when there is no legal target', () => {
    let s = game([act('steal'), n(1), n(2)]);
    // Shown to everyone with the card; dealing waits until A clicks OK.
    expect(s.prompt).toMatchObject({ kind: 'ack', player: 'A', card: { act: 'steal' }, text: 'Steal: there are no face-up cards to steal' });
    expect(values(s, 'B')).toEqual([]);
    s = play(s, 'A', OK);
    expect(values(s, 'A')).toEqual([]);
    expect(values(s, 'B')).toEqual([1]);
    expect(s.discard.map((c) => c.kind)).toEqual(['act']);
  });

  it('a stayed player resolves an action without re-entering', () => {
    // B stays, then A's JOM makes B draw a Flip Four that B resolves on C.
    let s = game([n(5), n(6), n(8), act('justOneMore'), act('flipFour'), n(1), n(2), n(3), n(4)]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    s = play(s, 'C', HIT, target('B'));
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'B' });
    s = play(s, 'B', target('C'));
    expect(status(s, 'B')).toBe('stayed');
    expect(values(s, 'C')).toEqual([8, 1, 2, 3, 4]);
  });
});

describe('Just One More!', () => {
  it('target takes one card and must stay', () => {
    let s = game([act('justOneMore'), n(4), n(6), n(9)]);
    s = play(s, 'A', target('B'));
    expect(values(s, 'B')).toEqual([4]);
    expect(status(s, 'B')).toBe('stayed');
    // B was stayed when their deal came round, so they were skipped.
    expect(values(s, 'C')).toEqual([6]);
    expect(s.prompt?.player).toBe('A');
  });

  it('the target resolves an action they draw', () => {
    let s = game([act('justOneMore'), act('flipFour'), n(1), n(2), n(3), n(4), n(5), n(6)]);
    s = play(s, 'A', target('B'));
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'B' });
    s = play(s, 'B', target('C'));
    // C then gets their own opening card.
    expect(values(s, 'C')).toEqual([1, 2, 3, 4, 5]);
    expect(status(s, 'B')).toBe('stayed');
  });

  it('can bust a stayed player', () => {
    let s = game([n(5), n(6), n(8), act('justOneMore'), n(5)]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    s = play(s, 'C', HIT, target('A'));
    expect(status(s, 'A')).toBe('busted');
  });
});

describe('Flip Four!', () => {
  it('pauses after each card so players can follow along', () => {
    let s = createGame([{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], {
      seed: 1,
      dealer: 1,
      deck: [act('flipFour'), n(1), n(2), n(3), n(4), n(9)],
    });
    s = apply(s, 'A', target('B'));
    const seen: number[] = [];
    while (s.paused) {
      seen.push(player(s, 'B').line.length);
      expect(s.prompt).toBeNull();
      expect(() => apply(s, 'B', HIT)).toThrow();
      s = advance(s);
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(s.prompt).toMatchObject({ kind: 'turn', player: 'A' });
  });

  it('resolves set-aside actions and modifiers after the four flips, in order', () => {
    let s = game([act('flipFour'), n(1), mod('m6'), act('swap'), n(2), n(9), n(10)]);
    s = play(s, 'A', target('B'));
    // B flipped 1, -6, Swap, 2. The -6 resolves first.
    expect(values(s, 'B')).toEqual([1, 2]);
    expect(s.prompt).toMatchObject({ kind: 'player', player: 'B', card: { mod: 'm6' } });
    s = play(s, 'B', target('B'));
    // Then the Swap: only B has cards, so it fizzles once B clicks OK.
    expect(s.prompt).toMatchObject({ kind: 'ack', text: 'Swap: needs face-up cards from two different players' });
    s = play(s, 'B', OK);
    expect(values(s, 'B')).toEqual([1, 2, 'm6', 9]);
  });

  it('stops on a bust and discards set-aside cards', () => {
    let s = game([act('flipFour'), n(1), mod('m6'), n(1), n(2), n(9)]);
    s = play(s, 'A', target('B'));
    expect(status(s, 'B')).toBe('busted');
    expect(s.discard.some((c) => c.kind === 'mod')).toBe(true);
    // C still gets their opening card.
    expect(s.deck.map((c) => (c.kind === 'num' ? c.value : c.kind))).toEqual([9]);
  });

  it('a Flip 7 mid-sequence ends the round and drops set-aside cards', () => {
    let s = game([n(1), n(2), n(3), n(4), n(5), act('flipFour'), mod('m2'), n(6), n(7), n(8)], ['A']);
    for (let i = 0; i < 5; i++) s = play(s, 'A', HIT);
    s = play(s, 'A', OK); // solo: Flip Four must be played on yourself
    expect(s.phase).toBe('roundEnd');
    expect(s.flip7).toEqual(['A']);
    expect(s.results![0]!.minus).toBe(0);
    expect(s.deck.map((c) => (c.kind === 'num' ? c.value : c.kind))).toEqual([8]);
  });

  it('can bust a stayed player', () => {
    let s = game([n(5), n(6), n(8), act('flipFour'), n(1), n(6)]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', STAY);
    s = play(s, 'C', HIT, target('B'));
    expect(status(s, 'B')).toBe('busted');
  });
});

describe('Steal', () => {
  it('moves a card into your line', () => {
    const six = n(6);
    let s = game([n(5), six, n(8), act('steal')]);
    s = play(s, 'A', HIT, pickCards(six));
    expect(values(s, 'A')).toEqual([5, 6]);
    expect(values(s, 'B')).toEqual([]);
  });

  it('busts you when you steal a duplicate', () => {
    const five = n(5);
    let s = game([n(5), five, n(8), act('steal')]);
    s = play(s, 'A', HIT, pickCards(five));
    expect(status(s, 'A')).toBe('busted');
  });

  it('cannot take from busted players or yourself', () => {
    let s = game([n(5), n(6), n(8), n(6), act('steal')]);
    s = play(s, 'A', STAY);
    s = play(s, 'B', HIT); // B busts
    s = play(s, 'C', HIT);
    // Only A's 5 is stealable, so it resolves once C clicks OK.
    s = play(s, 'C', OK);
    expect(values(s, 'C')).toEqual([8, 5]);
  });

  it('reaching 7 distinct numbers ends the round', () => {
    let s = game([n(1), n(7), n(2), n(3), n(4), n(5), n(6), act('steal')], ['A', 'B']);
    s = play(s, 'A', HIT); // 2
    s = play(s, 'B', STAY);
    for (let i = 0; i < 4; i++) s = play(s, 'A', HIT); // 3, 4, 5, 6
    s = play(s, 'A', HIT, OK); // Steal: B's 7 is the only option
    expect(s.phase).toBe('roundEnd');
    expect(s.flip7).toEqual(['A']);
  });
});

describe('Swap', () => {
  it('both players receive their new card at the same time; both can bust', () => {
    // A: 5, 6. B: 6, 5. Swapping A's 5 with B's 5? Same value: no bust.
    // Swap A's 6 for B's 5: A gets 5 (dup), B gets 6 (dup). Both bust.
    const a6 = n(6);
    const b5 = n(5);
    let s = game([n(5), n(6), n(8), a6, b5, act('swap')]);
    s = play(s, 'A', HIT); // A: 5, 6
    s = play(s, 'B', HIT); // B: 6, 5
    s = play(s, 'C', HIT, pickCards(a6, b5));
    expect(status(s, 'A')).toBe('busted');
    expect(status(s, 'B')).toBe('busted');
  });

  it('requires two different owners', () => {
    const a5 = n(5);
    const a6 = n(6);
    let s = game([a5, n(1), n(8), a6, n(2), act('swap')]);
    s = play(s, 'A', HIT);
    s = play(s, 'B', HIT);
    s = play(s, 'C', HIT);
    expect(() => play(s, 'C', pickCards(a5, a6))).toThrow('two different players');
  });

  it('can swap modifiers', () => {
    const ten = n(10);
    let s = game([n(5), n(6), ten, mod('m10'), act('swap')]);
    s = play(s, 'A', HIT, target('A'));
    const m = player(s, 'A').line[1]!;
    s = play(s, 'B', HIT, pickCards(m, ten));
    expect(values(s, 'A')).toEqual([5, 10]);
    expect(values(s, 'C')).toEqual(['m10']);
  });
});

describe('Discard', () => {
  it('removes any face-up card, including your own', () => {
    const six = n(6);
    let s = game([n(5), six, n(8), act('discard')]);
    s = play(s, 'A', HIT, pickCards(six));
    expect(values(s, 'B')).toEqual([]);
    expect(s.discard.map((c) => c.id)).toContain(six.id);
  });
});

describe('simulation', () => {
  function countCards(s: GameState): number {
    let total = s.deck.length + s.discard.length;
    for (const p of s.players) total += p.line.length;
    for (const t of s.stack) {
      if (t.t === 'flipFour') total += t.aside.length;
      if (t.t === 'aside') total += t.cards.length;
      if (t.t === 'act' || t.t === 'mod') total += 1;
    }
    if (s.prompt && s.prompt.kind !== 'turn') total += 1;
    return total;
  }

  it('random bot games never lose or duplicate cards and always finish', () => {
    let seed = 42;
    const rand = () => {
      const [r, next] = nextRandom(seed);
      seed = next;
      return r;
    };
    for (let g = 0; g < 300; g++) {
      const count = 1 + (g % 8);
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
      let s = createGame(players, { seed: g * 7919 + 1 });
      let steps = 0;
      while (s.phase !== 'gameOver') {
        expect(countCards(s)).toBe(DECK_SIZE);
        if (s.phase === 'roundEnd') {
          s = apply(s, 'p0', { t: 'nextRound' });
          continue;
        }
        if (s.paused) {
          s = advance(s);
          continue;
        }
        const who = s.prompt!.player;
        s = apply(s, who, botAction(s, who, rand)!);
        if (++steps > 20000) throw new Error('game did not finish');
      }
      expect(countCards(s)).toBe(DECK_SIZE);
      expect(s.winners!.length).toBeGreaterThan(0);
    }
    // ~2s locally, slower on CI runners.
  }, 60_000);
});
