import { dropRight, takeRight } from 'lodash-es';
import { computeActiveElementCount } from '../compute_active_elements';
import type { ChatElement } from '../../types';

interface StaticElements {
  useStaticOptimization: boolean;
  frozenElements: ChatElement[];
  liveElements: ChatElement[];
}

export function computeStaticElements(
  elements: ChatElement[],
  allDataInitialized: boolean,
): StaticElements {
  if (!allDataInitialized) {
    return { useStaticOptimization: false, frozenElements: [], liveElements: [] };
  }

  const activeCount = computeActiveElementCount(elements);
  return {
    useStaticOptimization: true,
    frozenElements: dropRight(elements, activeCount),
    liveElements: takeRight(elements, activeCount),
  };
}
