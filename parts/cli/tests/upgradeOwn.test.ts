import assert from 'node:assert/strict'
import { test } from 'node:test'
import { command as build } from '../commands/build.ts'
import { command as upgrade } from '../commands/upgrade.ts'
import { handsOver } from '../launch.ts'

test('[41-1] tent upgrade is carried out by the tent that runs, the newest installed, and never handed over to the version a project holds', () => {
  assert.equal(handsOver(upgrade), false, 'only the newer version holds the step to itself')
  assert.equal(handsOver(build), true, 'a project is built by the version it holds')
})
