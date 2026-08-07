import type { RoomEntry } from '../../lib/rooms';

export type RoomCardMode = 'enter' | 'leave';

/** Le strict nécessaire pour décrire un salon : une entrée de liste, ou un pré-vol de lien. */
export type RoomCardTarget = Pick<RoomEntry, 'id' | 'name' | 'region' | 'official' | 'encrypted' | 'locked' | 'private'> &
  Partial<Pick<RoomEntry, 'count' | 'salt' | 'alone'>>;
