import assert from 'node:assert/strict'
import test from 'node:test'
import { readFlags, Unrunnable } from '../cli/flags.ts'

test("[24-13] a bare word after a function's command ends the command and names the nearest flag", () => {
  assert.throws(
    () => readFlags({ title: { kind: 'text' } }, ['titel']),
    (error: unknown) => error instanceof Unrunnable && /Did you mean --title\?/.test(error.message),
  )
})
