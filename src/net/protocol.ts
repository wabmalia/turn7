import type { GameAction } from '../engine/game';
import type { PublicState } from '../engine/view';

export const PEER_PREFIX = 'turn7-v1-';
export const REACTIONS = ['👍', '😂', '😱', '😈', '🔥', '💀', '🙏', '👏'] as const;
export const NAME_MAX = 16;

export interface MemberView {
  id: string;
  name: string;
  connected: boolean;
}

export interface RoomView {
  code: string;
  hostId: string;
  members: MemberView[];
  game: PublicState | null;
}

export type ToHost =
  | { t: 'hello'; id: string; name: string }
  | { t: 'action'; action: GameAction }
  | { t: 'react'; emoji: string };

export type ToClient =
  | { t: 'room'; room: RoomView }
  | { t: 'react'; from: string; emoji: string }
  | { t: 'error'; msg: string }
  | { t: 'rejected'; reason: string };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\p{C}]/gu, '')
    .trim()
    .slice(0, NAME_MAX);
  return name || 'Player';
}
