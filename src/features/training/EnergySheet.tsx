import React from 'react';
import { Linking, View } from 'react-native';
import { colors, space } from '@/theme';
import { Sheet } from '@/components/Sheet';
import { Button, T } from '@/components/ui';
import { COMPENDIUM } from '@/features/coach/local/kbSources';
import { fmtWeight } from '@/utils/format';
import { BRAND } from '@/config/brand';
import { ENERGY_METHOD_TEXT, type EnergyResult } from './energy';

/** «Как рассчитано?»: источник данных и метод — без псевдоточности */
export function EnergySheet({ visible, onClose, energy, weightKg }: { visible: boolean; onClose: () => void; energy: EnergyResult | null; weightKg: number }) {
  if (!energy) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={`${energy.source === 'health' ? '' : '≈ '}${energy.kcal} ккал`} subtitle={energy.source === 'health' ? 'Активная энергия · Apple Health / часы' : 'Активные калории · оценка'}>
      <View style={{ gap: space.md }}>
        {energy.source === 'health' ? (
          <T v="body" style={{ fontSize: 15 }}>
            Итог тренировки — измеренная активная энергия из Apple Health (часы), совпавшая по времени с этой тренировкой. Разбивка по упражнениям — оценка: часы не знают, какое упражнение ты делал.
          </T>
        ) : (
          <T v="body" style={{ fontSize: 15 }}>
            Часы/Apple Health не передали данные по этой тренировке, поэтому это расчёт. {ENERGY_METHOD_TEXT}
          </T>
        )}
        <View style={{ gap: 4 }}>
          <T v="small" color={colors.text}>
            • Вес тела в расчёте: {fmtWeight(Math.round(weightKg * 10) / 10)} кг
          </T>
          <T v="small" color={colors.text}>
            • Время: {Math.round(energy.minutes)} мин · средняя интенсивность ~{String(energy.met).replace('.', ',')} MET
          </T>
          <T v="small" color={colors.text}>
            • По упражнениям — по времени между отметками подходов, всегда «≈»
          </T>
        </View>
        <Button title="Методика: Compendium of Physical Activities" icon="open-outline" variant="secondary" size="sm" onPress={() => void Linking.openURL(COMPENDIUM.url)} />
        <T v="small" style={{ fontSize: 11 }}>
          Для измеренных данных запускай тренировку «Силовая» на Apple Watch одновременно с тренировкой в {BRAND} и включи Apple Health в профиле — итог подтянется после синхронизации.
        </T>
      </View>
    </Sheet>
  );
}

