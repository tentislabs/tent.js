import { Unrunnable } from './flags.ts'

// The list of an app's commands is held to the `callSize` of a project that states none: the runner knows no other.
export const listSize = 1_048_576

// Every other answer, and a module, is held to the `readSize` of a project that states none.
export const answerSize = 100 * 1_048_576

/**
 * Takes an answer, the most bytes it may hold, and what it is, for the words of a refusal. Reads its body up to
 * that size, and stops reading past it. Answers the bytes; throws `Unrunnable` for an answer that is larger.
 */
export async function boundedBytes(answer: Response, most: number, what: string): Promise<Uint8Array> {
  const reader = answer.body?.getReader()
  if (!reader) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > most) {
      await reader.cancel().catch(() => undefined)
      throw new Unrunnable(`${what} is larger than ${Math.round(most / 1_048_576)} MB, and is not read.`)
    }
    parts.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

/** The JSON of an answer, read up to a size. Throws `Unrunnable` for one that is larger, or that is no JSON. */
export async function boundedJson(answer: Response, most: number, what: string): Promise<unknown> {
  const text = new TextDecoder().decode(await boundedBytes(answer, most, what))
  try {
    return JSON.parse(text)
  } catch {
    throw new Unrunnable(`${what} came with status ${answer.status} and no answer of its own.`)
  }
}
