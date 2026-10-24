import type { Finding } from '../../core/index.ts'
import { dataOf } from '../entries.ts'
import { definitionNamed } from '../named.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isView, literalOf } from '../tags.ts'

/** An entry of `data` that reads what is neither a query nor an action, or states what its kind cannot take. */
export const rule: Rule = {
  code: 'T6023',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const written of writtenIn(source).filter(isView))
      for (const entry of dataOf(written) ?? []) {
        const say = (message: string, fix: string): void =>
          void found.push(at('T6023', written, entry.node, `the entry \`${entry.name}\` of \`data\` ${message}`, fix))
        const read = entry.what === undefined ? undefined : definitionNamed(source, written.path, entry.what)
        if (read && read.word !== 'query' && read.word !== 'action') {
          say(
            `reads \`${read.name}\`, a ${read.word}, which is neither a query nor an action.`,
            'Read a query or an action. The rows of a table are read through a query over it.',
          )
          continue
        }
        const stated = new Map(entry.options ?? [])
        const isFalse = (name: string): boolean => {
          const value = literalOf(stated.get(name))
          return stated.has(name) && value.known && value.value === false
        }
        const stored =
          read && Object.hasOwn(description.functions, read.name) ? description.functions[read.name] : undefined
        const query = read?.word === 'query'
        if (query && isFalse('wait') && stored?.heavy !== true)
          say(
            'states `wait: false` on a query that answers at once: there is nothing to wait for.',
            'Take `wait: false` away. It is for an action and for a query that states `heavy`.',
          )
        if (query && stated.has('refresh'))
          say(
            'states `refresh` on a query: a query follows its rows by itself, and states its own.',
            'Take `refresh` away. It is for an action, which is asked again on its timer.',
          )
        if (written.word === 'component' && stated.has('needed') && !isFalse('needed'))
          say(
            'states `needed` in a component: only an entry of the screen itself decides whether the screen is found.',
            'Take `needed` away, or read the entry in the `data` of the screen.',
          )
      }
    return found
  },
}
