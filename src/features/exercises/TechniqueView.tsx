import React from 'react';
import { View } from 'react-native';
import type { Exercise, Sex } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { useProfile } from '@/stores/profile';
import { getPrefs } from '@/features/training/engine/prefs';
import { checkAllowed } from '@/features/training/engine/scoring';
import { ExerciseMedia } from './ExerciseMedia';
import { Anatomy } from './Anatomy';
import { techniqueFor } from './technique';

/**
 * Техника упражнения целиком: фазы движения, анатомия (основные / вспомогательные / стабилизаторы,
 * спереди и сзади), как выполнять, положение тела, амплитуда, дыхание, ошибки и безопасность —
 * с учётом ограничений из профиля пользователя.
 */
export function TechniqueView({ ex, sex, mediaHeight = 240 }: { ex: Exercise; sex?: Sex; mediaHeight?: number }) {
  const profile = useProfile((s) => s.profile);
  const t = techniqueFor(ex);
  const allowed = profile ? checkAllowed(ex, profile, getPrefs(profile)) : { ok: true as const };
  return (
    <View style={{ gap: space.md }}>
      {ex.media ? <ExerciseMedia exercise={ex} height={mediaHeight} /> : null}
      <Anatomy primary={ex.primary} secondary={ex.secondary} stabilizers={t.stabilizers} sex={sex ?? profile?.sex} large />
      {!allowed.ok && allowed.reason !== 'нет оборудования' ? (
        <View style={[styles.block, { borderColor: colors.warningLine, backgroundColor: colors.warningDim }]}>
          <Head icon="medkit-outline" title="С учётом твоего профиля" color={colors.warning} />
          <T v="small" color={colors.text}>
            Упражнение конфликтует с ограничением: {allowed.reason}. Если оно вызывает боль — не выполняй его и выбери замену («⋯» → «Заменить»). При сохраняющейся боли — к врачу или физиотерапевту.
          </T>
        </View>
      ) : null}
      {ex.cues.length ? (
        <View style={styles.block}>
          <Head icon="checkmark-circle-outline" title="Правильное выполнение" />
          {ex.cues.map((c, i) => (
            <View key={c} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={styles.num}>
                <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>
                  {i + 1}
                </T>
              </View>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                {c}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.block}>
        <Head icon="body-outline" title="Положение тела" />
        {t.setup.map((x) => (
          <T key={x} v="body" style={{ fontSize: 14 }}>
            • {x}
          </T>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[styles.block, { flex: 1 }]}>
          <Head icon="resize-outline" title="Амплитуда" />
          <T v="small" color={colors.text}>
            {t.range}
          </T>
        </View>
        <View style={[styles.block, { flex: 1 }]}>
          <Head icon="cloud-outline" title="Дыхание" />
          <T v="small" color={colors.text}>
            {t.breathing}
          </T>
        </View>
      </View>
      {ex.mistakes.length ? (
        <View style={styles.block}>
          <Head icon="close-circle-outline" title="Основные ошибки" color={colors.warning} />
          {ex.mistakes.map((m) => (
            <T key={m} v="body" style={{ fontSize: 14 }}>
              • {m}
            </T>
          ))}
        </View>
      ) : null}
      <View style={styles.block}>
        <Head icon="shield-checkmark-outline" title="Безопасность" />
        {t.safety.map((x) => (
          <T key={x} v="small" color={colors.text}>
            • {x}
          </T>
        ))}
        <T v="small" style={{ fontSize: 11 }}>
          Резкая или нарастающая боль — остановись. Дискомфорт мышц от нагрузки — нормален, боль в суставе — нет.
        </T>
      </View>
    </View>
  );
}

function Head({ icon, title, color = colors.accent }: { icon: IconName; title: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <Icon name={icon} size={15} color={color} />
      <T v="caption" color={color}>
        {title}
      </T>
    </View>
  );
}

const styles = themed({
  block: { gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  num: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
