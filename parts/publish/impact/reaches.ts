import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import type { Reached } from './face.ts'
import type { Stored } from './read.ts'
import { doorsOf, listOf, recordsOf } from './read.ts'

/** Every name of a function that a stored value of a screen asks: what each entry of its `data` reads. */
function asked(value: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(value)) for (const one of value) asked(one, found)
  else if (isStored(value)) {
    if (typeof value.what === 'string') found.add(value.what)
    for (const one of Object.values(value)) asked(one, found)
  }
  return found
}

/** What reads from what: each function by the tables it reads and writes, each screen by the functions it asks. */
interface Graph {
  functions: Record<string, Stored>
  screens: [string, 'screen' | 'component', Stored][]
}

const graphOf = (description: Description): Graph => ({
  functions: recordsOf(description, 'functions'),
  screens: [
    ...Object.entries(recordsOf(description, 'screens')).map(([name, one]): [string, 'screen', Stored] => [
      name,
      'screen',
      one,
    ]),
    ...Object.entries(recordsOf(description, 'components')).map(([name, one]): [string, 'component', Stored] => [
      name,
      'component',
      one,
    ]),
  ],
})

/** The screens and components that ask a function, each with whether its pages are kept as public. */
function screensOf(graph: Graph, fn: string): Reached[] {
  return graph.screens
    .filter(([, , record]) => asked(record.data, new Set()).has(fn))
    .map(([name, kind, record]) => ({
      name,
      kind,
      ...(isStored(record.cache) && Reflect.get(record.cache, 'public') === true ? { cached: true as const } : {}),
      under: [],
    }))
}

/** A function as a thing that is reached: its kind, the doors it is offered to, and the screens that ask it. */
const functionOf = (graph: Graph, name: string): Reached => {
  const record = graph.functions[name]
  const offered = doorsOf(record)
  return {
    name,
    kind: String(record?.kind ?? 'function'),
    ...(offered.length ? { offered } : {}),
    under: screensOf(graph, name),
  }
}

/**
 * Takes a description and the name of a definition that changed: a table, a column as `<table>.<column>`, or a
 * function. Answers everything that depends on it, as a tree to the screens and the offers at its ends: a table
 * reaches the functions that read it, and a function the screens that ask it.
 */
export function reachedBy(description: Description, name: string): Reached[] {
  const graph = graphOf(description)
  const owner = name.split('.')[0]
  if (Object.hasOwn(recordsOf(description, 'tables'), owner))
    return Object.entries(graph.functions)
      .filter(([, record]) => listOf(record.reads).includes(owner))
      .map(([fn]) => functionOf(graph, fn))
  if (Object.hasOwn(graph.functions, name)) return screensOf(graph, name)
  return []
}

/** Counts what a tree reaches: its functions, its screens and components, and its offers by door. */
export function countOf(tree: Reached[]): { functions: number; screens: number; offers: Record<string, number> } {
  const offers: Record<string, number> = {}
  const counted = { functions: 0, screens: 0, offers }
  const walk = (one: Reached): void => {
    if (one.kind === 'screen' || one.kind === 'component') counted.screens++
    else counted.functions++
    for (const door of one.offered ?? []) counted.offers[door] = (counted.offers[door] ?? 0) + 1
    for (const below of one.under) walk(below)
  }
  for (const one of tree) walk(one)
  return counted
}
