import { isIP } from 'node:net'
import { createTransport } from 'nodemailer'
import type { Mailer, Who } from '../makers.ts'

/** A mail server as the borrowed part is handed it: the address that the address rule answered for its name. */
export interface SmtpServer {
  address: string
  // The name that the address was looked up by: the certificate of the server is held to it.
  name: string
  port: number
  // Secure from the first byte, or made secure before anything is sent.
  secure: boolean
  user: string
  password: string
}

type Message = Parameters<Mailer['send']>[0]

// How long the server is given to answer, in milliseconds: one that says nothing does not hold a call for good.
const times = { connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000 }

const addressOf = (who: Who): string | { name: string; address: string } =>
  who.name === undefined ? who.address : { name: who.name, address: who.address }

/**
 * Takes a mail server and one message. Sends the message by SMTP with the borrowed part, over one connection to
 * the address that was handed, which is closed after it. Answers the addresses that the server did not take. Throws
 * what the part throws where the server took the message for nobody.
 */
export async function sendBySmtp(server: SmtpServer, message: Message): Promise<{ refused?: string[] }> {
  const transport = createTransport({
    host: server.address,
    port: server.port,
    secure: server.secure,
    requireTLS: !server.secure,
    ...(server.user === '' ? {} : { auth: { user: server.user, pass: server.password } }),
    // A name is sent to the server and its certificate held to it; an address that was written as one is not.
    tls: isIP(server.name) ? {} : { servername: server.name },
    ...times,
  })
  try {
    const sent = await transport.sendMail({
      from: addressOf(message.from),
      to: message.to.map(addressOf),
      ...(message.cc ? { cc: message.cc.map(addressOf) } : {}),
      ...(message.bcc ? { bcc: message.bcc.map(addressOf) } : {}),
      ...(message.replyTo ? { replyTo: addressOf(message.replyTo) } : {}),
      subject: message.subject,
      ...(message.text === undefined ? {} : { text: message.text }),
      ...(message.html === undefined ? {} : { html: message.html }),
      ...(message.headers ? { headers: message.headers } : {}),
      ...(message.attach
        ? {
            attachments: message.attach.map((one) => ({
              filename: one.name,
              contentType: one.kind,
              content: Buffer.from(one.bytes),
            })),
          }
        : {}),
    })
    const rejected: unknown[] = Array.isArray(sent.rejected) ? sent.rejected : []
    const refused = rejected.map((one) => (typeof one === 'string' ? one : String(Reflect.get(Object(one), 'address'))))
    return refused.length ? { refused } : {}
  } finally {
    transport.close()
  }
}
