// uikit's bundled Inter covers basic Latin only, so the symbols the shared labels use become ASCII.
const replacements: Record<string, string> = {
  '▸': '>',
  '▾': 'v',
  '◇': '-',
  '◆': '#',
  '↰': '<',
  '·': '|',
  '•': '*',
  '…': '...',
}

export class VrTextLogic {
  static ascii(text: string): string {
    return text.replace(/[▸▾◇◆↰·•…]/g, (symbol) => replacements[symbol])
  }
}
