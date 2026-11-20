import type { GameAction } from '../engine/game';
import type { PublicState } from '../engine/view';

export const PEER_PREFIX = 'turn7-v1-';
export const REACTIONS = ['👍', '😂', '😱', '😈', '🔥', '💀', '🙏', '👏'] as const;
export { NAME_MAX } from '@wabmalia/courier';

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

// Codes and names are courier's, shared with the other arcade games.
export { cleanName, newRoomCode, normalizeCode } from '@wabmalia/courier';
