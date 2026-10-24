import { member } from '../handle.ts'

/** A message. One of `text` and `html` is required, and `from` falls back to that of the project. */
interface Message {
  to: string | readonly string[]
  subject: string
  text?: string
  html?: string
  from?: string | { name: string; address: string }
  replyTo?: string
  cc?: string | readonly string[]
  bcc?: string | readonly string[]
  headers?: Record<string, string>
  attach?: readonly unknown[]
}

/** The handle of mail. It answers a promise of nothing. */
export interface Mail {
  send(message: Message): Promise<void>
}

export const mail: Mail = {
  send: member('mail', 'send'),
}
