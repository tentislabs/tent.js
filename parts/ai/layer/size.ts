import type { ReplyRequest } from '../face.ts'

// The rule by which the model layer counts what a server did not: a token for every 3 bytes, 1,500 for an image.
const perToken = 3
const perImage = 1500

/** The tokens of a text by the rule: one for every 3 bytes of it as UTF-8. */
export const tokensOf = (text: string): number => Math.ceil(Buffer.byteLength(text, 'utf8') / perToken)

/** The tokens of a request by the rule: its instructions, its messages, its tools and its shape, and its images. */
export function sizeByRule(request: Omit<ReplyRequest, 'fetch' | 'signal' | 'model'>): number {
  let text = request.instructions ?? ''
  let images = 0
  for (const message of request.messages) {
    text += message.text ?? ''
    if (message.calls?.length) text += JSON.stringify(message.calls)
    if (message.result !== undefined) text += JSON.stringify(message.result)
    text += message.error ?? ''
    images += message.images?.length ?? 0
  }
  for (const tool of request.tools ?? []) text += tool.name + tool.about + JSON.stringify(tool.input)
  if (request.shape) text += JSON.stringify(request.shape)
  return tokensOf(text) + images * perImage
}
