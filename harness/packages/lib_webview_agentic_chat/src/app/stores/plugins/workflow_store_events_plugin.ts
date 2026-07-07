import { PiniaPluginContext } from 'pinia';
import { Bridge } from '../../../common/bridge';

/**
 * Method that attaches the listeners to each store. This is to bind
 * all stores to the a communication layer that receives notifications
 * and execute defined actions. This method will be called only once when the
 * store is being created.
 *
 * @param context Pinia context.
 * @returns  void
 */
export function setWorkflowStoreEvents({
  setResponseListener,
  sendRequest,
  sendNotification,
  sendGraphqlRequest,
  logToOutputChannel,
}: Bridge) {
  return (context: PiniaPluginContext) => {
    // The `if` here helps TS with type inference
    if (context.options?.events) {
      Object.entries(context.options.events).forEach(([event, action]) => {
        setResponseListener(event, context.store[action]);
      });
    }

    return { sendRequest, sendNotification, sendGraphqlRequest, logToOutputChannel };
  };
}

declare module 'pinia' {
  // we need both variables for the type declaration to merge:
  // https://pinia.vuejs.org/core-concepts/plugins.html#Typing-new-creation-options
  //
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S, Store> {
    events?: Record<string, keyof StoreActions<Store>>;
  }
}
