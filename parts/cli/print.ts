import { safe } from '../connect/index.ts'
import type { Finding } from '../core/index.ts'
import { isStored } from '../core/internal.ts'

/** Writes one finding as text: its level, its code, its place and its definition, then its sentence, its fix and its page. */
export function findingText(found: Finding): string {
  const place = found.where ? `  ${found.where.file}:${found.where.line}` : ''
  const definition = found.where?.definition !== undefined ? `  ${found.where.definition}` : ''
  const lines = [`${found.level} ${found.code}${place}${definition}`, `  ${found.message}`]
  if (found.fix !== undefined) lines.push(`  fix: ${found.fix}`)
  lines.push(`  more: ${found.docs}`)
  // A message may hold what a user of the app wrote: no control character of it reaches the terminal.
  return safe(lines.join('\n'))
}

// The text that a command gave beside what it answers: with `--json` the answer is printed, and else this text.
const asText = Symbol('the text of an answer')

/** Takes what a command answers, and its text. Answers the same thing, which is printed as that text where no `--json` was typed. */
export function withText<Answer extends object>(answer: Answer, text: string): Answer {
  Object.defineProperty(answer, asText, { value: text, enumerable: false })
  return answer
}

/**
 * Writes what a command answered as text: the text it gave where it gave one, a text as it is, a list one entry to
 * a line, and a record one field to a line. Every control character but a line feed and a tab is written as its code.
 */
export function valueText(value: unknown, indent = ''): string {
  if (value === undefined || value === null) return ''
  const given: unknown = typeof value === 'object' ? Reflect.get(value, asText) : undefined
  if (typeof given === 'string') return safe(given)
  if (Array.isArray(value)) return value.map((one) => valueText(one, indent)).join('\n')
  if (!isStored(value)) return `${indent}${safe(String(value).replace(/\n$/, ''))}`
  return Object.entries(value)
    .map(([name, one]) =>
      typeof one === 'object' && one !== null
        ? `${indent}${safe(name)}:${Object.keys(one).length ? `\n${valueText(one, `${indent}  `)}` : ''}`
        : `${indent}${safe(name)}: ${safe(String(one))}`,
    )
    .join('\n')
}
