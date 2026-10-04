import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '@/theme';
import { T } from './ui';

/** Кольцо прогресса с плавной анимацией заполнения (анимируем число, а не SVG-компонент — работает и на web) */
export function Ring({
  size = 72,
  stroke = 7,
  progress,
  color = colors.accent,
  track = colors.surface3,
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, progress));
  const a = useState(() => new Animated.Value(0))[0];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = a.addListener(({ value }) => setShown(value));
    Animated.timing(a, { toValue: target, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [target, a]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {shown > 0.001 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - shown)} strokeLinecap="round" /> : null}
      </Svg>
      {children}
    </View>
  );
}

/** Горизонтальная полоса прогресса макроса */
export function Bar({ progress, color = colors.accent, height = 6, style }: { progress: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const p = Math.max(0, Math.min(1, progress));
  const a = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(a, { toValue: p, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [p, a]);
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: colors.surface3, overflow: 'hidden' }, style]}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export interface LinePoint {
  x: number; // индекс/время
  y: number;
  raw?: number;
}

const pad = { l: 8, r: 40, t: 12, b: 20 };

/** Линейный график тренда веса: точки — замеры, линия — сглаженный тренд */
/** band — референсный диапазон [низ, верх] (полупрозрачная полоса); undefined-граница = край графика */
export function TrendChart({ points, height = 170, unit = 'кг', labels, band, emptyText }: { points: LinePoint[]; height?: number; unit?: string; labels?: [string, string]; band?: [number | undefined, number | undefined]; emptyText?: string }) {
  const [w, setW] = useState(0);
  const data = useMemo(() => {
    if (points.length < 2 || !w) return null;
    const vals: number[] = points.flatMap((p) => (p.raw !== undefined ? [p.y, p.raw] : [p.y]));
    for (const b of band ?? []) if (b !== undefined) vals.push(b);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (max - min < 1) {
      const mid = (max + min) / 2;
      min = mid - 0.5;
      max = mid + 0.5;
    }
    const x0 = points[0].x;
    const x1 = points[points.length - 1].x;
    const iw = w - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const X = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * iw;
    const Y = (y: number) => pad.t + (1 - (y - min) / (max - min)) * ih;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const area = `${d} L${X(x1).toFixed(1)},${height - pad.b} L${X(x0).toFixed(1)},${height - pad.b} Z`;
    const bandRect = band && (band[0] !== undefined || band[1] !== undefined) ? { y1: Y(band[1] ?? max), y2: Y(band[0] ?? min) } : null;
    return { X, Y, d, area, min, max, bandRect };
  }, [points, w, height, band]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {data ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.25} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map((f) => {
            const y = pad.t + f * (height - pad.t - pad.b);
            const v = data.max - f * (data.max - data.min);
            return (
              <React.Fragment key={f}>
                <Line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
                <SvgText x={w - pad.r + 6} y={y + 4} fill={colors.muted} fontSize={11}>
                  {v.toFixed(1)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {data.bandRect ? <Rect x={pad.l} y={data.bandRect.y1} width={w - pad.l - pad.r} height={Math.max(1, data.bandRect.y2 - data.bandRect.y1)} fill={colors.accent} opacity={0.1} /> : null}
          <Path d={data.area} fill="url(#g)" />
          {points.map((p, i) => (p.raw !== undefined ? <Circle key={i} cx={data.X(p.x)} cy={data.Y(p.raw)} r={2.6} fill={colors.muted} /> : null))}
          <Path d={data.d} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={data.X(points[points.length - 1].x)} cy={data.Y(points[points.length - 1].y)} r={4.5} fill={colors.accent} />
          {labels ? (
            <>
              <SvgText x={pad.l} y={height - 4} fill={colors.muted} fontSize={11}>
                {labels[0]}
              </SvgText>
              <SvgText x={w - pad.r} y={height - 4} fill={colors.muted} fontSize={11} textAnchor="end">
                {labels[1]}
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <T v="small">{points.length < 2 ? (emptyText ?? 'Нужно минимум 2 взвешивания') : ''}</T>
        </View>
      )}
    </View>
  );
}

/** Столбики по дням (напр. тренировки/калории за неделю) */
export function MiniBars({ values, max, height = 48, highlightLast = true, color = colors.accent }: { values: number[]; max?: number; height?: number; highlightLast?: boolean; color?: string }) {
  const m = max ?? Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, (Math.min(v, m) / m) * height),
            borderRadius: 3,
            backgroundColor: v > 0 ? (highlightLast && i === values.length - 1 ? color : colors.barSoft) : colors.surface3,
          }}
        />
      ))}
    </View>
  );
}
