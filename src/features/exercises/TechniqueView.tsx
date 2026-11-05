import React from 'react';
import { View } from 'react-native';
import type { Exercise, Sex } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { useProfile } from '@/stores/profile';
import { getPrefs } from '@/features/training/engine/prefs';
import { checkAllowed } from '@/features/training/engine/scoring';
import { ExerciseAnimation, animationFor } from './ExerciseAnimation';
import { Anatomy } from './Anatomy';
import { techniqueFor } from './technique';

/**
 * Техника упражнения целиком: 3D-анимация с подсветкой мышц (или нейтральная схема мышц, пока её нет), анатомия (основные / вспомогательные / стабилизаторы,
 * спереди и сзади), как выполнять, положение тела, амплитуда, дыхание, ошибки и безопасность —
 * с учётом ограничений из профиля пользователя.
 */
export function TechniqueView({ ex, sex, onSurface }: { ex: Exercise; sex?: Sex; /** Внутри панели на surface — блоки на ступень светлее */ onSurface?: boolean }) {
  const profile = useProfile((s) => s.profile);
  const t = techniqueFor(ex);
  const allowed = profile ? checkAllowed(ex, profile, getPrefs(profile)) : { ok: true as const };
  const anim = animationFor(ex);
  const block = onSurface ? [styles.block, styles.raised] : styles.block;
  return (
    <View style={{ gap: space.md }}>
      {/* 3D-петля движения (если есть) и анатомическая карта — у каждого упражнения: какие мышцы работают
          (зелёным) и какие задействованы слегка (светло-жёлтым), фигура — по полу из профиля */}
      {anim ? <ExerciseAnimation ex={ex} anim={anim} legend={false} /> : null}
      <View testID="technique-muscles">
        <Anatomy primary={ex.primary} secondary={ex.secondary} stabilizers={t.stabilizers} sex={sex ?? profile?.sex} exerciseId={ex.id} large />
      </View>
      {!allowed.ok && allowed.reason !== 'нет оборудования' ? (
        <View style={[block, styles.warn]}>
          <Head icon="medkit-outline" title="С учётом твоего профиля" color={colors.warning} />
          <T v="body">
            Упражнение конфликтует с ограничением: {allowed.reason}. Если оно вызывает боль — не выполняй его и выбери замену («⋯» → «Заменить»). При сохраняющейся боли — к врачу или физиотерапевту.
          </T>
        </View>
      ) : null}
      {ex.cues.length ? (
        <View style={block}>
          <Head icon="checkmark-circle-outline" title="Правильное выполнение" />
          {ex.cues.map((c, i) => (
            <View key={c} style={styles.step} accessible accessibilityLabel={`Шаг ${i + 1}: ${c}`}>
              <View style={styles.num}>
                <T v="footnote" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                  {i + 1}
                </T>
              </View>
              <T v="body" style={{ flex: 1 }}>
                {c}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      <View style={block}>
        <Head icon="body-outline" title="Положение тела" />
        <Bullets items={t.setup} />
      </View>
      <View style={block}>
        <Head icon="resize-outline" title="Амплитуда" />
        <T v="body">{t.range}</T>
        <View style={styles.sep} />
        <Head icon="cloud-outline" title="Дыхание" />
        <T v="body">{t.breathing}</T>
      </View>
      {ex.mistakes.length ? (
        <View style={block}>
          <Head icon="close-circle-outline" title="Основные ошибки" color={colors.warning} />
          <Bullets items={ex.mistakes} />
        </View>
      ) : null}
      <View style={block}>
        <Head icon="shield-checkmark-outline" title="Безопасность" />
        <Bullets items={t.safety} />
        <T v="footnote">Резкая или нарастающая боль — остановись. Дискомфорт мышц от нагрузки — нормален, боль в суставе — нет.</T>
      </View>
    </View>
  );
}

/** Заголовок блока: значок нейтральный, цвет — только у предупреждений */
function Head({ icon, title, color = colors.textDim }: { icon: IconName; title: string; color?: string }) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={18} color={color} />
      <T v="headline" accessibilityRole="header" color={color === colors.textDim ? colors.text : color} style={{ flexShrink: 1 }}>
        {title}
      </T>
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      {items.map((x) => (
        <View key={x} style={styles.step}>
          <T v="body" color={colors.textDim} accessible={false}>
            •
          </T>
          <T v="body" style={{ flex: 1 }}>
            {x}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = themed({
  block: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  raised: { backgroundColor: colors.surface2 },
  warn: { borderWidth: 1, borderColor: colors.warningLine },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  step: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  sep: { height: 0.5, backgroundColor: colors.borderStrong, marginVertical: space.xxs },
});
