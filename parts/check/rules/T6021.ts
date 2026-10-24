import type { Node } from '../../build/index.ts'
import { child, keyOf, kid, kids, nameOf, walk } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isView, literalOf } from '../tags.ts'
import { isStored } from '../../core/internal.ts'

const says = "the format 'currency' shows money in the currency of the project, and the project states none."
const fix =
  "State `currency` in `project`, as `currency: 'USD'`, or name one here: `{ as: 'currency', currency: 'USD' }`."

/** Whether a format written in place asks for the currency of the project: one that names its own needs none. */
const asks = (value: unknown): boolean =>
  value === 'currency' || (isStored(value) && value.as === 'currency' && value.currency === undefined)

/**
 * The calls of `format` of `useTranslations` in a file: through the name that a taking apart of
 * `useTranslations()` gives it, and as a member of what `useTranslations()` answers.
 */
function formatCalls(tree: Node, hook: string): Node[] {
  const taken = new Set<string>()
  const whole = new Set<string>()
  walk(tree, (node) => {
    const init = node.type === 'VariableDeclarator' ? kid(node, 'init') : undefined
    if (init?.type !== 'CallExpression' || nameOf(kid(init, 'callee')) !== hook) return
    const id = child(node, 'id')
    if (id.type === 'Identifier' && typeof id.name === 'string') whole.add(id.name)
    if (id.type === 'ObjectPattern')
      for (const one of kids(id, 'properties')) {
        const value = kid(one, 'value')
        if (keyOf(one) === 'format' && value?.type === 'Identifier' && typeof value.name === 'string')
          taken.add(value.name)
      }
  })
  const found: Node[] = []
  walk(tree, (node) => {
    if (node.type !== 'CallExpression') return
    const callee = child(node, 'callee')
    const object = callee.type === 'MemberExpression' ? kid(callee, 'object') : undefined
    const named =
      callee.type === 'Identifier'
        ? taken.has(String(callee.name))
        : object?.type === 'Identifier' &&
          whole.has(String(object.name)) &&
          nameOf(kid(callee, 'property')) === 'format'
    if (named) found.push(node)
  })
  return found
}

/** `'currency'` handed to `format` of `useTranslations` in place, in a project that states no `currency`. */
export const rule: Rule = {
  code: 'T6021',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    if (typeof description.project.currency === 'string') return []
    const found: Finding[] = []
    const views = writtenIn(source).filter(isView)
    for (const path of new Set(views.map((one) => one.path))) {
      const tree = source[path].tree
      const here = views.filter((one) => one.path === path)
      const hook = [...here[0].words].find(([, name]) => name === 'useTranslations')?.[0]
      if (!tree || hook === undefined) continue
      // The finding stands at the view that holds the call, and at the first one of the file for a call outside any.
      const holding = (node: Node): Written =>
        here.find((one) => one.declared.statement.start <= node.start && node.end <= one.declared.statement.end) ??
        here[0]
      for (const call of formatCalls(tree, hook)) {
        const [, shown] = kids(call, 'arguments')
        const format = literalOf(shown)
        if (format.known && asks(format.value)) found.push(at('T6021', holding(call), shown, says, fix))
      }
    }
    return found
  },
}
