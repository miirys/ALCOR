import { isEqual, cloneDeep } from 'lodash-es';
import { EventEmitter } from '../event_emitter';

/** promotes EventEmitter into an emitter that will only fire change event if the value T has changed
 * @param emitter the base emitter this function wraps
 * @param equalFn optionally, you can provide a function to compare the event data, if no equalFn is provided, we use lodash isEqual
 */
export const diffEmitter = <T>(
  emitter: EventEmitter<T>,
  equalFn?: (a: T, b: T) => boolean,
): EventEmitter<T> => {
  let previousValue: T;
  const isEqualFn = equalFn || isEqual;
  return {
    event: emitter.event.bind(emitter),
    fire: (data: T) => {
      if (!isEqualFn(previousValue, data)) {
        previousValue = cloneDeep(data);
        emitter.fire(data);
      }
    },
    dispose: emitter.dispose.bind(emitter),
  };
};
