import type { Description } from './description.ts'
import { isStored } from './record.ts'

/** What each test touched in its last run, by the test, `<file>: <name>`: the definitions it called, drew, read or wrote. */
export type TestsTouched = Record<string, string[]>

/** The kinds of a test's record that name definitions; the others name addresses, events and files. */
const ofDefinitions = [
  'functions',
  'flows',
  'screens',
  'components',
  'routes',
  'commands',
  'incoming',
  'read',
  'wrote',
  'services',
  'models',
]

/**
 * Takes the record of the tests of a project, as `tent test` keeps it in `.tent/tests.json`: each test by its file
 * and its name, with each of its runs in the order the runner ran them. Answers what each test touched, every run of
 * one name taken together, in the order of the names. A record of another form holds no test.
 */
export function touchedOf(record: unknown): TestsTouched {
  const tests: unknown = isStored(record) ? record.tests : undefined
  const touched: TestsTouched = {}
  for (const [file, names] of Object.entries(isStored(tests) ? tests : {}))
    for (const [name, runs] of Object.entries(isStored(names) ? names : {})) {
      const all = new Set<string>()
      for (const run of Array.isArray(runs) ? runs : []) {
        const kinds: unknown = isStored(run) ? run.touched : undefined
        for (const kind of ofDefinitions) {
          const held: unknown = isStored(kinds) ? kinds[kind] : undefined
          for (const one of Array.isArray(held) ? held : []) if (typeof one === 'string') all.add(one)
        }
      }
      touched[`${file}: ${name}`] = [...all].sort()
    }
  return Object.fromEntries(Object.entries(touched).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** The tests that touched a definition in their last run, in the order of their names. */
export const testsTouching = (touched: TestsTouched, name: string): string[] =>
  Object.entries(touched)
    .filter(([, names]) => names.includes(name))
    .map(([test]) => test)
    .sort()

// The kinds of definition that a test is asked of, by the part of the description that holds them.
const held = [
  ['functions', 'function'],
  ['flows', 'flow'],
  ['screens', 'screen'],
  ['tables', 'table'],
  ['routes', 'route'],
] as const

/**
 * Takes a description and what each test touched. Answers each function, flow, agent among them, screen, table and
 * route that no test touched, by its name and its kind, in the order of the names: what `tent check` warns of, and
 * what `tent impact` names untested.
 */
export function untestedOf(
  description: Description,
  touched: TestsTouched,
): { name: string; kind: (typeof held)[number][1] }[] {
  const reached = new Set(Object.values(touched).flat())
  const found: { name: string; kind: (typeof held)[number][1] }[] = []
  for (const [part, kind] of held) {
    const records: unknown = Reflect.get(description, part)
    for (const name of Object.keys(isStored(records) ? records : {})) if (!reached.has(name)) found.push({ name, kind })
  }
  return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
