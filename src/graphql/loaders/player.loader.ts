import DataLoader from 'dataloader';
import type { DocumentData } from 'firebase-admin/firestore';
import { PlayerRepository } from '../modules/player/player.repository';

export const createPlayerLoader = () => new DataLoader<string, DocumentData | null>(async (keys) => {
  const players = await Promise.all(keys.map(key => PlayerRepository.findById(key)));
  return players;
});
