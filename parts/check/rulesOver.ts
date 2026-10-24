import type { Node, Source } from '../build/index.ts'
import { keeping } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import type { Rule } from './rule.ts'
import { list } from './rules/list.ts'

// What a rule that reads one file found of each file, by the rule and the file, with the tree it was read from: the
// tree of a text that did not change is the same tree, through a session of development.
const found = keeping<{ tree: Node; findings: Finding[] }>()

// The source of each file alone, once for its tree, so that what the rules read of a source is read once.
const alone = new WeakMap<Node, Source>()

/** What a rule that reads one file at a time finds, file by file in their order, each file read again only where it changed. */
function byFile(rule: Rule, o: { description: Description; source: Source }): Finding[] {
  return Object.keys(o.source)
    .sort()
    .flatMap((path) => {
      const file = o.source[path]
      const tree = file.tree
      if (!tree) return rule.run({ description: o.description, source: { [path]: file } })
      const key = `${rule.code}\n${path}`
      const held = found.get(key)
      if (held?.tree === tree) return held.findings
      const source = alone.get(tree) ?? { [path]: file }
      alone.set(tree, source)
      const findings = rule.run({ description: o.description, source })
      found.set(key, { tree, findings })
      return findings
    })
}

/** Loads every rule of our own, once for the program, and answers them in the order of their list. */
export const rulesLoaded = (): Promise<{ rule: Rule }[]> => Promise.all(list.map((one) => one.load()))

/**
 * Takes a description and the source it was made of, as a build that just ran read them, and with them the facts
 * of the running app where a caller has them. Carries out every rule of our own, but for one over the facts where
 * none are handed, and answers what they found. It reads no file: a program that built a save holds the rules
 * against that one reading. A rule that reads one file at a time is carried out over each file alone, and what it
 * found of a file is kept while the file's tree is the same.
 */
export async function rulesOver(o: { description: Description; source: Source; facts?: Facts }): Promise<Finding[]> {
  const rules = await rulesLoaded()
  return rules
    .filter(({ rule }) => o.facts !== undefined || !rule.needs.includes('facts'))
    .flatMap(({ rule }) => (rule.reads === 'file' ? byFile(rule, o) : rule.run(o)))
}
