import React from 'react';
import { router } from 'expo-router';
import type { Exercise } from '@/types';
import { Header, Screen } from '@/components/Screen';
import { ExerciseList } from '@/features/exercises/ExerciseList';

/** Библиотека упражнений — отдельный экран (эталон 03_anatomy): поиск, группы мышц, карточка упражнения */
export default function Library() {
  return (
    <Screen scroll={false}>
      <Header title="Библиотека упражнений" />
      <ExerciseList onSelect={(e: Exercise) => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })} />
    </Screen>
  );
}
