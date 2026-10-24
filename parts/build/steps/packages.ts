import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import { packageOf } from '../packageOf.ts'
import { namedFile } from '../source.ts'
import type { Node } from '../tree.ts'
import { child, walk, word } from '../tree.ts'
import type { SourceFile, Step, Work } from '../work.ts'

// What each statement reads and draws, worked out once for its tree: a file whose text is the same is the same tree.
const namesOf = new WeakMap<Node, Names>()

/** What a statement reads: names, the members it reads of a name, and the names it draws as a tag. */
interface Names {
  read: Set<string>
  members: Set<string>
  drawn: Set<string>
}

/**
 * Every name that a statement reads, each member it reads of a name as `helper.stop`, and every name it draws as a
 * tag, the first part of `Table.Td` among them.
 */
function namesIn(statement: Node): Names {
  const held = namesOf.get(statement)
  if (held) return held
  const made = namesWalked(statement)
  namesOf.set(statement, made)
  return made
}

/** Walks a statement for what `namesIn` answers. */
function namesWalked(statement: Node): Names {
  const read = new Set<string>()
  const members = new Set<string>()
  const drawn = new Set<string>()
  walk(statement, (node) => {
    if ((node.type === 'MemberExpression' || node.type === 'StaticMemberExpression') && node.computed !== true) {
      const owner = child(node, 'object')
      const named =
        owner.type === 'Identifier' || owner.type === 'IdentifierReference' ? word(owner, 'name') : undefined
      const member = word(child(node, 'property'), 'name')
      if (named !== undefined && member !== undefined) members.add(`${named}.${member}`)
    }
    if (node.type === 'Identifier' || node.type === 'IdentifierReference') {
      const name = word(node, 'name')
      if (name !== undefined) read.add(name)
    }
    if (node.type !== 'JSXOpeningElement') return
    let tag = child(node, 'name')
    while (tag.type === 'JSXMemberExpression') tag = child(tag, 'object')
    const name = tag.type === 'JSXIdentifier' ? word(tag, 'name') : undefined
    if (name !== undefined) {
      drawn.add(name)
      read.add(name)
    }
  })
  return { read, members, drawn }
}

/** The definition that a backend file gives under an export name, by its own name. */
function definedAs(work: Work, from: SourceFile, named: string, exportName: string): string | undefined {
  const lies = namedFile(from.file, named)
  const file = [...work.files.values()].find((one) => one.file === lies)
  if (file?.sort !== 'backend') return undefined
  return file.seen?.declared.find((one) => one.exportName === exportName)?.name
}

/** What uses a package, as the description names it: a screen or a component by its name, and any other file by its path. */
function usersOf(work: Work, description: Description): Map<string, Set<string>> {
  const users = new Map<string, Set<string>>()
  const add = (name: string, by: string): void => void users.set(name, new Set([...(users.get(name) ?? []), by]))
  for (const file of work.files.values()) {
    const seen = file.seen
    if (!seen) continue
    const views = seen.declared.filter((one) => one.word === 'screen' || one.word === 'component')
    for (const { from } of seen.named) {
      const name = packageOf(from)
      if (name === undefined) continue
      // In a screen file a package is used by each view that reads what it gives, and by every view of the file
      // where the file imports it for what it does alone, as a stylesheet.
      const locals = seen.imports.filter((one) => one.from === from).map((one) => one.local)
      const using = views.filter(
        (one) => !locals.length || locals.some((local) => namesIn(one.statement).read.has(local)),
      )
      if (file.sort === 'screen' && using.length)
        for (const one of using) {
          const named = one.name ?? one.exportName
          add(name, `${Object.hasOwn(description.screens, named) ? 'screen' : 'component'}:${named}`)
        }
      else add(name, `${file.sort === 'backend' ? 'backend' : 'file'}:${file.path}`)
    }
  }
  return users
}

/**
 * Writes into the description each package that the project imports, with who uses it and whether it reaches a
 * browser, and of each screen and component the functions it calls; and keeps of each the components of packages
 * it draws, which the build answers beside the description.
 * The bytes of a package in the page and its ways out are written where the screens and the code are built.
 */
export const step: Step = {
  order: 4.7,
  run: async (work) => {
    const description = work.description
    if (!description) return
    const packages: Record<string, Record<string, unknown>> = {}
    for (const [name, by] of usersOf(work, description)) {
      const all = [...by].sort()
      // A package that a screen, a component or a file beside them draws with is built into a module of the browser.
      const browser = all.some((one) => !one.startsWith('backend:'))
      const out = work.outs?.[name]
      packages[name] = { by: all, browser, ...(out?.length ? { out } : {}) }
    }
    if (Object.keys(packages).length) description.packages = packages
    const views: Record<string, Record<string, unknown>> = {}
    for (const file of work.files.values()) {
      if (file.sort !== 'screen' || !file.seen) continue
      for (const one of file.seen.declared) {
        const named = one.name ?? one.exportName
        if (!Object.hasOwn(description.screens, named) && !Object.hasOwn(description.components, named)) continue
        const { read, members, drawn } = namesIn(one.statement)
        const drawnOf: Record<string, string> = {}
        const calls = new Set<string>()
        for (const taken of file.seen.imports) {
          const outside = packageOf(taken.from)
          if (outside !== undefined && drawn.has(taken.local)) drawnOf[taken.local] = outside
          if (outside !== undefined || !read.has(taken.local) || !taken.from.startsWith('.')) continue
          const defined = definedAs(work, file, taken.from, taken.name)
          const kind = defined === undefined ? undefined : Object(description.functions[defined]).kind
          if (defined !== undefined && (kind === 'change' || kind === 'action')) calls.add(defined)
          // A member of an agent, and `working` of a flow, is called by its owner's name and its own.
          const flow: unknown = defined === undefined ? undefined : description.flows[defined]
          const owned = isStored(flow)
            ? flow.agent !== undefined
              ? ['working', 'approve', 'refuse', 'stop']
              : ['working']
            : []
          for (const member of owned) if (members.has(`${taken.local}.${member}`)) calls.add(`${defined}.${member}`)
        }
        if (Object.keys(drawnOf).length) views[named] = { packages: drawnOf }
        // What a view calls is kept with its record, where the engine reads it for an export.
        const stored: unknown = description.screens[named] ?? description.components[named]
        if (calls.size && isStored(stored)) stored.calls = [...calls].sort()
      }
    }
    work.drawn = views
  },
}
