import { fingerprintOf } from '../../core/internal.ts'
import type { History } from '../../history/index.ts'
import type { Impact } from './face.ts'

// What stands in front of the fingerprint of an impact in the note of the point it was published with.
const lead = 'impact '

/**
 * Keeps the impact of a publish with the point that was published: the impact as a blob of the history, and its
 * fingerprint in the note of the point, which is what this computer found of it and no part of its id.
 */
export function keepImpact(history: History, point: string, impact: Impact): void {
  const bytes = new TextEncoder().encode(JSON.stringify(impact))
  const print = fingerprintOf(bytes)
  history.take({ blobs: { [print]: bytes } })
  const note = history.read(point)?.note
  history.mark(point, { note: [note, `${lead}${print}`].filter((one) => one !== undefined).join('\n') })
}

/** The impact that was kept with a published point, or nothing for a point that keeps none. */
export function keptImpact(history: History, point: string): Impact | undefined {
  const line = (history.read(point)?.note ?? '').split('\n').find((one) => one.startsWith(lead))
  const bytes = line ? history.blob(line.slice(lead.length)) : undefined
  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined
}
