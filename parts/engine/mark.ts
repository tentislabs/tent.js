import { fingerprintOf } from '../core/internal.ts'

const encoder = new TextEncoder()

/**
 * Takes a value as it is sent, written as JSON, or nothing for a value that is not there. Answers its mark: the
 * first 16 characters of its fingerprint, by which a page says which answer it holds.
 */
export const answerMark = (text: string | undefined): string =>
  fingerprintOf(encoder.encode(text ?? 'null')).slice(0, 16)
