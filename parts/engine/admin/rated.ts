import type { Admin } from '../admin.ts'
import { badWord, wordOf } from '../admin.ts'
import { table } from '../tables/scores.ts'

const system = { kind: 'system' } as const

// How many runs of an agent are looked at: the newest ones.
const newest = 500

/**
 * `tent test --ai --from-runs`: the kept runs of an agent that people rated, each with what it was asked, what
 * it answered and its lowest rating, the lowest first; with `below`, only those rated below it. A run that nobody
 * rated is no case: a person's rating is what makes a run worth keeping as one.
 */
export const admin: Admin = {
  name: 'rated',
  async run(o, args) {
    const agent = wordOf(args, 'agent', 'the name of an agent')
    const below: unknown = Reflect.get(args, 'below')
    if (below !== undefined && typeof below !== 'number') throw badWord('below', 'a number')
    const read: unknown = o.store.read(
      {
        from: table.name,
        where: {
          all: [
            { col: 'agent', is: agent },
            { col: 'kind', is: 'rating' },
          ],
        },
      },
      system,
    ).value
    const lowest = new Map<string, number>()
    for (const row of Array.isArray(read) ? read : []) {
      const run = String(Reflect.get(Object(row), 'run'))
      const score = Number(Reflect.get(Object(row), 'score'))
      lowest.set(run, Math.min(lowest.get(run) ?? score, score))
    }
    const runs = (await o.flows?.runner.find({ flow: agent, newest })) ?? []
    const rated = runs.flatMap((run) => {
      const rating = lowest.get(run.id)
      if (rating === undefined || (typeof below === 'number' && rating >= below)) return []
      const message: unknown = Reflect.get(Object(run.input), 'message')
      const answer: unknown = Reflect.get(Object(run.answer), 'text')
      return [
        {
          run: run.id,
          rating,
          ...(typeof message === 'string' ? { message } : {}),
          ...(typeof answer === 'string' ? { answer } : {}),
        },
      ]
    })
    return { runs: rated.sort((a, b) => a.rating - b.rating || (a.run < b.run ? -1 : 1)) }
  },
}
