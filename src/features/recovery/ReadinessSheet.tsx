import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ReadinessResult } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Sheet } from '@/components/Sheet';
import { Button, Icon, T } from '@/components/ui';
import { BAND_META } from './readiness';
import { BRAND } from '@/config/brand';
import { readinessLabel } from '@/features/science/insights';
import { afterModalClose } from '@/components/modalGate';

/**
 * «Почему такая готовность?» — из чего сложилось число, откуда данные и как это влияет на план.
 * Показатель помогает решить, а не запрещает: тренироваться или нет — решает человек.
 */
export function ReadinessSheet({ visible, onClose, r, hasCheckin }: { visible: boolean; onClose: () => void; r: ReadinessResult | undefined; hasCheckin: boolean }) {
  if (!r) return null;
  const meta = BAND_META[r.band];
  const col = r.band === 'go' ? colors.accent : r.band === 'reduce' ? colors.warning : colors.danger;
  return (
    <Sheet visible={visible} onClose={onClose} title={`Готовность: ${readinessLabel(r).toLowerCase()}`} subtitle={r.source === 'health' ? 'По данным Apple Health (без чек-ина)' : 'По утреннему чек-ину и данным тренировок'}>
      <View style={{ gap: space.md }}>
        <View style={[styles.verdict, { borderColor: col }]}>
          <T v="h3">{r.headline}</T>
          <T v="small">
            {r.band === 'go'
              ? 'Можно работать по плану и повышать веса, где готово.'
              : `Рекомендация: объём ×${String(meta.volumeFactor).replace('.', ',')}${meta.rirDelta ? `, запас +${meta.rirDelta} повт.` : ''}, веса без повышения. Это совет — тренировку можно провести и по плану.`}
          </T>
        </View>
        <T v="caption">Из чего сложилось</T>
        <View style={{ gap: 8 }}>
          {r.factors.length === 0 ? <T v="small">Все показатели в норме.</T> : null}
          {r.factors.map((f) => (
            <View key={f.label} style={styles.row}>
              <Icon name={f.impact < -2 ? 'arrow-down-circle' : f.impact > 2 ? 'arrow-up-circle' : 'remove-circle-outline'} size={18} color={f.impact < -2 ? colors.warning : f.impact > 2 ? colors.accent : colors.textDim} />
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: '700', fontSize: 14 }}>
                  {f.label}
                </T>
                <T v="small" style={{ fontSize: 12 }}>
                  {f.detail}
                </T>
              </View>
            </View>
          ))}
        </View>
        <T v="small" style={{ fontSize: 12 }}>
          Учитываются: сон (длительность и качество), энергия, стресс, мышечная усталость, боль, тренировки последних 2 дней и нагрузка за неделю относительно твоей обычной, а при подключённом Apple Health — HRV и пульс покоя относительно твоей личной нормы. Категория — правило {BRAND} (эвристика), а не медицинское измерение, поэтому без процентов. Без чек-ина и данных сна готовность не показывается.
        </T>
        {!hasCheckin ? <Button title="Пройти чек-ин для точности" icon="sunny-outline" variant="secondary" onPress={() => { onClose(); afterModalClose(() => router.push('/checkin')); }} /> : null}
      </View>
    </Sheet>
  );
}

const styles = themed({
  verdict: { padding: 12, borderRadius: radius.md, borderWidth: 1.5, gap: 4, backgroundColor: colors.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
