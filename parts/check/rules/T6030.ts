import type { Node } from '../../build/index.ts'
import { child, kid, nameOf, scan, unwrap, walk } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { stateEntries, isStored } from '../../core/internal.ts'
import { readsIn } from '../code.ts'
import { handedAs } from '../handed.ts'
import { viewOf } from '../ofViews.ts'
import { isPersonal } from '../personal.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import { tagsOf } from '../tags.ts'

/** The states of a view that are kept in the device: its own, and those of the project. */
function deviceStates(description: Description, stored: Record<string, unknown>): Set<string> {
  return new Set(
    Object.entries({ ...stateEntries(description.project.state), ...stateEntries(stored.state) })
      .filter(([, entry]) => entry.in === 'device')
      .map(([name]) => name),
  )
}

/** Every read of a name in a piece of code, by the name read: an identifier that is no member's name after a dot. */
function namesRead(code: Node): Map<string, Node> {
  const after = new Set<Node>()
  walk(code, (node) => {
    if (node.type === 'MemberExpression' && node.computed !== true) after.add(child(node, 'property'))
  })
  const read = new Map<string, Node>()
  walk(code, (node) => {
    const name = node.type === 'Identifier' && !after.has(node) ? nameOf(node) : undefined
    if (name !== undefined && !read.has(name)) read.set(name, node)
  })
  for (const one of readsIn(code)) if (!read.has(one.name)) read.set(one.name, one.node)
  return read
}

/**
 * What a view reads of the visitor, each at the first place it stands: the `user` it is handed, a state kept in the
 * device, and a call of `useUser`.
 */
function readsOfVisitor(written: Written, device: Set<string>): [string, Node][] {
  const view = statedAt(written, ['view'])
  const body = view ? kid(view, 'body') : undefined
  if (!view || !body) return []
  const read = namesRead(body)
  const found: [string, Node][] = []
  const user = handedAs(view, 'user')
  const userAt = user === undefined ? undefined : read.get(user)
  if (userAt) found.push(['reads `user`', userAt])
  const state = handedAs(view, 'state')
  const kept = state === undefined ? undefined : [...device].find((name) => read.has(`${state}.${name}`))
  const keptAt = kept === undefined ? undefined : read.get(`${state}.${kept}`)
  if (kept !== undefined && keptAt) found.push([`reads \`${kept}\`, a state kept in the device`, keptAt])
  const hook = written.tree
    ? scan(written.tree).imports.find((one) => one.from === 'tentjs/ui' && one.name === 'useUser')?.local
    : undefined
  let called: Node | undefined
  if (hook !== undefined)
    walk(body, (node) => {
      if (!called && node.type === 'CallExpression' && nameOf(unwrap(child(node, 'callee'))) === hook) called = node
    })
  if (called) found.push(['calls `useUser`', called])
  return found
}

/**
 * A screen whose `cache` states `public`, whose view, or a component it uses that is no personal part, reads `user`
 * or a state kept in the device, or calls `useUser`: a cache outside the engine would hand every visitor the copy
 * drawn for nobody. A personal part states `personal: true`, or reads what is not open to anyone. A warning.
 */
export const rule: Rule = {
  code: 'T6030',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenIn(source)
    const components = new Map(
      written.filter((one) => one.word === 'component').map((one) => [one.declared.exportName, one] as const),
    )
    const tags = tagsOf(source)
    for (const screen of written.filter((one) => one.word === 'screen')) {
      const view = viewOf(description, screen)
      if (!isStored(view.cache) || view.cache.public !== true) continue
      // The screen's own view, and each component it uses, through the components they use, but for a personal part.
      const seen = new Set<Written>([screen])
      const open = [screen]
      for (const one of open)
        for (const tag of tags.filter((each) => each.written === one)) {
          const used = components.get(tag.name)
          if (!used || seen.has(used) || isPersonal(viewOf(description, used), description.functions)) continue
          seen.add(used)
          open.push(used)
        }
      for (const one of open)
        for (const [what, node] of readsOfVisitor(one, deviceStates(description, viewOf(description, one))))
          found.push(
            at(
              'T6030',
              screen,
              one === screen ? node : undefined,
              `the screen is kept as \`public\`, and ${one === screen ? 'its view' : `the component \`${one.name}\` it uses`} ${what}: a cache outside the engine would hand every visitor the copy drawn for nobody.`,
              'Take `public` away from `cache`, read neither the user nor a state kept in the device, or make the part that does a personal part with `personal: true`.',
              'warning',
            ),
          )
    }
    return found
  },
}
