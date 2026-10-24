import { callsIn } from '../code.ts'
import type { Rule } from '../rule.ts'
import { arrowOf, at, inside, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** A query reaches the network: `fetch`, a call of a service, or a call of a model. */
export const rule: Rule = {
  code: 'T4003',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'query')
      .flatMap((query) => {
        const say = (what: string, node?: Parameters<typeof at>[2]) =>
          at(
            'T4003',
            query,
            node,
            `the query reaches the network: ${what}. A query reads through \`db\` and nothing else.`,
            'Reach out in an action, and keep what it answered in a table that the query reads.',
          )
        const stored = description.functions[query.name]
        const reached: string[] = []
        inside(stored?.body, (record) => {
          const call = isStored(record.call) ? record.call : {}
          if (typeof call.service === 'string') reached.push(`a call of the service \`${call.service}\``)
          else if (typeof call.model === 'string') reached.push(`a call of the model \`${call.model}\``)
        })
        if (reached.length) return reached.map((what) => say(what))
        const run = stored?.form === 'code' ? arrowOf(query, 'run') : undefined
        const outside = (name: string): string | undefined => {
          const [first] = name.split('.')
          if (name === 'fetch' || name === 'globalThis.fetch') return '`fetch`'
          if (Object.hasOwn(description.services, first)) return `a call of the service \`${first}\``
          return Object.hasOwn(description.models, first) ? `a call of the model \`${first}\`` : undefined
        }
        return (run ? callsIn(run) : []).flatMap((call) => {
          const what = outside(call.name)
          return what === undefined ? [] : [say(what, call.node)]
        })
      }),
}
