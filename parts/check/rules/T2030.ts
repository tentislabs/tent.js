import type { Finding } from '../../core/index.ts'
import { writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'

/**
 * `heavy` on a query of a table kept in memory: its rows live on the writer's main thread, and the query runs there
 * whatever it states. A note at the query.
 */
export const rule: Rule = {
  code: 'T2030',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const [name, record] of Object.entries(description.functions)) {
      if (record.kind !== 'query' || record.heavy !== true || !Array.isArray(record.reads)) continue
      const kept = record.reads.map(String).filter((table) => description.tables[table]?.kept === 'memory')
      const place = written.get(name)
      if (!kept.length || !place) continue
      found.push(
        at(
          'T2030',
          place,
          undefined,
          `\`heavy\` moves nothing: it reads \`${kept.join('`, `')}\`, kept in memory, whose rows live on the writer's main thread, where it runs.`,
          'Take `heavy` out of the query.',
          'note',
        ),
      )
    }
    return found
  },
}
