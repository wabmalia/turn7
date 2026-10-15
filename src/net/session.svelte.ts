import { Peer, type DataConnection } from 'peerjs';
import type { GameAction } from '../engine/game';
import { HostRoom, type HostSnapshot } from './host';
import {
  cleanName,
  newRoomCode,
  PEER_PREFIX,
  type RoomView,
  type ToClient,
  type ToHost,
} from './protocol';

type Status = 'home' | 'connecting' | 'room' | 'error';

export interface Reaction {
  key: number;
  from: string;
  emoji: string;
}

// Storage can throw (private mode, blocked site data); none of it is essential.
const store = {
  get(area: Storage, key: string): string | null {
    try {
      return area.getItem(key);
    } catch {
      return null;
    }
  },
  set(area: Storage, key: string, value: string | null) {
    try {
      if (value === null) area.removeItem(key);
      else area.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

/** Per-tab identity, so a refresh reclaims the same seat but two tabs are two players. */
function tabId(): string {
  let id = store.get(sessionStorage, 'yaflip7.id');
  if (!id) {
    id = crypto.randomUUID();
    store.set(sessionStorage, 'yaflip7.id', id);
  }
  return id;
}

const snapKey = (code: string) => `yaflip7.host.${code}`;

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
  me = $state(tabId());
  room = $state<RoomView | null>(null);
  /** False while a client is reconnecting to the host. */
  linked = $state(true);
  reactions = $state<Reaction[]>([]);
  toast = $state<string | null>(null);
  name = $state(store.get(localStorage, 'yaflip7.name') ?? '');

  private peer: Peer | null = null;
  private host: HostRoom | null = null;
  private conn: DataConnection | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private reactionKey = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  setName(name: string) {
    this.name = cleanName(name);
    store.set(localStorage, 'yaflip7.name', this.name);
  }

  // Hosting ---------------------------------------------------------------

  /** Create a room, or resume one this browser was hosting (after a refresh). */
  hostRoom(resumeCode?: string) {
    this.teardown();
    const saved = resumeCode ? savedHost(resumeCode) : null;
    const code = saved?.code ?? newRoomCode();
    const snap: HostSnapshot = saved ?? {
      code,
      hostId: this.me,
      members: [{ id: this.me, name: this.name || 'Host' }],
      game: null,
    };
    this.me = snap.hostId;
    this.role = 'host';
    this.code = code;
    this.status = 'connecting';
    this.message = saved ? 'Reopening your room…' : 'Creating room…';
    this.host = new HostRoom(snap, {
      change: (room) => (this.room = room),
      react: (from, emoji) => this.addReaction(from, emoji),
      persist: (s) => store.set(localStorage, snapKey(s.code), JSON.stringify(s)),
    });
    this.room = this.host.view();
    this.openHostPeer(code, !saved, 0);
  }

  private openHostPeer(code: string, fresh: boolean, attempt: number) {
    const peer = new Peer(PEER_PREFIX + code);
    this.peer = peer;
    peer.on('open', () => {
      this.status = 'room';
      location.hash = `#/host/${code}`;
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const h = this.host!.attach({
          send: (m) => conn.open && conn.send(m),
          close: () => conn.close(),
        });
        conn.on('data', h.message);
        conn.on('close', h.closed);
        conn.on('error', h.closed);
      });
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id') {
        peer.destroy();
        if (fresh) {
          // Code collision on a brand new room: just pick another.
          return this.hostRoom();
        }
        // The broker still remembers our old connection; it frees up shortly.
        if (attempt < 20) {
          this.message = 'Reclaiming your room code…';
          this.retry = setTimeout(() => this.openHostPeer(code, false, attempt + 1), 3000);
          return;
        }
      }
      if (this.status === 'room' && (err.type === 'network' || err.type === 'server-error')) {
        this.showToast('Connection to the matchmaking server dropped; retrying…');
        return;
      }
      if (this.status !== 'room') this.fail(`Could not open the room (${err.type}).`);
    });
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
    store.set(sessionStorage, 'yaflip7.joined', code);
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => this.connectToHost());
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'peer-unavailable') {
        if (this.room) return this.scheduleReconnect();
        return this.fail(`Couldn't find room ${code}. Check the code, and that the host still has the page open.`);
      }
      if (this.room) return this.scheduleReconnect();
      this.fail(`Connection failed (${err.type}).`);
    });
  }

  private connectToHost() {
    if (!this.peer || this.peer.destroyed) return;
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      this.linked = true;
      this.send({ t: 'hello', id: this.me, name: this.name || 'Player' });
    });
    conn.on('data', (d) => this.receive(d as ToClient));
    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.linked = false;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    this.linked = false;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connectToHost(), 2500);
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
        store.set(sessionStorage, 'yaflip7.joined', null);
        break;
    }
  }

  private send(msg: ToHost) {
    if (this.conn?.open) this.conn.send(msg);
  }

  // Shared ----------------------------------------------------------------

  act(action: GameAction) {
    if (this.host) {
      const err = this.host.hostAct(action);
      if (err) this.showToast(err);
    } else {
      this.send({ t: 'action', action });
    }
  }

  react(emoji: string) {
    if (this.host) this.host.hostReact(emoji);
    else this.send({ t: 'react', emoji });
  }

  /** Leave the room. A host leaving closes it for everyone. */
  leave() {
    if (this.host) store.set(localStorage, snapKey(this.code), null);
    store.set(sessionStorage, 'yaflip7.joined', null);
    this.teardown();
    this.status = 'home';
    location.hash = '#/';
  }

  private teardown() {
    clearTimeout(this.retry);
    this.host?.dispose();
    this.host = null;
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
    this.room = null;
    this.role = null;
    this.linked = true;
    this.me = tabId();
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
    if (kind === 'host' && code && savedHost(code)) this.hostRoom(code);
    else if (kind === 'join' && code && store.get(sessionStorage, 'yaflip7.joined') === code) this.joinRoom(code);
  }
}

export const session = new Session();
