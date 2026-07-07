import { takeRightWhile } from 'lodash-es';
import type { ChatElement } from '../types';

/**
 * Computes how many elements from the tail of the array are still actively updating.
 *
 * Active elements are those that can still change:
 * - Messages with isComplete: false (streaming)
 * - Tools with state.type 'loading' or 'approval_request'
 *
 * Once we encounter a completed element, everything before it is frozen.
 *
 * @param elements - The array of chat elements
 * @returns The count of active elements from the end of the array
 *
 * @example
 * // [msg(complete), msg(complete), tool(loading)] => returns 1
 * // [msg(complete), msg(streaming)] => returns 1
 * // [msg(complete), tool(complete)] => returns 0
 * // [msg(complete), msg(streaming), tool(loading)] => returns 2
 */
export function computeActiveElementCount(elements: ChatElement[]): number {
  const isElementActive = (el: ChatElement): boolean => {
    if (el.type === 'message') {
      return !el.isComplete;
    }
    if (el.type === 'tool') {
      return el.state.type === 'loading' || el.state.type === 'approval_request';
    }
    // Error elements are never active
    return false;
  };

  return takeRightWhile(elements, isElementActive).length;
}
