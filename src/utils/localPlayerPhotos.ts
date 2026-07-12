import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

const PHOTOS_DIR = FileSystem.documentDirectory + 'player_photos/';
const STORAGE_KEY = '@player_photo_map';

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
}

export async function saveLocalPlayerPhoto(playerId: string, sourceUri: string): Promise<string> {
  await ensureDir();
  const dest = PHOTOS_DIR + playerId + '.jpg';
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  const map = await getLocalPhotoMap();
  map[playerId] = dest;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  return dest;
}

export async function deleteLocalPlayerPhoto(playerId: string) {
  const map = await getLocalPhotoMap();
  if (map[playerId]) {
    await FileSystem.deleteAsync(map[playerId], { idempotent: true });
    delete map[playerId];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }
}

export async function getLocalPhotoMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

// Hook — retourne { playerId: localPath }
export function useLocalPlayerPhotos() {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    getLocalPhotoMap().then(setMap);
  }, []);

  const refresh = () => getLocalPhotoMap().then(setMap);

  return { map, refresh };
}
