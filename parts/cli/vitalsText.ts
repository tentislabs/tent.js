import { fieldsOf } from './answerShapes.ts'

/** A value of a measure as a person reads it: a time in milliseconds, and the shift of the layout as it is. */
const shown = (measure: string, value: number): string =>
  measure === 'cls' ? String(value) : `${Math.round(value)} ms`

/**
 * The speed visitors saw, as text: for each screen and version, the screens furthest past their line first, a line
 * of each measure with its 75th share, the line of good, and the same of the version before. Takes each screen in
 * one version as `tent logs --vitals` is answered it: `{ screen, version, before?, measures }`.
 */
export function vitalsText(ranked: unknown[]): string {
  const lines: string[] = []
  for (const one of ranked.map(fieldsOf)) {
    const before = typeof one.before === 'string' ? `  (before: ${one.before})` : ''
    lines.push(`${String(one.screen)}  ${String(one.version)}${before}`)
    for (const [measure, held] of Object.entries(fieldsOf(one.measures))) {
      const at = fieldsOf(held)
      const [p75, good, count] = [Number(at.p75), Number(at.good), Number(at.count)]
      const past = p75 > good ? '  past the line' : ''
      const was = typeof at.before === 'number' ? `, was ${shown(measure, at.before)}` : ''
      lines.push(`  ${measure} ${shown(measure, p75)} of ${count}, good ${shown(measure, good)}${was}${past}`)
    }
  }
  return lines.length ? lines.join('\n') : 'No page view was measured in the last day.'
}
