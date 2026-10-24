import type { ImpactLine, Impact, Reached } from './face.ts'
import { countOf } from './reaches.ts'
import { doorOf } from './read.ts'

/** A count with the word it counts, one or many. */
const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Where a definition leads, in words: what it reaches by kind, and the doors of what it reaches. */
function leadsTo(tree: Reached[]): string {
  const { functions, screens, offers } = countOf(tree)
  return [
    ...(functions ? [counted(functions, 'function', 'functions')] : []),
    ...(screens ? [counted(screens, 'screen', 'screens')] : []),
    ...Object.entries(offers).map(([door, n]) => `${n} offered to ${doorOf(door)}`),
  ].join(', ')
}

/** The line of one finding: its name, its kind and what changed, its file, and where it leads. */
function lineOf(one: ImpactLine, trees: Map<string, Reached[]>): string {
  const tree = trees.get(one.name)
  const leads = tree ? leadsTo(tree) : ''
  return [
    `  ${one.name} (${one.kind}, ${one.change})`,
    ...(one.file ? [one.file] : []),
    ...(leads ? [`reaches ${leads}`] : []),
    ...(one.callers ? [`used by ${counted(one.callers, 'caller', 'callers')} in the last 30 days`] : []),
  ].join('  ')
}

/** The lines of a tree of what is reached, each under what reaches it. */
function treeLines(tree: Reached[], depth: number): string[] {
  return tree.flatMap((one) => [
    `${'  '.repeat(depth)}${one.name} (${[one.kind, ...(one.offered ?? []).map((door) => `offered to ${doorOf(door)}`), ...(one.cached ? ['cached as public'] : [])].join(', ')})`,
    ...treeLines(one.under, depth + 1),
  ])
}

/**
 * Takes an impact, and the rows of the terminal it is printed in. Answers its text: one line for each finding,
 * under the heading of its part, the weightiest part first, a part that is empty left out. In a terminal of fewer
 * than 30 lines the counts of each part come first.
 */
export function impactText(impact: Impact, o: { rows?: number } = {}): string {
  const trees = new Map(impact.reaches.map((one) => [one.name, one.tree]))
  const parts: [string, string[]][] = [
    ['Wider rights', impact.rights.map((one) => lineOf(one, trees))],
    ['Breaks for callers outside', impact.breaks.map((one) => lineOf(one, trees))],
    ['Data', impact.data.map((one) => lineOf(one, trees))],
    ['Work under way', impact.work.map((one) => lineOf(one, trees))],
    [
      'What it reaches',
      impact.reaches.flatMap((one) => [`  ${one.name}  reaches ${leadsTo(one.tree)}`, ...treeLines(one.tree, 2)]),
    ],
    [
      'Tests',
      [
        ...impact.tests.map((one) => `  ${one.name}: ${one.tests.join(', ')}`),
        ...impact.untested.map((name) => `  ${name}: no test touches it`),
      ],
    ],
    ['Sends out, asks a person', impact.out.map((one) => lineOf(one, trees))],
  ]
  const shown = parts.filter(([, lines]) => lines.length)
  if (!shown.length) return `Impact against ${impact.against}\nNothing changed.`
  const counts = [
    `${impact.rights.length} wider rights`,
    counted(impact.breaks.length, 'break', 'breaks'),
    `${impact.data.length} of data`,
    `${impact.work.length} of work`,
    `${impact.reaches.length} reached`,
    `${impact.untested.length} untested`,
    `${impact.out.length} out`,
  ].join(', ')
  return [
    `Impact against ${impact.against}`,
    ...(o.rows !== undefined && o.rows < 30 ? [counts] : []),
    ...shown.flatMap(([heading, lines]) => [heading, ...lines]),
  ].join('\n')
}
