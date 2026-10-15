import { botAction } from '../engine/bot';
import { advance, apply, createGame, EngineError, MAX_PLAYERS, type GameAction, type GameState } from '../engine/game';
import { randomSeed } from '../engine/rng';
import { publicView } from '../engine/view';
import { cleanName, REACTIONS, type RoomView, type ToClient, type ToHost } from './protocol';

/** One connection to a remote browser. */
export interface Link {
  send(msg: ToClient): void;
  close(): void;
}

interface Member {
  id: string;
  name: string;
}

export interface HostSnapshot {
  code: string;
  hostId: string;
  members: Member[];
  game: GameState | null;
}

export interface HostEvents {
  /** The room changed; the host's own UI should re-render. */
  change(room: RoomView): void;
  react(from: string, emoji: string): void;
  /** Save this so a refreshed host tab can resume the room. */
  persist(snap: HostSnapshot): void;
}

/** How long a disconnected player's decision waits before a bot takes it. */
export const AUTOPLAY_MS = 30_000;
/** Delay between Flip Four cards. */
export const FLIP_MS = 900;

/**
 * The authoritative room, running in the host's browser. Owns the members and
 * the game state; remote players only send intents.
 */
export class HostRoom {
  readonly code: string;
  readonly hostId: string;
  private members: Member[];
  private game: GameState | null;
  private links = new Map<string, Link>();
  private spectators = new Set<Link>();
  private autoplay: ReturnType<typeof setTimeout> | undefined;
  private pace: ReturnType<typeof setTimeout> | undefined;

  constructor(
    snap: HostSnapshot,
    private events: HostEvents,
    private autoplayMs = AUTOPLAY_MS,
    private flipMs = FLIP_MS,
  ) {
    this.code = snap.code;
    this.hostId = snap.hostId;
    this.members = snap.members;
    this.game = snap.game;
    // A resumed room may have been saved mid-Flip-Four or waiting on a bot.
    this.scheduleTimers();
  }

  /** Wire up a freshly opened connection. */
  attach(link: Link) {
    let id: string | null = null;
    return {
      message: (raw: unknown) => {
        const msg = raw as ToHost;
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') {
          id = this.hello(link, msg);
          return;
        }
        if (!id) return;
        if (msg.t === 'action') this.act(id, msg.action, link);
        else if (msg.t === 'react') this.react(id, msg.emoji);
      },
      closed: () => {
        this.spectators.delete(link);
        if (id && this.links.get(id) === link) {
          this.links.delete(id);
          this.changed();
        }
      },
    };
  }

  // Host-side controls ------------------------------------------------------

  start() {
    if (this.game && this.game.phase !== 'gameOver') return;
    const dealer = Math.floor(Math.random() * this.members.length);
    this.game = createGame(this.members, { seed: randomSeed(), dealer });
    this.changed();
  }

  backToLobby() {
    this.game = null;
    this.changed();
  }

  kick(id: string) {
    if (this.game || id === this.hostId) return;
    this.members = this.members.filter((m) => m.id !== id);
    const link = this.links.get(id);
    link?.send({ t: 'rejected', reason: 'Removed by the host' });
    link?.close();
    this.links.delete(id);
    this.changed();
  }

  hostAct(action: GameAction): string | null {
    return this.act(this.hostId, action, null);
  }

  hostReact(emoji: string) {
    this.react(this.hostId, emoji);
  }

  view(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      members: this.members.map((m) => ({
        id: m.id,
        name: m.name,
        connected: m.id === this.hostId || this.links.has(m.id),
      })),
      game: this.game ? publicView(this.game) : null,
    };
  }

  snapshot(): HostSnapshot {
    return { code: this.code, hostId: this.hostId, members: this.members, game: this.game };
  }

  dispose() {
    clearTimeout(this.autoplay);
    clearTimeout(this.pace);
    for (const l of [...this.links.values(), ...this.spectators]) l.close();
  }

  // Internals ---------------------------------------------------------------

  private hello(link: Link, msg: Extract<ToHost, { t: 'hello' }>): string | null {
    const id = String(msg.id ?? '').slice(0, 64);
    if (!id || id === this.hostId) {
      link.send({ t: 'rejected', reason: 'Invalid player id' });
      return null;
    }
    const existing = this.members.find((m) => m.id === id);
    if (existing) {
      // Reconnect: take over the seat, drop any stale connection.
      const old = this.links.get(id);
      if (old && old !== link) old.close();
    } else if (this.game) {
      // Game in progress: watch only.
      this.spectators.add(link);
      link.send({ t: 'room', room: this.view() });
      return null;
    } else if (this.members.length >= MAX_PLAYERS) {
      link.send({ t: 'rejected', reason: 'Room is full' });
      return null;
    } else {
      this.members.push({ id, name: this.uniqueName(cleanName(msg.name)) });
    }
    this.links.set(id, link);
    this.changed();
    return id;
  }

  private act(id: string, action: GameAction, link: Link | null): string | null {
    if (!this.game) return 'Game has not started';
    try {
      this.game = apply(this.game, id, action);
    } catch (e) {
      const msg = e instanceof EngineError ? e.message : 'Invalid move';
      link?.send({ t: 'error', msg });
      return msg;
    }
    this.changed();
    return null;
  }

  private react(from: string, emoji: string) {
    if (!(REACTIONS as readonly string[]).includes(emoji)) return;
    this.broadcast({ t: 'react', from, emoji });
    this.events.react(from, emoji);
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.members.map((m) => m.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private changed() {
    const room = this.view();
    this.broadcast({ t: 'room', room });
    this.events.change(room);
    this.events.persist(this.snapshot());
    this.scheduleTimers();
  }

  private broadcast(msg: ToClient) {
    for (const l of this.links.values()) l.send(msg);
    for (const l of this.spectators) l.send(msg);
  }

  private scheduleTimers() {
    clearTimeout(this.pace);
    const g = this.game;
    if (g?.paused) {
      this.pace = setTimeout(() => {
        if (this.game !== g) return;
        this.game = advance(g);
        this.changed();
      }, this.flipMs);
    }
    this.scheduleAutoplay();
  }

  /** If the current decision belongs to a disconnected player, a bot takes it after a delay. */
  private scheduleAutoplay() {
    clearTimeout(this.autoplay);
    const g = this.game;
    const who = g?.prompt?.player;
    if (!g || !who || who === this.hostId || this.links.has(who)) return;
    this.autoplay = setTimeout(() => {
      if (this.game !== g) return;
      const action = botAction(g, who);
      if (action) this.act(who, action, null);
    }, this.autoplayMs);
  }
}
