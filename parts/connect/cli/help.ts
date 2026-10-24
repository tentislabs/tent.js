import { flagOf } from './flags.ts'
import type { CommandList } from './listed.ts'
import { safe } from './printed.ts'

/** A type in a few words: its kind, and the kind of its entries for a list, or the values of a choice. */
function typeWords(type: unknown): string {
  const kind = String(Reflect.get(Object(type), 'kind'))
  if (kind === 'list') return `list of ${typeWords(Reflect.get(Object(type), 'of'))}`
  const values: unknown = Reflect.get(Object(type), 'values')
  if (kind === 'choice' && Array.isArray(values)) return `one of ${values.map(String).join(', ')}`
  return kind
}

/** The help of the app's command: one line for each command, its word and its `about`. */
export function appHelp(list: CommandList): string {
  const words = Object.keys(list.commands)
  const wide = Math.max(0, ...words.map((one) => one.length))
  const lines = words.map((word) => `  ${word.padEnd(wide)}  ${list.commands[word].about ?? ''}`.trimEnd())
  return safe(`${list.name} <command> [flags]\n\n${lines.join('\n')}\n`)
}

/**
 * The help of one command: its `about`, and one line for each flag, with its name, its type, whether it is needed,
 * its default, and its `label` and `help`.
 */
export function commandHelp(list: CommandList, word: string): string {
  const entry = list.commands[word]
  const lines = Object.entries(entry.input).map(([field, type]) => {
    const record: Record<string, unknown> = Object(type)
    const needed = record.optional === true || record.default !== undefined ? 'optional' : 'needed'
    const fallback = record.default === undefined ? '' : `  default ${JSON.stringify(record.default)}`
    const words = [record.label, record.help].filter((one) => typeof one === 'string').join(': ')
    return `  --${flagOf(field)}  ${typeWords(type)}  ${needed}${fallback}${words ? `  ${words}` : ''}`
  })
  const about = entry.about ? `${entry.about}\n\n` : ''
  return safe(`${list.name} ${word} [flags]\n\n${about}${lines.join('\n')}\n`)
}
