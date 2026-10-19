import {
  buildDeck,
  cardLabel,
  type ActCard,
  type Card,
  type CardId,
  type ModCard,
  type NumCard,
} from './cards';
import { shuffle, type Seed } from './rng';
import { scorePlayer, type RoundResult } from './score';

export type PlayerId = string;
export type Status = 'active' | 'stayed' | 'busted';

export interface Player {
  id: PlayerId;
  name: string;
  /** Number cards and modifiers in front of the player, in arrival order. */
  line: (NumCard | ModCard)[];
  status: Status;
  total: number;
}

/**
 * Pending effects, processed LIFO. Pushing a task on top of another makes it
 * resolve first, which is how "resolve immediately" nests inside Flip Four and
 * Just One More.
 */
export type Task =
  | { t: 'draw'; player: PlayerId }
  | { t: 'forceStay'; player: PlayerId }
  | { t: 'flipFour'; player: PlayerId; left: number; aside: (ActCard | ModCard)[] }
  | { t: 'aside'; player: PlayerId; cards: (ActCard | ModCard)[] }
  | { t: 'act'; player: PlayerId; card: ActCard }
  | { t: 'mod'; player: PlayerId; card: ModCard };

/** A decision the engine is waiting on. */
export type Prompt =
  | { kind: 'turn'; player: PlayerId; canStay: boolean }
  /** Pick a player: target of Just One More / Flip Four, or who gets a modifier. */
  | { kind: 'player'; player: PlayerId; card: ActCard | ModCard; options: PlayerId[] }
  /** Pick face-up cards: 1 for Steal/Discard, 2 (different owners) for Swap. */
  | { kind: 'cards'; player: PlayerId; card: ActCard; options: CardId[]; count: 1 | 2 }
  /**
   * No real choice: the card resolves one way (or fizzles). Shown to everyone
   * with the reason; the player clicks OK. No target and no cards = fizzle.
   */
  | {
      kind: 'ack';
      player: PlayerId;
      card: ActCard | ModCard;
      text: string;
      target?: PlayerId;
      cards?: CardId[];
    };

export type GameAction =
  | { t: 'hit' }
  | { t: 'stay' }
  | { t: 'player'; target: PlayerId }
  | { t: 'cards'; cards: CardId[] }
  | { t: 'ack' }
  | { t: 'nextRound' };

export interface GameState {
  phase: 'dealing' | 'playing' | 'roundEnd' | 'gameOver';
  round: number;
  target: number;
  players: Player[];
  dealer: number;
  /** deck[0] is the top card. */
  deck: Card[];
  discard: Card[];
  /** Only set in tests; real games shuffle with secure randomness (null). */
  seed: Seed;
  stack: Task[];
  prompt: Prompt | null;
  /**
   * Paused so players can follow along: between Flip Four cards, and before
   * an automatic hit for a player holding The Zero. The host calls advance()
   * after a short delay.
   */
  paused: boolean;
  /** Players dealt to so far in the opening deal. */
  dealt: number;
  /** Seat index to look for the next turn from. */
  nextTurn: number;
  /** Players who reached Flip 7 this round (ends the round). */
  flip7: PlayerId[];
  results: RoundResult[] | null;
  winners: PlayerId[] | null;
  log: string[];
}

export class EngineError extends Error {}

export const MAX_PLAYERS = 18;
const LOG_LIMIT = 200;

export interface NewGameOptions {
  /** Repeatable shuffles for tests. Omit for secure randomness. */
  seed?: number;
  target?: number;
  dealer?: number;
  /** Fixed deck order (top first) for tests. Skips the initial shuffle. */
  deck?: Card[];
}

export function createGame(players: { id: PlayerId; name: string }[], opts: NewGameOptions): GameState {
  if (players.length < 1) throw new EngineError('Need at least one player');
  if (players.length > MAX_PLAYERS) throw new EngineError(`At most ${MAX_PLAYERS} players`);
  let seed: Seed = opts.seed ?? null;
  let deck = opts.deck;
  if (!deck) {
    deck = buildDeck();
    seed = shuffle(deck, seed);
  }
  const s: GameState = {
    phase: 'roundEnd',
    round: 0,
    target: opts.target ?? 200,
    players: players.map((p) => ({ id: p.id, name: p.name, line: [], status: 'active', total: 0 })),
    dealer: opts.dealer ?? 0,
    deck,
    discard: [],
    seed,
    stack: [],
    prompt: null,
    paused: false,
    dealt: 0,
    nextTurn: 0,
    flip7: [],
    results: null,
    winners: null,
    log: [],
  };
  startRound(s);
  return s;
}

/** Apply a player's decision. Returns a new state; the input is not mutated. */
export function apply(state: GameState, playerId: PlayerId, action: GameAction): GameState {
  const s = structuredClone(state);
  if (action.t === 'nextRound') {
    if (s.phase !== 'roundEnd') throw new EngineError('Round is not over');
    s.dealer = (s.dealer + 1) % s.players.length;
    startRound(s);
    return s;
  }
  const prompt = s.prompt;
  if (!prompt) throw new EngineError('Nothing to decide right now');
  if (prompt.player !== playerId) throw new EngineError('Not your decision');
  const me = player(s, playerId);

  switch (prompt.kind) {
    case 'turn': {
      if (action.t !== 'hit' && action.t !== 'stay') throw new EngineError('Hit or stay');
      if (action.t === 'stay' && !prompt.canStay) throw new EngineError('The Zero: you must hit');
      s.prompt = null;
      s.nextTurn = (seat(s, playerId) + 1) % s.players.length;
      if (action.t === 'hit') {
        s.stack.push({ t: 'draw', player: playerId });
      } else {
        me.status = 'stayed';
        log(s, `${me.name} stayed`);
      }
      break;
    }
    case 'player': {
      if (action.t !== 'player') throw new EngineError('Pick a player');
      if (!prompt.options.includes(action.target)) throw new EngineError('Invalid target');
      s.prompt = null;
      if (prompt.card.kind === 'act') applyAct(s, me, prompt.card, [], action.target);
      else giveMod(s, me, prompt.card, action.target);
      break;
    }
    case 'cards': {
      if (action.t !== 'cards') throw new EngineError('Pick cards');
      const picked = action.cards;
      if (picked.length !== prompt.count || new Set(picked).size !== picked.length) {
        throw new EngineError(`Pick ${prompt.count} card(s)`);
      }
      if (!picked.every((c) => prompt.options.includes(c))) throw new EngineError('Invalid card');
      if (prompt.count === 2 && ownerOf(s, picked[0]!) === ownerOf(s, picked[1]!)) {
        throw new EngineError('Swap needs cards from two different players');
      }
      s.prompt = null;
      applyAct(s, me, prompt.card, picked, null);
      break;
    }
    case 'ack': {
      if (action.t !== 'ack') throw new EngineError('Click OK to continue');
      s.prompt = null;
      const { card, target, cards } = prompt;
      if (card.kind === 'mod') giveMod(s, me, card, target!);
      else if (target || cards) applyAct(s, me, card, cards ?? [], target ?? null);
      else s.discard.push(card);
      break;
    }
  }
  run(s);
  return s;
}

/** Continue after a Flip Four pause. */
export function advance(state: GameState): GameState {
  if (!state.paused) throw new EngineError('Not paused');
  const s = structuredClone(state);
  s.paused = false;
  run(s);
  return s;
}

// ---------------------------------------------------------------------------
// Round lifecycle

function startRound(s: GameState) {
  for (const p of s.players) {
    s.discard.push(...p.line);
    p.line = [];
    p.status = 'active';
  }
  s.round++;
  s.phase = 'dealing';
  s.dealt = 0;
  s.flip7 = [];
  s.results = null;
  s.stack = [];
  s.prompt = null;
  log(s, `Round ${s.round} started, ${s.players[s.dealer]!.name} dealt`);
  run(s);
}

/** Process tasks until a decision is needed or the round ends. */
function run(s: GameState) {
  const n = s.players.length;
  while (!s.prompt && !s.paused && (s.phase === 'dealing' || s.phase === 'playing')) {
    if (s.flip7.length) return endRound(s);
    const task = s.stack.pop();
    if (task) {
      process(s, task);
      continue;
    }
    if (s.phase === 'dealing') {
      if (s.dealt < n) {
        const p = s.players[(s.dealer + 1 + s.dealt) % n]!;
        s.dealt++;
        // Players already stayed or busted by an earlier action are skipped.
        if (p.status === 'active') s.stack.push({ t: 'draw', player: p.id });
        continue;
      }
      s.phase = 'playing';
      s.nextTurn = (s.dealer + 1) % n;
      continue;
    }
    const idx = nextActive(s, s.nextTurn);
    if (idx < 0) return endRound(s);
    const p = s.players[idx]!;
    if (hasSpecial(p, 'zero')) {
      // The Zero must keep hitting, so there's nothing to decide: hit for
      // them after the same short pause as a Flip Four card.
      s.nextTurn = (idx + 1) % n;
      log(s, `${p.name} hit automatically (The Zero)`);
      s.stack.push({ t: 'draw', player: p.id });
      s.paused = true;
      continue;
    }
    s.prompt = { kind: 'turn', player: p.id, canStay: true };
  }
  // A Flip 7 on a Flip Four card ends the round right away, no pause.
  if (s.paused && s.flip7.length) endRound(s);
}

function endRound(s: GameState) {
  // Anything still in flight (set-aside cards, unresolved actions) is dropped.
  for (const t of s.stack) {
    if (t.t === 'flipFour') s.discard.push(...t.aside);
    if (t.t === 'aside') s.discard.push(...t.cards);
    if (t.t === 'act' || t.t === 'mod') s.discard.push(t.card);
  }
  if (s.prompt && s.prompt.kind !== 'turn') s.discard.push(s.prompt.card);
  s.stack = [];
  s.prompt = null;
  s.paused = false;

  for (const id of s.flip7) log(s, `${player(s, id).name} TURNED 7!`);
  s.results = s.players.map((p) => scorePlayer(p, s.flip7.includes(p.id)));
  for (const r of s.results) player(s, r.player).total += r.score;

  const best = Math.max(...s.players.map((p) => p.total));
  if (best >= s.target) {
    s.phase = 'gameOver';
    s.winners = s.players.filter((p) => p.total === best).map((p) => p.id);
    log(s, `Game over: ${s.winners.map((id) => player(s, id).name).join(' & ')} won with ${best}`);
  } else {
    s.phase = 'roundEnd';
  }
}

// ---------------------------------------------------------------------------
// Tasks

function process(s: GameState, task: Task) {
  const p = player(s, task.player);
  switch (task.t) {
    case 'draw': {
      if (p.status === 'busted') return;
      const c = draw(s);
      if (!c) return outOfCards(s, p);
      log(s, `${p.name} flipped ${cardLabel(c)}`);
      if (c.kind === 'act') s.stack.push({ t: 'act', player: p.id, card: c });
      else if (c.kind === 'mod') s.stack.push({ t: 'mod', player: p.id, card: c });
      else receive(s, p, c);
      return;
    }
    case 'forceStay': {
      if (p.status === 'active') {
        p.status = 'stayed';
        log(s, `${p.name} had to stay`);
      }
      return;
    }
    case 'flipFour': {
      if (p.status === 'busted') {
        s.discard.push(...task.aside);
        return;
      }
      if (task.left === 0) {
        if (task.aside.length) s.stack.push({ t: 'aside', player: p.id, cards: task.aside });
        return;
      }
      const c = draw(s);
      if (!c) {
        outOfCards(s, p);
        s.stack.push({ ...task, left: 0 });
        return;
      }
      log(s, `${p.name} flipped ${cardLabel(c)} (Flip Four ${5 - task.left}/4)`);
      const aside = [...task.aside];
      if (c.kind === 'num') {
        receive(s, p, c);
        if (c.special === 'unlucky7') {
          // "Discard all previous cards first": includes set-aside modifiers.
          s.discard.push(...aside.filter((a) => a.kind === 'mod'));
          aside.splice(0, aside.length, ...aside.filter((a) => a.kind === 'act'));
        }
      } else {
        aside.push(c);
      }
      s.stack.push({ ...task, left: task.left - 1, aside });
      s.paused = true;
      return;
    }
    case 'aside': {
      if (p.status === 'busted') {
        s.discard.push(...task.cards);
        return;
      }
      const [first, ...rest] = task.cards;
      if (rest.length) s.stack.push({ ...task, cards: rest });
      if (!first) return;
      if (first.kind === 'act') s.stack.push({ t: 'act', player: p.id, card: first });
      else s.stack.push({ t: 'mod', player: p.id, card: first });
      return;
    }
    case 'act':
      return resolveAct(s, p, task.card);
    case 'mod': {
      const options = nonBusted(s).map((x) => x.id);
      if (options.length === 1) {
        const text = `${p.name} must keep ${cardLabel(task.card)}: everyone else has busted`;
        return forced(s, p, task.card, text, { target: options[0]! });
      }
      s.prompt = { kind: 'player', player: p.id, card: task.card, options };
      return;
    }
  }
}

function resolveAct(s: GameState, p: Player, card: ActCard) {
  const live = nonBusted(s);
  switch (card.act) {
    case 'justOneMore':
    case 'flipFour': {
      const options = live.map((x) => x.id);
      if (options.length === 1) {
        const text = `${p.name} is the only player left, so ${cardLabel(card)} must be played on them`;
        return forced(s, p, card, text, { target: options[0]! });
      }
      s.prompt = { kind: 'player', player: p.id, card, options };
      return;
    }
    case 'steal':
    case 'discard': {
      const owners = card.act === 'steal' ? live.filter((x) => x.id !== p.id) : live;
      const options = owners.flatMap((x) => x.line.map((c) => c.id));
      const verb = card.act === 'steal' ? 'steal' : 'discard';
      if (options.length === 0) {
        return forced(s, p, card, `${cardLabel(card)}: there are no face-up cards to ${verb}`, {});
      }
      if (options.length === 1) {
        const owner = ownerOf(s, options[0]!)!;
        const c = owner.line.find((x) => x.id === options[0])!;
        const text = `${cardLabel(card)}: the only card to ${verb} is ${owner.name}'s ${cardLabel(c)}`;
        return forced(s, p, card, text, { cards: options });
      }
      s.prompt = { kind: 'cards', player: p.id, card, options, count: 1 };
      return;
    }
    case 'swap': {
      const owners = live.filter((x) => x.line.length > 0);
      if (owners.length < 2) {
        return forced(s, p, card, 'Swap: needs face-up cards from two different players', {});
      }
      const options = owners.flatMap((x) => x.line.map((c) => c.id));
      s.prompt = { kind: 'cards', player: p.id, card, options, count: 2 };
      return;
    }
  }
}

function applyAct(s: GameState, p: Player, card: ActCard, cards: CardId[], target: PlayerId | null) {
  s.discard.push(card);
  switch (card.act) {
    case 'justOneMore': {
      const t = player(s, target!);
      log(s, `${p.name} played Just One More! on ${t.name}`);
      s.stack.push({ t: 'forceStay', player: t.id }, { t: 'draw', player: t.id });
      return;
    }
    case 'flipFour': {
      const t = player(s, target!);
      log(s, `${p.name} played Flip Four! on ${t.name}`);
      s.stack.push({ t: 'flipFour', player: t.id, left: 4, aside: [] });
      return;
    }
    case 'steal': {
      const [from, c] = takeCard(s, cards[0]!);
      log(s, `${p.name} stole ${cardLabel(c)} from ${from.name}`);
      receive(s, p, c);
      return;
    }
    case 'discard': {
      const [from, c] = takeCard(s, cards[0]!);
      log(s, `${p.name} discarded ${from.name}'s ${cardLabel(c)}`);
      s.discard.push(c);
      return;
    }
    case 'swap': {
      // Both cards leave first, then both arrive: the swap is simultaneous.
      const [a, ca] = takeCard(s, cards[0]!);
      const [b, cb] = takeCard(s, cards[1]!);
      log(s, `${p.name} swapped ${a.name}'s ${cardLabel(ca)} with ${b.name}'s ${cardLabel(cb)}`);
      receive(s, a, cb);
      receive(s, b, ca);
      return;
    }
  }
}

/** Show a no-choice outcome and wait for the player to click OK. */
function forced(
  s: GameState,
  p: Player,
  card: ActCard | ModCard,
  text: string,
  outcome: { target?: PlayerId; cards?: CardId[] },
) {
  log(s, text);
  s.prompt = { kind: 'ack', player: p.id, card, text, ...outcome };
}

function giveMod(s: GameState, from: Player, card: ModCard, to: PlayerId) {
  const t = player(s, to);
  log(s, from.id === to ? `${from.name} kept ${cardLabel(card)}` : `${from.name} gave ${cardLabel(card)} to ${t.name}`);
  receive(s, t, card);
}

/**
 * Every way a card enters a line goes through here (flip, Steal, Swap...),
 * so duplicates bust and special numbers trigger no matter how it arrived.
 */
function receive(s: GameState, p: Player, c: NumCard | ModCard) {
  if (c.kind === 'mod') {
    p.line.push(c);
    return;
  }
  if (c.special === 'unlucky7') {
    if (p.line.length) log(s, `Unlucky 7! ${p.name} discarded their line`);
    s.discard.push(...p.line);
    p.line = [c];
    return;
  }
  const same = p.line.filter((x) => x.kind === 'num' && x.value === c.value).length;
  const lucky = c.value === 13 && (c.special === 'lucky13' || hasSpecial(p, 'lucky13'));
  p.line.push(c);
  if (same + 1 > (lucky ? 2 : 1)) {
    if (p.status !== 'busted') log(s, `${p.name} BUSTED on ${cardLabel(c)}`);
    p.status = 'busted';
    return;
  }
  if (p.status !== 'busted' && distinctValues(p) >= 7 && !s.flip7.includes(p.id)) s.flip7.push(p.id);
}

function outOfCards(s: GameState, p: Player) {
  log(s, 'There were no cards left to draw');
  if (p.status === 'active') {
    p.status = 'stayed';
    log(s, `${p.name} had to stay`);
  }
}

function draw(s: GameState): Card | null {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return null;
    s.deck = s.discard;
    s.discard = [];
    s.seed = shuffle(s.deck, s.seed);
    log(s, 'Deck reshuffled');
  }
  return s.deck.shift()!;
}

// ---------------------------------------------------------------------------
// Helpers

export function player(s: GameState, id: PlayerId): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new EngineError(`Unknown player ${id}`);
  return p;
}

function seat(s: GameState, id: PlayerId): number {
  return s.players.findIndex((x) => x.id === id);
}

function nextActive(s: GameState, from: number): number {
  const n = s.players.length;
  for (let i = 0; i < n; i++) {
    const idx = (from + i) % n;
    if (s.players[idx]!.status === 'active') return idx;
  }
  return -1;
}

function nonBusted(s: GameState): Player[] {
  return s.players.filter((p) => p.status !== 'busted');
}

export function ownerOf(s: GameState, card: CardId): Player | undefined {
  return s.players.find((p) => p.line.some((c) => c.id === card));
}

function takeCard(s: GameState, id: CardId): [Player, NumCard | ModCard] {
  const owner = ownerOf(s, id);
  if (!owner) throw new EngineError('Card is not on the table');
  const i = owner.line.findIndex((c) => c.id === id);
  const [c] = owner.line.splice(i, 1);
  return [owner, c!];
}

export function hasSpecial(p: Player, special: NumCard['special']): boolean {
  return p.line.some((c) => c.kind === 'num' && c.special === special);
}

/** Distinct number values in a line. Lucky 13 + 13 counts once. */
export function distinctValues(p: Player): number {
  return new Set(p.line.flatMap((c) => (c.kind === 'num' ? [c.value] : []))).size;
}

function log(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}
