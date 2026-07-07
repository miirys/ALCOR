import { HtmlTransformStep } from '../types';
import { broadcastKeyboardEventsScript } from '../scripts/broadcast_keyboard_events_script';
import { execCommandScript } from '../scripts/exec_command_script';

export const addAdditionalScripts: HtmlTransformStep = (html: string) => {
  const scriptsToInject = [broadcastKeyboardEventsScript, execCommandScript].join('\n\n');

  return html.replace('</body>', `${scriptsToInject}</body>`);
};
