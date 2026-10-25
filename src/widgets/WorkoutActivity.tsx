import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { WorkoutActivityProps } from '@/features/training/liveActivity';

/**
 * Live Activity активной тренировки: экран блокировки (подробно), компактный Dynamic Island (главные цифры),
 * расширенный (подробности). Компонент с директивой 'widget' собирается в отдельный бандл расширения:
 * внутри только компоненты Expo UI (SwiftUI), без хуков, импортов и внешних констант — цвета объявлены внутри.
 * Секундомер тренировки и обратный отсчёт отдыха тикают сами (Text date / timerInterval), без обновлений из приложения.
 */
const WorkoutActivity = (p: WorkoutActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  // Акцент пользователя; на светлом экране блокировки — его затемнённый вариант (лайм на белом не читается)
  const light = env.colorScheme === 'light';
  const lime = env.isLuminanceReduced ? '#FFFFFF' : light ? p.accentLight : p.accentDark;
  const dim = light ? '#5F6168' : '#9C9CA2';
  const resting = p.restTo > 0 && p.restTo > p.restFrom;
  const started = new Date(p.startedAt);
  const setShort = p.setNo > 0 ? `${p.setNo}/${p.setTotal}` : p.allDone ? '✓' : p.setText === 'Разминка' ? 'Р' : `${p.setTotal}/${p.setTotal}`;
  const exerciseLine = p.superset ? `${p.superset} · ${p.exercise}` : p.exercise;

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={8}>
          <Image systemName="figure.strengthtraining.traditional" color={lime} size={16} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(dim), lineLimit(1)]}>{p.title}</Text>
          <Spacer />
          <Text date={started} dateStyle="timer" modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit(), foregroundStyle(dim)]} />
        </HStack>
        <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(lime), lineLimit(2)]}>{exerciseLine}</Text>
        <HStack spacing={8}>
          <Text modifiers={[font({ size: 16, weight: 'semibold' })]}>{p.setText}</Text>
          {p.target ? <Text modifiers={[font({ size: 16, weight: 'bold' }), monospacedDigit()]}>{p.target}</Text> : null}
          <Spacer />
          <Text modifiers={[font({ size: 12 }), foregroundStyle(dim)]}>{`${p.exerciseNo} из ${p.exerciseTotal}`}</Text>
        </HStack>
        <ProgressView value={p.progress} modifiers={[foregroundStyle(lime)]} />
        {resting ? (
          <HStack spacing={6}>
            <Image systemName="timer" color={lime} size={13} />
            <Text modifiers={[font({ size: 13 }), foregroundStyle(dim)]}>Отдых</Text>
            <Text timerInterval={{ lower: new Date(p.restFrom), upper: new Date(p.restTo) }} modifiers={[font({ size: 13, weight: 'bold' }), monospacedDigit()]} />
          </HStack>
        ) : p.next ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(dim), lineLimit(1)]}>{p.next}</Text>
        ) : null}
      </VStack>
    ),
    compactLeading: <Image systemName="figure.strengthtraining.traditional" color={lime} />,
    compactTrailing: resting ? (
      <Text timerInterval={{ lower: new Date(p.restFrom), upper: new Date(p.restTo) }} modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit(), foregroundStyle(lime), frame({ maxWidth: 52 })]} />
    ) : (
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit(), foregroundStyle(lime)]}>{setShort}</Text>
    ),
    minimal: <Image systemName="figure.strengthtraining.traditional" color={lime} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(dim)]}>{p.timed ? 'Подход · время' : 'Подход'}</Text>
        <Text modifiers={[font({ size: 22, weight: 'bold' }), monospacedDigit(), foregroundStyle(lime)]}>{setShort}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(dim)]}>{resting ? 'Отдых' : 'Тренировка'}</Text>
        {resting ? (
          <Text timerInterval={{ lower: new Date(p.restFrom), upper: new Date(p.restTo) }} modifiers={[font({ size: 22, weight: 'bold' }), monospacedDigit(), frame({ maxWidth: 80 })]} />
        ) : (
          <Text date={started} dateStyle="timer" modifiers={[font({ size: 22, weight: 'bold' }), monospacedDigit(), frame({ maxWidth: 80 })]} />
        )}
      </VStack>
    ),
    expandedCenter: <Text modifiers={[font({ size: 16, weight: 'bold' }), lineLimit(1)]}>{exerciseLine}</Text>,
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 6, bottom: 4 })]}>
        <HStack spacing={8}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{p.setText}</Text>
          {p.target ? <Text modifiers={[font({ size: 15, weight: 'bold' }), monospacedDigit(), foregroundStyle(lime)]}>{p.target}</Text> : null}
          <Spacer />
        </HStack>
        <ProgressView value={p.progress} modifiers={[foregroundStyle(lime)]} />
        {p.next ? <Text modifiers={[font({ size: 12 }), foregroundStyle(dim), lineLimit(1)]}>{p.next}</Text> : null}
      </VStack>
    ),
  };
};

export default createLiveActivity('WorkoutActivity', WorkoutActivity);
