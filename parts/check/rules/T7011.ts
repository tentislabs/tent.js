import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { callsIn, recordOf, isStored } from '../../core/internal.ts'

/** Whether a stored value holds a `vector`, as a type record or as a call of the word that makes one. */
function holdsVector(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(holdsVector)
  if (!isStored(node)) return false
  if (node.kind === 'vector') return true
  const call = isStored(node.call) ? node.call : undefined
  if (call && (call.word === 'vector' || call.builtin === 'vector' || call.type === 'vector')) return true
  return Object.values(node).some(holdsVector)
}

/** A `vector` in the shape given to `fill`, where the check can see it: a model answers no vector by writing. */
export const rule: Rule = {
  code: 'T7011',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const written of writtenIn(source)) {
      const record = recordOf(description, written.name)
      if (!record) continue
      for (const call of callsIn([record.body, record.onFail]))
        if (call.kind === 'model' && call.member === 'fill' && holdsVector(call.args[0]))
          found.push(
            at(
              'T7011',
              written,
              undefined,
              `the shape that \`${call.name}.fill\` is handed holds a \`vector\`, which no model answers by writing.`,
              'Take the vector out of the shape, and make it with `embed` of a model that embeds.',
            ),
          )
    }
    return found
  },
}
