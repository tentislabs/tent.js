import { TentError, text } from '../../core/index.ts'
import type { Change } from '../../history/index.ts'
import { historyOf } from '../state.ts'
import type { ProjectTool } from './face.ts'

/** The error of a word that names no point of the history. */
const noPoint = (word: string): TentError =>
  new TentError('T9107', `No point ${JSON.stringify(word).slice(0, 80)} is in the history of the workspace.`, {
    fields: { point: word },
  })

/**
 * The changes of a run of points, each in the terms of compare, joined into what changed from the first to the
 * last: a field changed twice keeps its first `from` and its last `to`, and what was added and then removed
 * changed nothing.
 */
function joined(lists: Change[][]): Change[] {
  const all = new Map<string, Change>()
  for (const list of lists)
    for (const change of list) {
      const key = `${change.what} ${change.name} ${JSON.stringify(change.path ?? [])}`
      const was = all.get(key)
      if (!was) all.set(key, change)
      else if (change.change === 'removed') {
        if (was.change === 'added') all.delete(key)
        else all.set(key, { ...change, ...(was.from === undefined ? {} : { from: was.from }) })
      } else if (change.change === 'changed') {
        const { to, lines } = change
        all.set(key, { ...was, ...(to === undefined ? {} : { to }), ...(lines === undefined ? {} : { lines }) })
      } else all.set(key, change)
    }
  return [...all.values()]
}

/**
 * `compare`: what changed between two points, `to` being the present where it is left out: each definition,
 * column and step that was added, removed or changed, with the paths of its fields and their values, for
 * the whole app or for the definition `name` alone. It is made from the lists kept with the points between them,
 * and from two descriptions only where the points lie on two branches.
 */
export const compareTool: ProjectTool = {
  name: 'compare',
  about:
    'What changed between two saved points of the project, the present where to is left out: each definition, column and step that was added, removed or changed, with the fields that changed and their values on both sides.',
  input: { from: text({ min: 1 }), to: text({ min: 1, optional: true }), name: text({ min: 1, optional: true }) },
  writes: false,
  async run(at, input) {
    const history = historyOf(at.one)
    const [fromWord, toWord] = [String(input.from), String(input.to ?? 'now')]
    const from = history.find(fromWord)
    const to = history.find(toWord)
    if (!from) throw noPoint(fromWord)
    if (!to) throw noPoint(toWord)
    const kept = from.id === to.id ? [] : history.changesBetween(from.id, to.id)
    const changes = kept ? joined(kept) : history.compare(from.id, to.id)
    const name = input.name
    return {
      changes:
        typeof name === 'string'
          ? changes.filter((one) => one.name === name || one.name.startsWith(`${name}.`))
          : changes,
    }
  },
}
