import type { AppDispatch } from '@/app/store'
import { connectionChanged, eventReceived } from '@/app/appSlice'
import type { ClientMessage, ServerEvent } from '@/connection/protocol'

export class WebSocketClient {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private dispatch: AppDispatch | null = null
  private manuallyClosed = false

  connect(dispatch: AppDispatch): void {
    this.dispatch = dispatch
    this.manuallyClosed = false
    this.open()
  }

  disconnect(): void {
    this.manuallyClosed = true
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
    }
    this.socket?.close()
    this.socket = null
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private open(): void {
    if (!this.dispatch) {
      return
    }
    this.dispatch(connectionChanged('connecting'))
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = import.meta.env.DEV ? '127.0.0.1:4310' : window.location.host
    const socket = new WebSocket(`${protocol}://${host}/ws`)
    this.socket = socket
    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return
      }
      this.dispatch?.(connectionChanged('connected'))
    })
    socket.addEventListener('message', (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ServerEvent
      this.dispatch?.(eventReceived(event))
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return
      }
      this.dispatch?.(connectionChanged('disconnected'))
      if (!this.manuallyClosed) {
        this.reconnectTimer = window.setTimeout(() => this.open(), 1_200)
      }
    })
  }
}

export const webSocketClient = new WebSocketClient()
