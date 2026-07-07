import { ServiceCollection } from '@gitlab/needle';
import { FlowWebviewService } from './flow_webview_service';

export function registerDuoFlowWebviewServices(services: ServiceCollection) {
  services.addClass(FlowWebviewService);
}
