import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import type { Exercise, MuscleSlug, Sex } from '@/types';
import { useProfile } from '@/stores/profile';
import { colors, radius, themed } from '@/theme';
import { Icon, T } from '@/components/ui';
import { prefersReducedMotion } from '@/components/motion';
import { MUSCLE_LABEL } from '@/data/exercises';
import { EXERCISE_ANIMATIONS, type ExerciseAnimation as Anim } from '@/data/exerciseAnimations';

const NATIVE = Platform.OS !== 'web';
/** Значок «3D» — цвет подсветки работающих мышц в рендере (tools/anim/web/body.js), не акцент темы */
const PRIMARY = '#3DDC84';
const RATIO = 4 / 3;

export const animationFor = (ex: Exercise): Anim | undefined => EXERCISE_ANIMATIONS[ex.id];

/** Ролик и постер под пол из профиля: у женщины — женская фигура (если её версия отрендерена) */
export function mediaFor(anim: Anim, sex: Sex | undefined): { loop: number; poster: number } {
  return sex === 'female' && anim.loopF && anim.posterF ? { loop: anim.loopF, poster: anim.posterF } : { loop: anim.loop, poster: anim.poster };
}

/**
 * 3D-анимация техники: зацикленный рендер анатомической фигуры с подсветкой работающих мышц.
 * Файлы встроены в приложение (офлайн). Касание — пауза/пуск; «Уменьшение движения» — стоп-кадр, пуск вручную.
 */
export function ExerciseAnimation({ ex, anim, sex: sexProp, stabilizers = [], legend = true }: { ex: Exercise; anim: Anim; /** Пол фигуры в ролике; не задан — из профиля */ sex?: Sex; stabilizers?: MuscleSlug[]; /** false — легенду показывает анатомическая карта под роликом */ legend?: boolean }) {
  const profileSex = useProfile((s) => s.profile?.sex);
  const sex = sexProp ?? profileSex;
  const media = mediaFor(anim, sex);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [full, setFull] = useState(false);
  const ref = useRef<Image>(null);
  useEffect(() => {
    if (!NATIVE) return;
    void (playing ? ref.current?.startAnimating() : ref.current?.stopAnimating());
  }, [playing]);
  const names = (list: MuscleSlug[]) => list.map((m) => MUSCLE_LABEL[m]).join(', ');
  return (
    <View style={{ gap: 10 }} testID="technique-3d">
      <View style={styles.box}>
        {/* касание по кадру — пауза/пуск; кнопка «во весь экран» — соседняя, не вложенная */}
        <Pressable onPress={() => setPlaying((p) => !p)} accessibilityRole="button" accessibilityLabel={`3D-анимация: ${ex.name}. ${playing ? 'Пауза' : 'Воспроизвести'}`}>
          <Image
            ref={ref}
            // на вебе остановить WebP нельзя — на паузе показываем стоп-кадр
            source={!NATIVE && !playing ? media.poster : media.loop}
            autoplay={playing}
            contentFit="cover"
            transition={0}
            style={{ width: '100%', aspectRatio: RATIO }}
            accessibilityIgnoresInvertColors
            testID="technique-3d-media"
          />
          {!playing ? (
            <View style={styles.center} pointerEvents="none">
              <View style={styles.play}>
                <Icon name="play" size={26} color="#FFFFFF" style={{ marginLeft: 3 }} />
              </View>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.badge} pointerEvents="none">
          <T v="small" color="#0B0D06" style={{ fontWeight: '800', fontSize: 11 }}>
            3D
          </T>
        </View>
        <View style={styles.bar}>
          <Pressable onPress={() => setPlaying((p) => !p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Воспроизвести'} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 44, marginVertical: -12 }}>
            <Icon name={playing ? 'pause' : 'play'} size={16} color="#FFFFFF" />
            <T v="small" color="rgba(255,255,255,0.8)" style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>
              {playing ? 'Повторение по кругу' : 'Пауза'}
            </T>
          </Pressable>
          <Pressable onPress={() => setFull(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Во весь экран" testID="technique-3d-full" style={{ width: 44, height: 44, margin: -13, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="expand" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
      {legend ? (
        <View style={styles.legend} accessible accessibilityLabel={`Работают: ${names(anim.primary)}. Задействованы слегка: ${names([...anim.secondary, ...stabilizers]) || 'нет'}`}>
          <Legend color={colors.musclePrimary} title="Работают" text={names(anim.primary)} />
          {anim.secondary.length || stabilizers.length ? <Legend color={colors.muscleSecondary} title="Задействованы слегка" text={names([...anim.secondary, ...stabilizers])} /> : null}
        </View>
      ) : null}
      <FullScreen visible={full} media={media} title={ex.name} onClose={() => setFull(false)} />
    </View>
  );
}

function Legend({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="caption" color={colors.textDim}>
        {title}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          {text}
        </T>
      </View>
    </View>
  );
}

function FullScreen({ visible, media, title, onClose }: { visible: boolean; media: { loop: number; poster: number }; title: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const w = Math.min(width, (height - 120) * RATIO);
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" transparent statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.fullBg}>
        <View style={styles.fullHead}>
          <T v="h3" color="#FFFFFF" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </T>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Закрыть" testID="technique-3d-close">
            <Icon name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        {visible ? <Image source={media.loop} placeholder={media.poster} contentFit="contain" style={{ width: w, aspectRatio: RATIO }} accessibilityIgnoresInvertColors /> : null}
      </View>
    </Modal>
  );
}

const styles = themed({
  box: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0B0D0F' },
  badge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: PRIMARY },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(0,0,0,0.45)' },
  legend: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fullBg: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', gap: 16 },
  fullHead: { position: 'absolute', top: 54, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
