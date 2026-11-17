import React, { memo } from 'react';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { figure } from '@/features/exercises/anatomy/geometry';

/** Мышцы, на которые падает зелёный свет (спина, плечи, трицепс) */
const LIT = new Set(['trap', 'delt-post', 'delt-lat-b', 'lat', 'infraspin', 'teres', 'teres-minor', 'tri-long', 'tri-lat']);

/** Кадр иллюстрации: от макушки до таза, по ширине — плечи с руками (соотношение 4 : 5) */
export const HERO_VIEWBOX = { x: -88, y: -30, w: 176, h: 220 } as const;
/** Точка между лопаток — откуда расходится энергия (доля кадра) */
export const HERO_ORIGIN = { x: 0.5, y: (100 - HERO_VIEWBOX.y) / HERO_VIEWBOX.h };

/**
 * Атлет со спины для приветствия — рисунок по анатомической фигуре RYNJI (контуры по атласу Z-Anatomy,
 * CC BY-SA 4.0): графитовые мышцы, спина и плечи в зелёном свете, светящийся контур силуэта.
 * Без 3D-рендера: вектор, один файл данных с картой мышц.
 */
export const AtlasHero = memo(function AtlasHero({ width, height, lime }: { width: number; height: number; lime: string }) {
  const shapes = figure('male', 'back');
  const body = shapes.filter((s) => s.kind === 'skin');
  const parts = shapes.filter((s) => s.kind === 'muscle' || s.kind === 'neutral' || s.kind === 'hair' || (s.kind === 'tendon' && s.base !== 'bone'));
  const v = HERO_VIEWBOX;
  return (
    <Svg width={width} height={height} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} preserveAspectRatio="xMidYMin slice">
      <Defs>
        <LinearGradient id="heroMus" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A434F" />
          <Stop offset="0.55" stopColor="#232A33" />
          <Stop offset="1" stopColor="#121519" />
        </LinearGradient>
        <RadialGradient id="heroLit" cx="0" cy="105" r="95" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#4F6A3A" />
          <Stop offset="0.6" stopColor="#2F3B2C" />
          <Stop offset="1" stopColor="#232A33" />
        </RadialGradient>
      </Defs>
      {/* свечение контура: три обводки от широкой и прозрачной к тонкой и яркой */}
      <G fill="none" stroke={lime} strokeLinejoin="round">
        {[[7, 0.07], [3.5, 0.16], [1.4, 0.85]].map(([w, o]) => (
          <G key={w} strokeWidth={w} opacity={o}>
            {body.map((s) => (
              <Path key={s.id} d={s.d} />
            ))}
          </G>
        ))}
      </G>
      <G fill="url(#heroMus)">
        {body.map((s) => (
          <Path key={s.id} d={s.d} />
        ))}
      </G>
      <G stroke="#07090B" strokeWidth={0.45}>
        {parts.map((s) => (
          <Path key={s.id} d={s.d} fill={s.kind === 'muscle' && LIT.has(s.base) ? 'url(#heroLit)' : 'url(#heroMus)'} />
        ))}
      </G>
    </Svg>
  );
});
