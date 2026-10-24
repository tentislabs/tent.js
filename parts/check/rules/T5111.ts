import type { Node } from '../../build/index.ts'
import { child, keyOf, kids, lineOf, nameOf, scan, unwrap, walk } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { writtenIn } from '../rule.ts'

/** One emit of an event by its name, with the shape of its data: the names of its fields, in the order of their letters. */
interface Emitted {
  name: string
  shape: string
  path: string
  text: string
  node: Node
}

/**
 * The shape of data written in place: the names of its fields, in the order of their letters. Nothing for data of
 * which the text does not say each field, as one that is spread or worked out.
 */
function shapeOf(data: Node | undefined): string | undefined {
  const object = data ? unwrap(data) : undefined
  if (object?.type !== 'ObjectExpression') return undefined
  const names: string[] = []
  for (const one of kids(object, 'properties')) {
    const name = one.type === 'Property' ? keyOf(one) : undefined
    if (name === undefined) return undefined
    names.push(name)
  }
  return names.sort().join(', ')
}

/**
 * A warning: one event name emitted with data of two shapes, where no declaration of the event says which. Each
 * call of `emit` of tentjs with a name in text and data written in place is held against the first emit of that
 * name, in the order of the files; a name that a backend file declares with `event(name, { data })` is the type
 * checker's to hold.
 */
export const rule: Rule = {
  code: 'T5111',
  needs: ['source'],
  run: ({ source }) => {
    const declared = new Set<string>()
    const emitted: Emitted[] = []
    for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!file.tree) continue
      const seen = scan(file.tree)
      for (const one of seen.events) if (one.name !== undefined) declared.add(one.name)
      const emits = new Set(
        seen.imports.filter((one) => one.from === 'tentjs' && one.name === 'emit').map((one) => one.local),
      )
      walk(file.tree, (node) => {
        if (node.type !== 'CallExpression' || !emits.has(nameOf(child(node, 'callee')) ?? '')) return
        const [first, data] = kids(node, 'arguments')
        const shape = shapeOf(data)
        if (first?.type !== 'Literal' || typeof first.value !== 'string' || shape === undefined) return
        emitted.push({ name: first.value, shape, path, text: file.text, node })
      })
    }
    const written = writtenIn(source)
    const first = new Map<string, Emitted>()
    const found: Finding[] = []
    for (const one of emitted) {
      if (declared.has(one.name)) continue
      const before = first.get(one.name)
      if (!before) {
        first.set(one.name, one)
        continue
      }
      if (before.shape === one.shape) continue
      const line = lineOf(one.text, one.node.start)
      // The finding stands at the definition that holds the emit, where one does.
      const within = written.find(
        (at) =>
          at.path === one.path &&
          at.declared.statement.start <= one.node.start &&
          one.node.start <= at.declared.statement.end,
      )
      found.push(
        finding(
          'T5111',
          `${within ? `${within.name}: ` : ''}the event ${one.name} is emitted with the fields ${one.shape || 'none'}, and at ${before.path} line ${lineOf(before.text, before.node.start)} with ${before.shape || 'none'}.`,
          {
            fix: `Emit it with one shape, or declare it: \`export const ... = event('${one.name}', { data: object({ ... }) })\`, and the type checker holds each emit to it.`,
            where: { file: one.path, line, ...(within ? { definition: within.name } : {}) },
          },
          'warning',
        ),
      )
    }
    return found
  },
}
