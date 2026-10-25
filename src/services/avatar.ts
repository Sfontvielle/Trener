import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Фото профиля: выбор из галереи с квадратной обрезкой, копия — в папке приложения (галерея и кэш могут очиститься).
 * В браузере (dev) файловой системы нет — сохраняем data URI. Старое фото удаляется. null — отмена.
 */
export async function pickAvatar(prev?: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Нет доступа к фото — разреши его в Настройках iPhone');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: Platform.OS === 'web' });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  if (Platform.OS === 'web') return a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
  const dir = new Directory(Paths.document, 'avatar');
  if (!dir.exists) dir.create();
  const dst = new File(dir, `a_${Date.now()}.jpg`);
  await new File(a.uri).copy(dst);
  removeAvatar(prev);
  return dst.uri;
}

export function removeAvatar(uri?: string) {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* уже удалено */
  }
}
