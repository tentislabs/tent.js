import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import type { ImpactLine } from './face.ts'
import type { Stored } from './read.ts'
import { doorOf, doorsOf, fileOf, kindOf, rankOf, recordsOf, whoOf } from './read.ts'

// What each rule of a table lets a caller do, in the word of the finding.
const verbs: [string, string][] = [
  ['read', 'readable'],
  ['add', 'addable'],
  ['change', 'changeable'],
  ['remove', 'removable'],
]

/** Whether the pages of a screen are kept in the cache as public. */
const cachedAsPublic = (screen: Stored | undefined): boolean =>
  isStored(screen?.cache) && Reflect.get(screen.cache, 'public') === true

/** The functions an agent offers as tools. */
function toolsOf(record: Stored | undefined): string[] {
  const agent = isStored(record?.agent) ? record.agent : undefined
  const tools = Array.isArray(agent?.tools) ? agent.tools : []
  return tools.map((one) => (isStored(one) ? String(one.tool) : String(one)))
}

/**
 * Takes the description that runs and the one that would follow it. Answers every definition that someone may
 * now reach who could not before, each with who that is, in words: a function, a flow, a route or a screen that
 * is new or whose rule was widened, a function newly offered to a door or as a tool of an agent, a rule of a
 * table that was widened, and a screen now kept in the cache as public.
 */
export function widerRights(live: Description, next: Description): ImpactLine[] {
  const found: ImpactLine[] = []
  const add = (name: string, changes: string[]): void => {
    if (changes.length)
      found.push({ name, kind: kindOf(next, name), file: fileOf(next, name), change: changes.join('; ') })
  }
  for (const part of ['functions', 'flows', 'routes']) {
    const [was, is] = [recordsOf(live, part), recordsOf(next, part)]
    for (const [name, record] of Object.entries(is)) {
      const before = was[name]
      const changes: string[] = []
      if (rankOf(record.access) < 3 && (!before || rankOf(record.access) < rankOf(before.access)))
        changes.push(`now callable by ${whoOf(record.access)}`)
      for (const door of doorsOf(record))
        if (!doorsOf(before).includes(door)) changes.push(`now offered to ${doorOf(door)}`)
      add(name, changes)
    }
    // A function that an agent now offers as a tool, which it did not before.
    for (const [agent, record] of Object.entries(is)) {
      const before = toolsOf(was[agent])
      for (const tool of toolsOf(record))
        if (!before.includes(tool) && was[agent]) add(tool, [`now a tool of ${agent}`])
    }
  }
  const [tablesWas, tablesIs] = [recordsOf(live, 'tables'), recordsOf(next, 'tables')]
  for (const [name, record] of Object.entries(tablesIs)) {
    const before = tablesWas[name]
    if (!before) continue
    const [rules, ruled] = [isStored(record.access) ? record.access : {}, isStored(before.access) ? before.access : {}]
    add(
      name,
      verbs.flatMap(([rule, verb]) =>
        rankOf(rules[rule]) < rankOf(ruled[rule]) ? [`now ${verb} by ${whoOf(rules[rule])}`] : [],
      ),
    )
  }
  const [screensWas, screensIs] = [recordsOf(live, 'screens'), recordsOf(next, 'screens')]
  for (const [name, record] of Object.entries(screensIs)) {
    // A screen that is new is reached by whoever its rule lets in, as one that was widened.
    const before = screensWas[name]
    const changes: string[] = []
    if (rankOf(record.access) < 3 && (!before || rankOf(record.access) < rankOf(before.access)))
      changes.push(`now open to ${whoOf(record.access)}`)
    if (cachedAsPublic(record) && !cachedAsPublic(before)) changes.push('now cached as public')
    add(name, changes)
  }
  return found
}
