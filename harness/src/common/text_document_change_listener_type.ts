// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum TextDocumentChangeListenerType {
  onDidOpen = 'onDidOpen',
  onDidChangeContent = 'onDidChangeContent',
  onDidSave = 'onDidSave',
  onDidClose = 'onDidClose',
  onDidSetActive = 'onDidSetActive',
  onDocumentLanguageChange = 'onDocumentLanguageChange',
}
/* eslint-enable @typescript-eslint/naming-convention */
