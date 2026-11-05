import React, { memo, useId, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import type { MuscleSlug, Sex } from '@/types';
import { colors, radius, themed } from '@/theme';
import { Segmented, T } from '@/components/ui';
import { useProfile } from '@/stores/profile';
import { MUSCLE_LABEL } from '@/data/exercises';
import { figure, FIGURE_BOX, type Shape, type View as Side } from './anatomy/geometry';
import { DETAIL, legendNames, roleOf, type Role } from './anatomy/detail';

/**
 * Анатомическая карта (своя фигура, мужская и женская): каждая мышца и головка отдельно, волокна, сухожилия.
 * Цвета — строго по нагрузке, не по акценту темы: зелёный — мышца работает, светло-жёлтый — задействована слегка
 * (вспомогательные и стабилизаторы), остальное — нейтральное. Для упражнений, где это важно, подсветка
 * уточняется по пучкам и головкам (махи в стороны — средний пучок дельты, жим на наклонной — верх груди).
 */
export const Anatomy = memo(function Anatomy({
  primary,
  secondary,
  stabilizers = [],
  sex,
  exerciseId,
  scale = 0.62,
  showLegend = true,
  large = false,
}: {
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  stabilizers?: MuscleSlug[];
  sex?: Sex;
  /** Упражнение — для уточнения по головкам мышц */
  exerciseId?: string;
  scale?: number;
  showLegend?: boolean;
  /** Крупный план одной стороны с переключателем «Спереди / Сзади» */
  large?: boolean;
}) {
  const profileSex = useProfile((s) => s.profile?.sex);
  const figureSex: Sex = sex ?? profileSex ?? 'male';
  const roles = useRoles(primary, [...secondary, ...stabilizers], exerciseId);
  const load = useMemo(() => ({ front: loadOn(figureSex, 'front', roles), back: loadOn(figureSex, 'back', roles) }), [figureSex, roles]);
  // Какая сторона показывает основные мышцы — её открываем первой
  const [side, setSide] = useState<Side>(load.back.p > load.front.p ? 'back' : 'front');
  const names = useMemo(() => legendNames(primary, [...secondary, ...stabilizers], MUSCLE_LABEL, exerciseId ? DETAIL[exerciseId] : undefined), [primary, secondary, stabilizers, exerciseId]);
  const a11y = `Мышцы. Работают: ${names.p.join(', ') || 'нет'}. Задействованы слегка: ${names.s.join(', ') || 'нет'}`;
  const legend = showLegend ? (
    <View style={{ gap: 8, marginTop: 12 }}>
      {names.p.length ? <LegendRow color={colors.musclePrimary} title="Работают" items={names.p} /> : null}
      {names.s.length ? <LegendRow color={colors.muscleSecondary} title="Задействованы слегка" items={names.s} /> : null}
    </View>
  ) : null;
  const has = (sd: Side) => load[sd].p + load[sd].s > 0;
  if (large) {
    return (
      <View testID="anatomy">
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'center', paddingVertical: 14 }]} accessible accessibilityLabel={a11y} testID={`anatomy-figure-${figureSex}`}>
          <Figure side={side} sex={figureSex} height={460} roles={roles} />
          <Segmented
            items={(['front', 'back'] as const).map((sd) => ({ key: sd, label: `${sd === 'front' ? 'Спереди' : 'Сзади'}${has(sd) ? ' •' : ''}`, a11y: `${sd === 'front' ? 'Спереди' : 'Сзади'}${has(sd) ? ', есть нагруженные мышцы' : ''}` }))}
            value={side}
            onChange={setSide}
            style={{ marginTop: 12, minWidth: 220 }}
          />
        </View>
        {legend}
      </View>
    );
  }
  return (
    <View testID="anatomy">
      <View style={styles.row} accessible accessibilityLabel={a11y} testID={`anatomy-figure-${figureSex}`}>
        {(['front', 'back'] as const).map((sd) => (
          <View key={sd} style={[styles.side, !has(sd) && { opacity: 0.55 }]}>
            <Figure side={sd} sex={figureSex} height={400 * scale} roles={roles} />
            <T v="caption" style={styles.label}>
              {sd === 'front' ? 'Спереди' : 'Сзади'}
            </T>
          </View>
        ))}
      </View>
      {legend}
    </View>
  );
});

type Roles = (sh: Shape) => Role;

function useRoles(primary: MuscleSlug[], secondary: MuscleSlug[], exerciseId?: string): Roles {
  const pKey = primary.join(',');
  const sKey = secondary.join(',');
  return useMemo(() => {
    const P = new Set<string>(pKey ? pKey.split(',') : []);
    const S = new Set<string>(sKey ? sKey.split(',') : []);
    const detail = exerciseId ? DETAIL[exerciseId] : undefined;
    return (sh: Shape) => (sh.kind === 'muscle' ? roleOf(sh.base, sh.slug, P, S, detail) : 'o');
  }, [pKey, sKey, exerciseId]);
}

const area = (sh: Shape) => (sh.box[2] - sh.box[0]) * (sh.box[3] - sh.box[1]);

/** Площадь мышц каждой роли на стороне (какую сторону открыть первой и подпись «•») */
function loadOn(sex: Sex, side: Side, roles: Roles) {
  let p = 0;
  let s = 0;
  for (const sh of figure(sex, side)) {
    const r = roles(sh);
    if (r === 'p') p += area(sh);
    else if (r === 's') s += area(sh);
  }
  return { p, s };
}

/** Мини-схема для миниатюр: сторона и кадр — по работающим мышцам, квадратом на всю миниатюру */
export const MiniFigure = memo(function MiniFigure({ primary, secondary, size, exerciseId }: { primary: MuscleSlug[]; secondary: MuscleSlug[]; size: number; exerciseId?: string }) {
  const sex: Sex = useProfile((s) => s.profile?.sex) ?? 'male';
  const roles = useRoles(primary, secondary, exerciseId);
  const { side, viewBox } = useMemo(() => {
    const pick = (sd: Side) => figure(sex, sd).filter((sh) => roles(sh) === 'p');
    const front = pick('front');
    const back = pick('back');
    const sum = (list: Shape[]) => list.reduce((a, sh) => a + area(sh), 0);
    const sd: Side = sum(back) > sum(front) ? 'back' : 'front';
    const hot = sd === 'back' ? back : front;
    if (!hot.length) return { side: sd, viewBox: '-80 45 160 160' };
    const x0 = Math.min(...hot.map((h) => h.box[0]));
    const y0 = Math.min(...hot.map((h) => h.box[1]));
    const x1 = Math.max(...hot.map((h) => h.box[2]));
    const y1 = Math.max(...hot.map((h) => h.box[3]));
    // квадрат вокруг работающих мышц с полями, не мельче 110 единиц (видно, где на теле)
    const s = Math.max(110, x1 - x0, y1 - y0) * 1.18;
    const cx = (x0 + x1) / 2;
    const cy = Math.min(400 - s / 2, Math.max(s / 2 - 10, (y0 + y1) / 2));
    return { side: sd, viewBox: `${(cx - s / 2).toFixed(1)} ${(cy - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}` };
  }, [sex, roles]);
  return <Figure side={side} sex={sex} width={size} height={size} viewBox={viewBox} roles={roles} fibers={false} />;
});

/** Фигура из контуров: кожа (просветы), мышцы с объёмом (градиент) и волокнами, сухожилия, у женской — грудь и причёска */
const Figure = memo(function Figure({ side, sex, height, width, viewBox, roles, fibers = true }: { side: Side; sex: Sex; height: number; width?: number; viewBox?: string; roles: Roles; fibers?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const b = FIGURE_BOX;
  const shapes = figure(sex, side);
  const fillOf = (sh: Shape): string => {
    if (sh.kind === 'skin') return colors.anatomySkin;
    if (sh.kind === 'tendon') return `url(#${uid}t)`;
    if (sh.kind === 'neutral') return `url(#${uid}n)`;
    if (sh.kind === 'hair') return `url(#${uid}h)`;
    const r = roles(sh);
    return r === 'p' ? `url(#${uid}p)` : r === 's' ? `url(#${uid}s)` : `url(#${uid}i)`;
  };
  return (
    <Svg viewBox={viewBox ?? `${b.x} ${b.y} ${b.w} ${b.h}`} width={width ?? (height * b.w) / b.h} height={height}>
      <Defs>
        <Volume id={`${uid}i`} color={colors.anatomyIdle} />
        <Volume id={`${uid}p`} color={colors.musclePrimary} />
        <Volume id={`${uid}s`} color={colors.muscleSecondary} />
        <Volume id={`${uid}t`} color={colors.anatomyTendon} />
        <Volume id={`${uid}n`} color={colors.anatomyNeutral} />
        <Volume id={`${uid}h`} color={colors.anatomyHair} />
      </Defs>
      <G>
        {shapes.map((sh) => {
          if (sh.kind === 'line') return <Path key={sh.id} d={sh.d} fill="none" stroke={colors.anatomySkin} strokeWidth={1.1} strokeLinecap="round" />;
          if (sh.kind === 'contour') return <Path key={sh.id} d={sh.d} fill="none" stroke={colors.anatomySkin} strokeWidth={1.3} strokeLinecap="round" />;
          return (
            <G key={sh.id}>
              <Path d={sh.d} fill={fillOf(sh)} stroke={sh.kind === 'skin' ? undefined : colors.anatomySkin} strokeWidth={0.6} />
              {fibers && sh.fib ? <Path d={sh.fib} fill="none" stroke={colors.anatomyFiber} strokeWidth={0.45} strokeLinecap="round" /> : null}
            </G>
          );
        })}
      </G>
    </Svg>
  );
});

/** Объём мышцы: светлее к середине, темнее к краям (градиент по рамке каждого контура) */
function Volume({ id, color }: { id: string; color: string }) {
  return (
    <RadialGradient id={id} cx="0.42" cy="0.38" r="0.8">
      <Stop offset="0" stopColor={mix(color, 0.16)} />
      <Stop offset="0.65" stopColor={color} />
      <Stop offset="1" stopColor={mix(color, -0.22)} />
    </RadialGradient>
  );
}

/** Осветлить (k > 0) или затемнить (k < 0) цвет #RRGGBB */
function mix(hex: string, k: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function LegendRow({ color, title, items }: { color: string; title: string; items: string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, marginTop: 4 }} />
      <T v="callout" color={colors.text} style={{ flex: 1 }}>
        <T v="callout" style={{ fontWeight: '700' }} color={colors.text}>
          {title}:{' '}
        </T>
        {items.join(', ')}
      </T>
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface2, borderRadius: radius.lg, paddingVertical: 12 },
  side: { alignItems: 'center' },
  label: { marginTop: 4, color: colors.textDim },
});
