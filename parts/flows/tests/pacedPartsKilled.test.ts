import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { workFolder } from './bench.ts'

// For each part of `pace`: how many runs the kept starts make after the restart, and what the work of each noted,
// in the order it was done. A part whose runs may go in any order is held to the set of what was noted.
const parts: [string, number, string[], boolean][] = [
  ['debounce', 1, ['3'], true],
  ['batch', 1, ['1 2 3'], true],
  ['drop', 1, ['1'], true],
  ['perMinute', 3, ['1', '2', '3'], true],
  ['ranked', 4, ['0', '3', '2', '1'], false],
]

test('[46-3] a program killed while the starts of a paced flow wait loses none of them, for each part of pace: after the restart each makes the run it would have made', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'pacedParts.ts')
  for (const [part, runs, noted, inAnyOrder] of parts) {
    const folder = workFolder(t)
    const killed = await runKilled(program, { times: 1, when: 'added all', args: [folder, part] })
    assert.equal(killed.kills, 1)
    const [second] = killed.ended
    assert.equal(second.code, 0, `${part}: ${second.out}`)
    const found = /^ended: (.*)$/m.exec(second.out)
    assert.ok(found, second.out)
    const ended = JSON.parse(found[1])
    assert.equal(ended.runs, runs, `${part}: the runs that the kept starts made`)
    // A step that was at work when the program was killed is done again: what it noted counts once.
    const seen = [...new Set<string>(ended.noted)]
    assert.deepEqual(inAnyOrder ? seen.sort() : seen, noted, `${part}: what the runs were handed`)
  }
})
