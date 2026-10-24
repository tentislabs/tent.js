import assert from 'node:assert/strict'
import { test } from 'node:test'
import { typeCheck } from './typed.ts'

const project = `import { project } from 'tentjs'

export const shop = project('shop', {})
`

test('[23-14@10f] `step.now()` is a `Date` and `step.random()` a number, at once, as the runner hands them', () => {
  const flows = `import { flow } from 'tentjs'

export const timed = flow('timed', {
  run: async ({ step }) => {
    const at: Date = step.now()
    const lucky: number = step.random()
    return { at: at.toISOString(), lucky: lucky < 0.5 }
  },
})
`
  assert.deepEqual(typeCheck('step-now', { 'tent.ts': project, 'flows.ts': flows }), [])
  const wrong = `import { flow } from 'tentjs'

export const timed = flow('timed', {
  run: async ({ step }) => {
    const at: string = step.now()
    return at
  },
})
`
  assert.deepEqual(
    typeCheck('step-now-wrong', { 'tent.ts': project, 'flows.ts': wrong }).map((one) => [one.file, one.line]),
    [['flows.ts', 5]],
    'a `Date` is no text',
  )
})

test("[23-22@10f] a step with `onFail: 'goOn'` is typed to answer its result or `{ failed: true, code, message }`, and one without it its result alone", () => {
  const flows = `import { flow } from 'tentjs'

export const charging = flow('charging', {
  run: async ({ step }) => {
    const charged = await step('charge', () => ({ id: 'ch_1' }), { tries: 2, onFail: 'goOn' })
    if (charged.failed) {
      const code: string = charged.code
      const message: string = charged.message
      return { code, message }
    }
    const id: string = charged.id
    const plain = await step('note', () => 5)
    const counted: number = plain
    return { id, counted }
  },
})
`
  assert.deepEqual(typeCheck('step-go-on', { 'tent.ts': project, 'flows.ts': flows }), [])
  const wrong = `import { flow } from 'tentjs'

export const charging = flow('charging', {
  run: async ({ step }) => {
    const plain = await step('note', () => 5)
    return plain.failed
  },
})
`
  assert.deepEqual(
    typeCheck('step-go-on-wrong', { 'tent.ts': project, 'flows.ts': wrong }).map((one) => [one.file, one.line]),
    [['flows.ts', 6]],
    'a step with no `onFail` answers no failure',
  )
})
