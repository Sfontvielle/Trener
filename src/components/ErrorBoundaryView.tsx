import React from 'react';
import { View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { colors, space } from '@/theme';
import { Button, EmptyState, T } from './ui';

/** Вместо белого экрана — понятное сообщение и возможность продолжить. Данные при этом не теряются. */
export function ErrorBoundaryView({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xl }}>
      <EmptyState icon="warning-outline" title="Что-то пошло не так" text="Экран не смог загрузиться. Твои данные сохранены на устройстве." />
      <T v="small" style={{ textAlign: 'center', marginBottom: space.lg }} numberOfLines={3}>
        {error?.message}
      </T>
      <Button title="Попробовать снова" onPress={retry} />
    </View>
  );
}
