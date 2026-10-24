import type { Caller } from '../../core/index.ts'
import type { AiEnv, Message, ToolCall } from '../face.ts'
import { isStored, wordsOf } from '../../core/internal.ts'

/** A row of a conversation as `_t_memoryRead` answers it, with each file of it read. */
export interface Recalled {
  id: string
  who: 'user' | 'assistant' | 'tool' | 'summary'
  text?: string
  data?: unknown
  files?: { id: string; name: string; kind: string; words?: string; image?: Uint8Array }[]
}

/** A file of a message as the read step saved it: an image is handed as its bytes, any other file as its words. */
export interface ReadFile {
  id: string
  name: string
  image: boolean
  chars: number
}

/** The calls a stored row of the agent holds. */
const callsOf = (data: unknown): ToolCall[] =>
  (isStored(data) && Array.isArray(data.calls) ? data.calls : []).filter(isStored).map((one) => ({
    id: String(one.id),
    tool: String(one.tool),
    input: one.input,
  }))

/** The text of a message with the words of each file after it, each under its name. */
function withWords(text: string, files: { name: string; words?: string }[], words: Record<string, string>): string {
  const parts = [
    text,
    ...files.filter((one) => one.words !== undefined).map((one) => `${wordsOf(words, 'file', one.name)}\n${one.words}`),
  ]
  return parts.filter((one) => one !== '').join('\n\n')
}

/**
 * Takes the rows of a conversation that are sent, the names of the tools that are offered now, and the agent's
 * own words. Answers the messages of the conversation, mended: a
 * call of a tool that is not offered now is sent as text, a call with no answer is answered "This did not finish.",
 * an answer with no call is left out, the pictures of the answers of a round follow every answer of it, and a
 * message of the person with no answer after it is answered so too. Nothing stored is changed.
 */
export function messagesOfRows(rows: Recalled[], offered: Set<string>, words: Record<string, string>): Message[] {
  const messages: Message[] = []
  const unfinished = wordsOf(words, 'unfinished')
  let open: ToolCall[] = []
  // A message of the person, or a summary, that waits for its answer.
  let unanswered = false
  // The pictures of the answers of a round, given once every call of it is answered: a provider takes the answers
  // of the calls of one message first, before anything else.
  let pictures: Message[] = []
  const close = (): void => {
    for (const call of open) messages.push({ who: 'tool', id: call.id, result: unfinished })
    open = []
    messages.push(...pictures)
    pictures = []
  }
  for (const row of rows) {
    const files = row.files ?? []
    if (row.who === 'user' || row.who === 'summary') {
      close()
      if (unanswered && row.who === 'user') messages.push({ who: 'assistant', text: unfinished })
      const images = files
        .filter((one) => one.image)
        .map((one) => ({ bytes: one.image ?? new Uint8Array(), kind: one.kind }))
      messages.push({
        who: 'user',
        text: withWords(row.text ?? '', files, words),
        ...(images.length ? { images } : {}),
      })
      unanswered = row.who === 'user'
    } else if (row.who === 'assistant') {
      close()
      unanswered = false
      const calls = callsOf(row.data)
      const kept = calls.filter((call) => offered.has(call.tool))
      const told = calls
        .filter((call) => !offered.has(call.tool))
        .map((call) => `Called ${call.tool} with ${JSON.stringify(call.input)}`)
      const text = [row.text ?? '', ...told].filter((one) => one !== '').join('\n')
      messages.push({ who: 'assistant', ...(text ? { text } : {}), ...(kept.length ? { calls: kept } : {}) })
      // The calls still to be answered are a list of their own: the message keeps every call it made.
      open = [...kept]
    } else if (row.who === 'tool') {
      const data: Record<string, unknown> = isStored(row.data) ? row.data : {}
      const id = String(data.id ?? '')
      const at = open.findIndex((call) => call.id === id)
      if (at < 0) {
        // The answer of a call that is told as text stands as text under it, and one with no call is left out.
        const before = messages.at(-1)
        if (before?.who === 'assistant' && before.text?.includes(`Called ${String(data.tool)} with`))
          before.text = `${before.text}\n${JSON.stringify(data.error ?? data.result ?? null)}`
        continue
      }
      open.splice(at, 1)
      messages.push({
        who: 'tool',
        id,
        ...(data.error !== undefined ? { error: String(data.error) } : { result: data.result }),
      })
      // A picture that the tool's answer gave the model is given again with it, as it was the first time.
      const images = files
        .filter((one) => one.image)
        .map((one) => ({ bytes: one.image ?? new Uint8Array(), kind: one.kind }))
      if (images.length) pictures.push({ who: 'user', images })
    }
  }
  close()
  return messages
}

/** The text of the moment of a run that `knows` names, as one message, in the engine's own words. */
export function knowsText(knows: ('caller' | 'time')[], starter: Caller, startedAt: number, zone: string): string {
  const lines: string[] = []
  for (const one of knows) {
    if (one === 'caller') {
      if (starter.kind === 'system') lines.push('This run was started by the app itself.')
      else if (starter.user)
        lines.push(
          `You are talking with the user ${starter.user.id}, ${starter.user.roles.length ? `with the roles ${starter.user.roles.join(', ')}.` : 'with no role.'}`,
        )
      else lines.push('You are talking with a person who is not signed in.')
    } else lines.push(`The run started at ${momentText(startedAt, zone)} (${zone}).`)
  }
  return lines.join('\n')
}

/** A moment as a day and a time of day in a zone, with a space between them. */
function momentText(at: number, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at))
    const of = (type: string): string => parts.find((one) => one.type === type)?.value ?? ''
    return `${of('year')}-${of('month')}-${of('day')} ${of('hour')}:${of('minute')}`
  } catch {
    return new Date(at).toISOString()
  }
}

/** Reads the words of the files of a start that are no images, as the starter may download them: what the read step saves. */
export async function readFiles(env: AiEnv, ids: string[], starter: Caller): Promise<ReadFile[]> {
  const read: ReadFile[] = []
  for (const id of ids) {
    const info = env.files.info(id, starter)
    const image = info.kind.startsWith('image/')
    const chars = image ? 0 : (await env.files.text(id, starter)).length
    read.push({ id, name: info.name, image, chars })
  }
  return read
}
