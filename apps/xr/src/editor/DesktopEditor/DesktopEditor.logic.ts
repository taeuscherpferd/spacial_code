export class DesktopEditorLogic {
  static normalizeText(text: string): string {
    return text.replace(/\r\n?/g, '\n')
  }
}
