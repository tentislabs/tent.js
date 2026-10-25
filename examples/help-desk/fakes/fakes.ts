import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { testApp } from 'tentjs/test'

export type App = Awaited<ReturnType<typeof testApp>>

/** The size of the vectors of the embedder, as the tables state it. */
export const SIZE = 1536

/** The guide, a PDF of three pages, and a recording of two seconds, which these tests hand the app. */
export const GUIDE = readFileSync(new URL('./files/guide.pdf', import.meta.url))
export const RECORDING_FILE = fileURLToPath(new URL('./files/question.wav', import.meta.url))
export const RECORDING = readFileSync(RECORDING_FILE)

/** What the faked listener hears in every recording. */
export const HEARD = 'How do I reset a password?'

const SMALL = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'to',
  'do',
  'i',
  'is',
  'it',
  'my',
  'how',
  'in',
  'on',
  'for',
  'you',
])

// Each word is counted at a place of the vector that its letters choose, so texts that share words lie near.
function place(word: string): number {
  let hash = 2166136261
  for (const letter of word) hash = Math.imul(hash ^ (letter.codePointAt(0) ?? 0), 16777619)
  return (hash >>> 0) % SIZE
}

/** A vector of the meaning of a text: its words, counted and of length one. */
export function meaningOf(text: string): number[] {
  const vector: number[] = Array.from({ length: SIZE }, () => 0)
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  for (const word of words) if (!SMALL.has(word)) vector[place(word)] = (vector[place(word)] ?? 0) + 1
  const length = Math.hypot(...vector) || 1
  vector[0] = (vector[0] ?? 0) + 0.001
  return vector.map((n) => n / length)
}

type Message = { who: string; text?: string; result?: unknown; error?: string; calls?: { tool: string }[] }
type Request = { messages: Message[] }
// An answer of a faked model: what it writes, the tools it asks for by name and input, or how it failed.
type Answer = { text?: string; calls?: { tool: string; with: unknown }[]; fail?: 'server' }

function isRequest(value: unknown): value is Request {
  return typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'messages'))
}

// The chunks of the guide that a tool answered, as `findInGuide` gives them.
function chunksOf(result: unknown): { title: string; page: number; text: string }[] {
  if (!Array.isArray(result)) return []
  return result.flatMap((chunk: unknown) => {
    if (typeof chunk !== 'object' || chunk === null) return []
    const title = Reflect.get(chunk, 'title')
    const page = Reflect.get(chunk, 'page')
    const text = Reflect.get(chunk, 'text')
    return typeof title === 'string' && typeof page === 'number' && typeof text === 'string'
      ? [{ title, page, text }]
      : []
  })
}

/**
 * A model that writes as a scripted helper of the help desk would: it searches the guide for a question of how,
 * looks an order up and refunds it when it is asked to, and answers from what its tools gave.
 */
export function scriptedReply(request: unknown): Answer {
  if (!isRequest(request)) return { text: 'I did not understand that.', calls: [] }
  const messages = request.messages
  const last = messages.at(-1)
  const asked = [...messages].reverse().find((message) => message.who === 'user')?.text ?? ''
  if (last?.who === 'tool') {
    if (last.error) return { text: `That did not work: ${last.error}`, calls: [] }
    const found = chunksOf(last.result)
    const first = found[0]
    if (first) return { text: `${first.text.trim()} (${first.title}, page ${first.page})`, calls: [] }
    const status = typeof last.result === 'object' && last.result !== null ? Reflect.get(last.result, 'status') : ''
    if (status === 'refunded') return { text: 'The order is refunded.', calls: [] }
    return { text: 'I found nothing on that.', calls: [] }
  }

  const order = /ord_[a-z0-9]+/i.exec(asked)?.[0]
  if (/refund/i.test(asked) && order) return { text: '', calls: [{ tool: 'refundOrder', with: { order } }] }
  if (/\?|how/i.test(asked)) return { text: '', calls: [{ tool: 'findInGuide', with: { question: asked } }] }
  return { text: 'I can help with that.', calls: [] }
}

/**
 * Fakes every model of the app, and the two services. It answers what the services were sent, how many replies
 * each writer gave, and a switch that takes the first writer off, as a provider that is down.
 */
export function fakeAll(app: App) {
  const replies = { writer: 0, backup: 0 }
  let writerOff = false
  app.fake('embedder', {
    embed: (text: unknown) =>
      Array.isArray(text) ? text.map((one) => meaningOf(String(one))) : meaningOf(String(text)),
  })
  app.fake('writer', {
    reply: (request: unknown) => {
      if (writerOff) return { fail: 'server' }
      replies.writer += 1
      return scriptedReply(request)
    },
  })
  app.fake('backup', {
    reply: (request: unknown) => {
      replies.backup += 1
      return scriptedReply(request)
    },
  })
  app.fake('listener', { hear: () => ({ text: HEARD }) })
  let spoken = 0
  app.fake('speaker', {
    speak: () => {
      spoken += 1
      return RECORDING
    },
  })
  const payments = app.fake('payments', {
    getOrder: ({ id }: { id: string }) => ({
      id,
      total: 4900,
      currency: 'USD',
      status: 'paid',
      email: 'ada@desk.example',
    }),
    refundOrder: ({ id }: { id: string }) => ({ id, status: 'refunded' }),
  })
  const mail = app.fake('mailService', { send: () => ({ id: 'mail_1' }) })
  return {
    payments,
    mail,
    replies,
    spoken: () => spoken,
    switchWriterOff: () => {
      writerOff = true
    },
  }
}

/** The key the faked mail service signs its calls with, and the secret of the hook that holds it. */
export const HOOK_KEY = Buffer.from('the key of the faked mail service, 32 bytes long', 'utf8').subarray(0, 32)
export const HOOK_SECRET = `whsec_${HOOK_KEY.toString('base64')}`

/** A call of the mail hook as the faked mail service sends it: signed by the standard of webhooks. */
export function mailCall(
  mail: { from: string; name?: string; subject: string; text: string },
  id: string,
  key = HOOK_KEY,
) {
  const body = JSON.stringify(mail)
  const time = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', key).update(`${id}.${time}.${body}`).digest('base64')
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': time,
      'webhook-signature': `v1,${signature}`,
    },
    sign: false,
  }
}

/** The code of six digits in the newest mail the app sent to that email, as the person reads it there. */
export function codeOf(app: App, email: string): string {
  const mail = app.mailbox.findLast((one) => JSON.stringify(Object(one).to).includes(email))
  const code = /\d{6}/.exec(String(Object(mail).text))?.[0]
  if (!code) throw new Error(`No mail to ${email} holds a code of six digits.`)
  return code
}

/** Waits for what moves on a page to come to rest, a transition or a fade, before a picture is taken of it. */
export function settle(): Promise<void> {
  return new Promise((done) => setTimeout(done, 700))
}

/** The id of the user of the seed with that email. */
export async function userOf(app: App, email: string): Promise<string> {
  const users = await app.rows('users')
  const user = users.find((row) => row.email === email)
  if (!user) throw new Error(`The seed holds no user with the email ${email}.`)
  return user.id
}
