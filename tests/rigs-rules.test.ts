import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyOf, planted, root, start } from './rigs-plant.ts'

const program = 'scripts/rules.mjs'
const rules = (folder: string) => start(root, program, folder)

// Each planted rule that lacks a project, with what the rig says of it.
const cases = {
  'parts/check/rules/T1002.ts': 'the rule T1002 has no failing project: parts/check/tests/T1002/fail/',
  'parts/check/rules/T6007/routes.ts':
    'the rule T6007, in its case routes, has no passing project: parts/check/tests/T6007/routes/pass/',
}
const files = Object.keys(cases)

test('[03-6] a rule with a passing project and no failing one fails, and is named', (t) => {
  const all = rules(planted('6'))
  assert.equal(all.code, 1, all.out)
  for (const words of Object.values(cases)) assert.ok(all.out.includes(words), all.out)
  assert.match(all.out, /^2 found in 4 pairs of projects\.$/m)
  assert.doesNotMatch(all.out, /T1001|screens/)

  for (const [one, words] of Object.entries(cases)) {
    const alone = rules(
      copyOf(
        t,
        '6',
        files.filter((other) => other !== one),
      ),
    )
    assert.equal(alone.code, 1, alone.out)
    assert.ok(alone.out.includes(words), alone.out)
    assert.match(alone.out, /^1 found in 3 pairs of projects\.$/m)
  }

  const none = rules(copyOf(t, '6', files))
  assert.equal(none.code, 0, none.out)
  assert.match(none.out, /^2 pairs of projects\. Nothing found\.$/m)
})

test('[03-6] every check rule of the repository has its two projects', () => {
  const ended = start(root, program)
  assert.equal(ended.code, 0, ended.out)
})
