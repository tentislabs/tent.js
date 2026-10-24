import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'

/** A picture or a sound that an answer of an outside tool holds: its bytes, and the kind it says it is. */
export interface Held {
  bytes: Uint8Array
  said: string
}

/** The text parts of an answer as one text: a text as it is, and a link as its address in words, never fetched. */
function textOf(parts: unknown[]): string {
  return parts
    .flatMap((part) => {
      if (!isStored(part)) return []
      if (part.type === 'text' && typeof part.text === 'string') return [part.text]
      if (part.type === 'resource_link' && typeof part.uri === 'string')
        return [`${typeof part.name === 'string' ? part.name : 'A link'}: ${part.uri}`]
      const resource = isStored(part.resource) ? part.resource : undefined
      if (part.type === 'resource' && resource && typeof resource.text === 'string') return [resource.text]
      return []
    })
    .join('\n')
}

/**
 * Takes the result of a call of an outside tool. Answers what reaches the model: the tool's typed answer where it
 * gives one, and its text otherwise; with every picture and sound it holds. A result marked as an error is the
 * tool's own words, meant for the model, as T7115.
 */
export function outsideAnswer(result: Record<string, unknown>): { value: unknown; held: Held[] } {
  const parts = Array.isArray(result.content) ? result.content : []
  if (result.isError === true)
    throw new TentError('T7115', textOf(parts) || 'The tool failed, and said nothing of why.', {
      service: { body: result },
    })
  const held: Held[] = []
  for (const part of parts)
    if (isStored(part) && (part.type === 'image' || part.type === 'audio') && typeof part.data === 'string')
      held.push({ bytes: new Uint8Array(Buffer.from(part.data, 'base64')), said: String(part.mimeType ?? '') })
  const value = isStored(result.structuredContent) ? result.structuredContent : textOf(parts)
  return { value, held }
}
