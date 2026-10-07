import type { ProcessState } from '@/connection/protocol'

export const terminalInput = (event: KeyboardEvent): string | null => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    return '\u0003'
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'd') {
    return '\u0004'
  }
  const controls: Record<string, string> = {
    Enter: '\r',
    Backspace: '\u007f',
    Tab: '\t',
    ArrowUp: '\u001b[A',
    ArrowDown: '\u001b[B',
    ArrowRight: '\u001b[C',
    ArrowLeft: '\u001b[D',
  }
  if (controls[event.key]) {
    return controls[event.key]
  }
  if (!event.ctrlKey && !event.metaKey && event.key.length === 1) {
    return event.key
  }
  return null
}

export const processLabel = (process: ProcessState): string => {
  switch (process.status) {
    case 'idle':
      return 'IDLE'
    case 'running':
      return '● RUNNING'
    case 'exited':
      return process.code === null ? 'EXITED' : `EXIT ${process.code}`
    case 'failed':
      return 'FAILED'
  }
}
