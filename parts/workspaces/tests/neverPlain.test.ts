import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../../check/index.ts'
import type { WorkspacesOptions } from '../index.ts'
import { folderOf } from './held.ts'

// Every option the workspaces take: the type checker refuses this record where one is missing or one more is named.
const options: Record<keyof WorkspacesOptions, true> = {
  engine: true,
  app: true,
  folder: true,
  address: true,
  fetch: true,
  live: true,
  templates: true,
  identify: true,
  sleepAfter: true,
  turnsKept: true,
  framedBy: true,
  sandbox: true,
  room: true,
  trusted: true,
  mail: true,
  counting: true,
  may: true,
}

test('[40-9] a workspace is never held to plain definitions: createWorkspaces takes no such option, and the type checker refuses forms written in the policy of an agent', async (t) => {
  assert.deepEqual(
    Object.keys(options).filter((name) => /plain|form/i.test(name)),
    [],
  )
  const folder = join(folderOf(t), 'builder')
  cpSync(join(import.meta.dirname, 'builder'), folder, { recursive: true })
  const file = join(folder, 'functions', 'agents.ts')
  const text = readFileSync(file, 'utf8')
  const policy = "    reaches: ['api.example.com'],\n"
  assert.ok(text.includes(policy))
  writeFileSync(file, text.replace(policy, `${policy}    forms: 'any',\n`))
  const { findings } = await checkProject(folder)
  const refused = findings.filter((one) => one.code === 'T8000' && one.where?.file === 'functions/agents.ts')
  assert.equal(refused.length, 1, JSON.stringify(findings))
  assert.match(refused[0].message, /forms/)
})
