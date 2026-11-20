import { host, join, store, tabId, type Guest, type Host } from '@wabmalia/courier';
import type { GameAction } from '../engine/game';
import { HostRoom, type HostSnapshot } from './host';
import { iceServers } from './relay';
import { cleanName, newRoomCode, PEER_PREFIX, type RoomView, type ToClient, type ToHost } from './protocol';

// The connection side. Courier (@wabmalia/courier) does the connecting: the
// room code, heartbeats, reconnects and the relay. This keeps what's turn7's:
// the host room, saving it across refreshes, solo play and the screens'
// state.

type Status = 'home' | 'connecting' | 'room' | 'error';

export interface Reaction {
  key: number;
  from: string;
  emoji: string;
}

const ID_KEY = 'turn7.id';
const snapKey = (code: string) => `turn7.host.${code}`;
// A solo game is saved like a hosted room, under this code.
const SOLO = 'SOLO';

export function savedHost(code: string): HostSnapshot | null {
  const raw = store.get(localStorage, snapKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HostSnapshot;
  } catch {
    return null;
  }
}

class Session {
  status = $state<Status>('home');
  message = $state('');
  role = $state<'host' | 'client' | null>(null);
  code = $state('');
  me = $state(tabId(ID_KEY));
  room = $state<RoomView | null>(null);
  /** False while a client is reconnecting to the host. */
  linked = $state(true);
  /** Each guest's round trip to the host, in ms, by id. */
  pings = $state<Record<string, number>>({});
  reactions = $state<Reaction[]>([]);
  toast = $state<string | null>(null);
  name = $state(store.get(localStorage, 'turn7.name') ?? '');
  /** Playing alone: the host room runs with no connection at all. */
  solo = $state(false);

  private host: HostRoom | null = null;
  private hosting: Host | null = null;
  private guest: Guest<ToHost> | null = null;
  private reactionKey = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  setName(name: string) {
    this.name = cleanName(name);
    store.set(localStorage, 'turn7.name', this.name);
  }

  // Hosting ---------------------------------------------------------------

  /** Create a room, or resume one this browser was hosting (after a refresh). */
  hostRoom(resumeCode?: string) {
    const saved = this.openRoom(resumeCode ?? null, newRoomCode(), 'Host');
    this.status = 'connecting';
    this.message = saved ? 'Reopening your room…' : 'Creating room…';
    const room = this.host!;
    const code = this.code;
    this.hosting = host<ToClient>({
      prefix: PEER_PREFIX,
      code,
      fresh: !saved,
      iceServers: () => iceServers(),
      attach: (link) => room.attach(link),
      open: () => {
        this.status = 'room';
        location.hash = `#/host/${code}`;
      },
      // Code collision on a brand new room: just pick another.
      codeTaken: () => this.hostRoom(),
      notice: (text) => {
        if (this.status === 'room') this.showToast(text);
        else this.message = text;
      },
      fail: (message) => this.fail(message),
      pings: (pings) => (this.pings = pings),
    });
  }

  /** Play alone, straight into a game; or carry on after a refresh. */
  playSolo(resume = false) {
    const saved = this.openRoom(resume ? SOLO : null, SOLO, 'You');
    this.solo = true;
    this.status = 'room';
    location.hash = '#/solo';
    if (!saved) this.host!.start();
  }

  // The host room itself, new or from its saved snapshot. True if resumed.
  private openRoom(resumeCode: string | null, newCode: string, fallbackName: string): boolean {
    this.teardown();
    const saved = resumeCode ? savedHost(resumeCode) : null;
    const snap: HostSnapshot = saved ?? {
      code: newCode,
      hostId: this.me,
      members: [{ id: this.me, name: this.name || fallbackName }],
      game: null,
    };
    this.me = snap.hostId;
    this.role = 'host';
    this.code = snap.code;
    this.host = new HostRoom(snap, {
      change: (room) => (this.room = room),
      react: (from, emoji) => this.addReaction(from, emoji),
      persist: (s) => store.set(localStorage, snapKey(s.code), JSON.stringify(s)),
    });
    this.room = this.host.view();
    return !!saved;
  }

  start() {
    this.host?.start();
  }
  backToLobby() {
    this.host?.backToLobby();
  }
  kick(id: string) {
    this.host?.kick(id);
  }

  // Joining ---------------------------------------------------------------

  joinRoom(code: string) {
    this.teardown();
    this.role = 'client';
    this.code = code;
    this.status = 'connecting';
    this.message = `Looking for room ${code}…`;
    store.set(sessionStorage, 'turn7.joined', code);
    const me = this.me;
    this.guest = join<ToClient, ToHost>({
      prefix: PEER_PREFIX,
      code,
      id: me,
      hello: () => ({ t: 'hello', id: me, name: this.name || 'Player' }),
      message: (msg) => this.receive(msg),
      status: (s) => (this.linked = s === 'linked'),
      fail: (message) => this.fail(message),
      pings: (pings) => (this.pings = pings),
      iceServers: () => iceServers(),
    });
  }

  private receive(msg: ToClient) {
    switch (msg.t) {
      case 'room':
        this.room = msg.room;
        this.status = 'room';
        location.hash = `#/join/${this.code}`;
        break;
      case 'react':
        this.addReaction(msg.from, msg.emoji);
        break;
      case 'error':
        this.showToast(msg.msg);
        break;
      case 'rejected':
        this.fail(msg.reason);
        store.set(sessionStorage, 'turn7.joined', null);
        break;
    }
  }

  // Shared ----------------------------------------------------------------

  act(action: GameAction) {
    if (this.host) {
      const err = this.host.hostAct(action);
      if (err) this.showToast(err);
    } else {
      this.guest?.send({ t: 'action', action });
    }
  }

  react(emoji: string) {
    if (this.host) this.host.hostReact(emoji);
    else this.guest?.send({ t: 'react', emoji });
  }

  /** Leave the room. A host leaving closes it for everyone. */
  leave() {
    if (this.host) store.set(localStorage, snapKey(this.code), null);
    store.set(sessionStorage, 'turn7.joined', null);
    this.teardown();
    this.status = 'home';
    location.hash = '#/';
  }

  private teardown() {
    this.hosting?.close();
    this.hosting = null;
    this.guest?.close();
    this.guest = null;
    this.host?.dispose();
    this.host = null;
    this.room = null;
    this.role = null;
    this.solo = false;
    this.linked = true;
    this.pings = {};
    this.me = tabId(ID_KEY);
  }

  private fail(message: string) {
    this.teardown();
    this.status = 'error';
    this.message = message;
  }

  private addReaction(from: string, emoji: string) {
    const key = ++this.reactionKey;
    this.reactions = [...this.reactions, { key, from, emoji }];
    setTimeout(() => (this.reactions = this.reactions.filter((r) => r.key !== key)), 2500);
  }

  showToast(text: string) {
    this.toast = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3500);
  }

  /** Called once on page load: resume hosting or rejoin after a refresh. */
  restore() {
    const [, kind, raw] = location.hash.split('/');
    const code = (raw ?? '').toUpperCase();
    if (kind === 'solo' && savedHost(SOLO)) this.playSolo(true);
    else if (kind === 'host' && code && savedHost(code)) this.hostRoom(code);
    else if (kind === 'join' && code && store.get(sessionStorage, 'turn7.joined') === code) this.joinRoom(code);
  }
}

export const session = new Session();
