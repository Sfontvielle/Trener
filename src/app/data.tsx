import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Icon, SectionTitle, T } from '@/components/ui';
import { confirm, toast } from '@/components/Dialog';
import { useProfile } from '@/stores/profile';
import { resetAllStores } from '@/stores/hydration';
import { clearAllData } from '@/storage/persist';
import { seedDemoData } from '@/features/profile/demo';
import { autoBackupInfo, backupStats, exportBackup, maybeAutoBackup, pickBackup, readAutoBackup, restoreBackup, type BackupFile } from '@/services/backup';
import { relativeDay, toISODate } from '@/utils/date';
import { BRAND } from '@/config/brand';

/**
 * Данные и конфиденциальность. Обычному пользователю делать здесь ничего не нужно: всё хранится на
 * устройстве и тихо копируется в папку приложения. Перенос на новый телефон — экспорт одного файла.
 * Технические действия (восстановление, демо, удаление) — в «Дополнительно».
 */
export default function DataPrivacy() {
  const settings = useProfile((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [auto, setAuto] = useState(() => autoBackupInfo());
  const native = Platform.OS !== 'web';

  const doExport = async () => {
    setBusy(true);
    try {
      const r = await exportBackup();
      useProfile.getState().updateSettings({ lastBackupAt: Date.now() });
      toast(r === 'downloaded' ? 'Файл с данными скачан' : 'Файл готов — сохрани в «Файлы», iCloud или отправь себе');
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось создать файл', 'alert-circle');
    } finally {
      setBusy(false);
    }
  };

  const askRestore = (b: BackupFile) =>
    confirm('Восстановить данные?', `${backupStats(b)}, от ${b.exportedAt.slice(0, 10)}. Текущие данные на этом устройстве будут заменены.`, 'Восстановить', () => {
      restoreBackup(b);
      toast('Данные восстановлены');
      router.replace('/');
    }, true);

  const doImport = async () => {
    try {
      const b = await pickBackup();
      if (b) askRestore(b);
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось прочитать файл', 'alert-circle');
    }
  };

  const last = settings.lastBackupAt ? relativeDay(toISODate(new Date(settings.lastBackupAt))).toLowerCase() : null;

  return (
    <Screen>
      <Header title="Данные и конфиденциальность" />
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Icon name="lock-closed-outline" size={22} color={colors.accent} />
          <T v="h3" style={{ flex: 1 }}>
            Всё хранится на этом устройстве
          </T>
        </View>
        <T v="small">
          Профиль, здоровье, тренировки, питание, замеры и память тренера сохраняются локально и сразу — ничего нажимать не нужно. В интернет уходят только поисковые запросы: названия продуктов и штрихкоды (Open Food Facts) и темы вопросов тренеру для поиска научных источников (PubMed) — без твоих личных данных.
        </T>
        {native ? (
          <T v="small" color={colors.text}>
            Автокопия: {auto.exists && auto.at ? `${relativeDay(auto.at.slice(0, 10)).toLowerCase()}` : 'появится после первого запуска'} · обновляется сама раз в несколько дней и входит в резервную копию iPhone.
          </T>
        ) : null}
      </Card>

      <SectionTitle title="Перенос на новый телефон" />
      <Card style={{ gap: 10 }}>
        <T v="small">Сохрани файл со всеми данными (в «Файлы», iCloud Drive или отправь себе). На новом телефоне установи {BRAND} и открой «Дополнительно → Восстановить из файла». Фото прогресса в файл не входят — они остаются в резервной копии телефона.</T>
        <T v="small" color={settings.lastBackupAt ? colors.textDim : colors.warning}>
          {last ? `Последний экспорт: ${last}` : 'Экспорта ещё не было.'}
        </T>
        <Button title="Экспортировать мои данные" icon="share-outline" loading={busy} onPress={doExport} />
      </Card>

      <Pressable accessibilityRole="button" onPress={() => setAdvanced((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg, paddingVertical: 8 }}>
        <T v="caption" style={{ flex: 1 }}>
          Дополнительно
        </T>
        <Icon name={advanced ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} />
      </Pressable>
      {advanced ? (
        <Card style={{ gap: 10 }}>
          <Button title="Восстановить из файла" icon="cloud-download-outline" variant="secondary" onPress={doImport} />
          {native && auto.exists ? (
            <Button
              title="Восстановить из автокопии"
              icon="time-outline"
              variant="secondary"
              onPress={() => {
                const b = readAutoBackup();
                if (b) askRestore(b);
                else toast('Автокопия не найдена', 'alert-circle');
              }}
            />
          ) : null}
          {native ? (
            <Button
              title="Обновить автокопию сейчас"
              icon="refresh"
              variant="ghost"
              size="sm"
              onPress={() => {
                if (maybeAutoBackup(true)) {
                  setAuto(autoBackupInfo());
                  toast('Автокопия обновлена');
                }
              }}
            />
          ) : null}
          <Banner text="Восстановление заменяет данные на устройстве целиком. Незавершённая тренировка в копию не входит." />
          <Button
            title="Заполнить демо-историей (для проверки)"
            size="sm"
            variant="outline"
            onPress={() => confirm('Добавить демо-данные?', 'Будут добавлены ВЫМЫШЛЕННЫЕ 4 недели тренировок, веса, чек-инов и питания — чтобы посмотреть, как работает Прогресс. Реальные данные не удаляются, но смешаются с демо.', 'Добавить демо', () => { seedDemoData(); toast('Демо-данные добавлены'); })}
          />
          <Button
            title="Удалить все данные"
            size="sm"
            variant="danger"
            onPress={() =>
              confirm('Удалить все данные?', 'Профиль, план, тренировки, питание и память тренера будут удалены с устройства без возможности восстановления (кроме ранее экспортированного файла).', 'Удалить всё', async () => {
                await resetAllStores();
                await clearAllData();
                router.replace('/onboarding');
              }, true)
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}
