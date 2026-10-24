import type { Node, Source } from '../build/index.ts'
import { child, kid, kids, nameOf, propertyOf, unwrap, walk, word } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import type { Written } from './rule.ts'
import { arrowOf, at, writtenIn } from './rule.ts'
import { statedAt } from './stated.ts'
import { literalOf, tagsOf } from './tags.ts'

// What lives in the browser, which a component that is drawn on the server alone cannot hold: a state that a press
// sets, an element that code holds, an event handler, and a `Form`, which answers a person.
const living = (name: string): boolean => name === 'set' || name === 'ref' || /^on[A-Z]/.test(name)

const why = 'a component that is drawn on the server alone never lives in the browser'
const fix = 'Draw it in the browser, by taking `browser: false` away, or give what lives to it as a child.'

/** Whether a definition is a component that states `browser: false`. */
function isServed(written: Written): boolean {
  if (written.word !== 'component') return false
  const stated = literalOf(statedAt(written, ['browser']))
  return stated.known && stated.value === false
}

/** The names that a file gives by `export`, each with the node that gives it. */
function exportsOf(tree: Node): [string, Node][] {
  const found: [string, Node][] = []
  for (const statement of kids(tree, 'body')) {
    if (statement.type === 'ExportDefaultDeclaration') found.push(['default', statement])
    if (statement.type !== 'ExportNamedDeclaration') continue
    const declared = child(statement, 'declaration')
    if (declared?.type === 'VariableDeclaration')
      for (const one of kids(declared, 'declarations')) found.push([nameOf(kid(one, 'id')) ?? '', one])
    else if (declared !== undefined) found.push([nameOf(kid(declared, 'id')) ?? '', declared])
    for (const one of kids(statement, 'specifiers')) found.push([word(kid(one, 'exported'), 'name') ?? '', one])
  }
  return found
}

/**
 * Takes the files of a project. Answers T6018 for what lives in the browser inside a component that is drawn on
 * the server alone: a `state` of its own, a `Form`, a property that a press or a state needs, an event handler, a
 * hook, `useField` among them; and for any other export of the file of such a component.
 */
export function servedFindings(source: Source): Finding[] {
  const served = writtenIn(source).filter(isServed)
  const found: Finding[] = []
  for (const written of served) {
    const state = propertyOf(written.declared.options, 'state')
    if (state) found.push(at('T6018', written, state, `\`state\` in \`${written.name}\`: ${why}.`, fix))
    const view = arrowOf(written, 'view')
    if (view)
      walk(view, (node) => {
        const callee = node.type === 'CallExpression' ? unwrap(kid(node, 'callee') ?? node) : undefined
        const name = callee?.type === 'Identifier' ? word(callee, 'name') : undefined
        if (name !== undefined && /^use[A-Z]/.test(name))
          found.push(at('T6018', written, node, `the hook \`${name}\` in \`${written.name}\`: ${why}.`, fix))
      })
  }
  for (const tag of tagsOf(source)) {
    if (!served.includes(tag.written)) continue
    // A `Form` answers a person: it is told once, and not again for what it is given.
    if (tag.taken === 'Form') {
      found.push(at('T6018', tag.written, tag.node, `a \`Form\` in \`${tag.written.name}\`: ${why}.`, fix))
      continue
    }
    for (const [name, prop] of tag.props)
      if (living(name))
        found.push(at('T6018', tag.written, prop.node, `\`${name}\` in \`${tag.written.name}\`: ${why}.`, fix))
  }
  // The file of such a component is answered in a browser with a made text that gives its components alone.
  for (const path of new Set(served.map((one) => one.path))) {
    const tree = source[path].tree
    const own = new Set(served.filter((one) => one.path === path).map((one) => one.declared.exportName))
    const first = served.find((one) => one.path === path)
    if (!tree || !first) continue
    for (const [name, node] of exportsOf(tree))
      if (!own.has(name))
        found.push(
          at(
            'T6018',
            first,
            node,
            `\`${name}\` is given by the file of a component that is drawn on the server alone, which a browser never loads.`,
            'Give it from another file.',
          ),
        )
  }
  return found
}
