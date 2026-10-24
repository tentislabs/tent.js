import type { Finding } from '../../core/index.ts'
import { kid, nameOf, walk } from '../../build/index.ts'
import { definitionNamed } from '../named.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isView } from '../tags.ts'

/** The kinds of definition that are called through the door, each with how a screen uses one. */
const fixes: Record<string, string> = {
  query: 'Read it as an entry of `data`, `read(NAME, input)`, or with `useQuery(NAME, input)`.',
  change: 'Call it by a press, `call={NAME}`, by a `Form`, or with `useCall(NAME)`.',
  action: 'Call it by a press, `call={NAME}`, with `useCall(NAME)`, or read it as an entry of `data`.',
}

/** A screen file that calls a function directly: in the browser it is a record with a name, and no function. */
export const rule: Rule = {
  code: 'T6008',
  needs: ['source'],
  run: ({ source }) => {
    const found: Finding[] = []
    const views = writtenIn(source).filter(isView)
    for (const path of new Set(views.map((one) => one.path))) {
      const tree = source[path].tree
      const here = views.filter((one) => one.path === path)
      if (!tree) continue
      walk(tree, (node) => {
        const name = node.type === 'CallExpression' ? nameOf(kid(node, 'callee')) : undefined
        const called = name === undefined ? undefined : definitionNamed(source, path, name)
        if (name === undefined || !called || !Object.hasOwn(fixes, called.word)) return
        // The finding stands at the view that holds the call, and at the first one of the file for a call outside any.
        const holds = (one: (typeof here)[number]): boolean =>
          one.declared.statement.start <= node.start && node.end <= one.declared.statement.end
        found.push(
          at(
            'T6008',
            here.find(holds) ?? here[0],
            node,
            `the screen file calls the ${called.word} \`${name}\` directly. A screen holds a definition of the backend by its name alone, and reaches it through the door.`,
            fixes[called.word].replaceAll('NAME', name),
          ),
        )
      })
    }
    return found
  },
}
