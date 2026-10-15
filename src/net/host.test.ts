import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostRoom, type Link } from './host';
import type { RoomView, ToClient } from './protocol';

function fakeLink() {
  const inbox: ToClient[] = [];
  const link: Link & { inbox: ToClient[]; closed: boolean } = {
    inbox,
    closed: false,
    send: (m) => inbox.push(m),
    close: () => {
      link.closed = true;
    },
  };
  return link;
}

function lastRoom(link: { inbox: ToClient[] }): RoomView {
  const rooms = link.inbox.filter((m) => m.t === 'room');
  return (rooms[rooms.length - 1] as Extract<ToClient, { t: 'room' }>).room;
}

function room(autoplayMs = 1000) {
  return new HostRoom(
    { code: 'ABCDE', hostId: 'host', members: [{ id: 'host', name: 'Hosty' }], game: null },
    { change: () => {}, react: () => {}, persist: () => {} },
    autoplayMs,
  );
}

afterEach(() => vi.useRealTimers());

describe('HostRoom', () => {
  it('adds players on hello and broadcasts the lobby', () => {
    const r = room();
    const l = fakeLink();
    r.attach(l).message({ t: 'hello', id: 'p1', name: '  Ana\u0000  ' });
    const view = lastRoom(l);
    expect(view.members.map((m) => m.name)).toEqual(['Hosty', 'Ana']);
    expect(view.members.every((m) => m.connected)).toBe(true);
  });

  it('dedupes names and trims them to 16 chars', () => {
    const r = room();
    r.attach(fakeLink()).message({ t: 'hello', id: 'p1', name: 'Hosty' });
    r.attach(fakeLink()).message({ t: 'hello', id: 'p2', name: 'x'.repeat(40) });
    expect(r.view().members.map((m) => m.name)).toEqual(['Hosty', 'Hosty 2', 'x'.repeat(16)]);
  });

  it('lets a player reconnect to their seat mid-game, closing the stale link', () => {
    const r = room();
    const first = fakeLink();
    const h = r.attach(first);
    h.message({ t: 'hello', id: 'p1', name: 'Ana' });
    r.start();
    h.closed();
    expect(r.view().members.find((m) => m.id === 'p1')!.connected).toBe(false);
    const second = fakeLink();
    r.attach(second).message({ t: 'hello', id: 'p1', name: 'Ana' });
    expect(r.view().members.find((m) => m.id === 'p1')!.connected).toBe(true);
    expect(lastRoom(second).game).not.toBeNull();
  });

  it('newcomers after the start can only watch', () => {
    const r = room();
    r.start();
    const l = fakeLink();
    r.attach(l).message({ t: 'hello', id: 'late', name: 'Late' });
    expect(r.view().members).toHaveLength(1);
    expect(lastRoom(l).game).not.toBeNull();
  });

  it('never sends the deck or seed to clients', () => {
    const r = room();
    const l = fakeLink();
    r.attach(l).message({ t: 'hello', id: 'p1', name: 'Ana' });
    r.start();
    const game = lastRoom(l).game as unknown as Record<string, unknown>;
    expect(game.deck).toBeUndefined();
    expect(game.seed).toBeUndefined();
    expect(game.deckCount).toBeTypeOf('number');
  });

  it('reports invalid moves only to the sender', () => {
    const r = room();
    const a = fakeLink();
    const b = fakeLink();
    r.attach(a).message({ t: 'hello', id: 'p1', name: 'A' });
    r.attach(b).message({ t: 'hello', id: 'p2', name: 'B' });
    r.start();
    const g = r.view().game!;
    const notMe = g.players.find((p) => p.id !== g.prompt?.player && p.id !== 'host')!.id;
    const link = notMe === 'p1' ? a : b;
    const other = notMe === 'p1' ? b : a;
    const handler = r.attach(link);
    handler.message({ t: 'hello', id: notMe, name: 'x' });
    handler.message({ t: 'action', action: { t: 'hit' } });
    expect(link.inbox.some((m) => m.t === 'error')).toBe(true);
    expect(other.inbox.some((m) => m.t === 'error')).toBe(false);
  });

  it('only relays known emoji reactions', () => {
    const r = room();
    const l = fakeLink();
    const h = r.attach(l);
    h.message({ t: 'hello', id: 'p1', name: 'A' });
    h.message({ t: 'react', emoji: '🔥' });
    h.message({ t: 'react', emoji: 'my phone is 555-1234' });
    expect(l.inbox.filter((m) => m.t === 'react')).toEqual([{ t: 'react', from: 'p1', emoji: '🔥' }]);
  });

  it('a bot plays for a disconnected player after the timeout', () => {
    vi.useFakeTimers();
    const r = room(1000);
    const h = r.attach(fakeLink());
    h.message({ t: 'hello', id: 'p1', name: 'A' });
    h.closed();
    // Keep restarting until it's p1's turn to decide.
    for (let i = 0; i < 50 && r.view().game?.prompt?.player !== 'p1'; i++) {
      r.backToLobby();
      r.start();
    }
    expect(r.view().game?.prompt?.player).toBe('p1');
    const before = r.view().game!.log.length;
    vi.advanceTimersByTime(1000);
    expect(r.view().game!.log.length).toBeGreaterThan(before);
  });
});
