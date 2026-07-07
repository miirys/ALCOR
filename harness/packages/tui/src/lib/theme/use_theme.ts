import { useContext } from 'react';
import { EnvironmentContext } from '../environment_context';

export type Theme = 'light' | 'dark';

export function useTheme(): Theme {
  const { theme } = useContext(EnvironmentContext);
  return theme;
}
