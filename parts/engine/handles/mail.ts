import { heldToLeave } from '../flows/leave.ts'
import { callOf } from '../handleCall.ts'
import { sendMail } from '../mail/send.ts'
import type { Opened } from '../opened.ts'

/**
 * The working object behind the handle `mail`. `send` reads a message, and hands it to the mailer of the app, or
 * writes it to the log, as the mode says. It answers a promise of nothing, so it works where a call may wait, and
 * a call that only reads sends nothing.
 */
export const handle = (o: Opened): object => ({
  async send(message: unknown): Promise<void> {
    const cx = callOf('`mail.send`', { waits: true, acts: true })
    await heldToLeave(cx, 'mail.send', 'sends', (held) => sendMail(o, held, message))
  },
})
