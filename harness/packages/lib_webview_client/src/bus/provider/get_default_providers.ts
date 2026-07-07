import { SocketIoMessageBusProvider } from './socket_io_message_bus_provider';
import { HostApplicationMessageBusProvider } from './host_application_message_bus_provider';

export const getDefaultProviders = () => {
  const hostApplicationProvider = new HostApplicationMessageBusProvider();
  const socketIoMessageBusProvider = new SocketIoMessageBusProvider();

  return [hostApplicationProvider, socketIoMessageBusProvider];
};
