import { shuffle } from 'lodash-es';

export function randomizeArrayToNItems<T>(array: T[], n: number) {
  const randomized = shuffle([...array]);
  const max = Math.min(n, randomized.length);

  return randomized.slice(0, max);
}
