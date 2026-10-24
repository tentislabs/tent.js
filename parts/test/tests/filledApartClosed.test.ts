import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, listed } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const
const moment = (ms = 5): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Moves the clock a second at a time until what is asked holds. */
async function until(app: TestApp, what: string, holds: () => boolean | Promise<boolean>, seconds = 600) {
  for (let i = 0; i < seconds; i++) {
    if (await holds()) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail(`never: ${what}`)
}

/** Moves the clock a second at a time, so many seconds, with nothing read meanwhile. */
async function passing(app: TestApp, seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    app.clock.advance('1 second')
    await moment()
  }
}

/** Adds a team with one task in its file, and answers the id of the team. */
async function teamWith(app: TestApp, name: string): Promise<string> {
  const made = await app.write([{ add: 'teams', values: { name } }], system)
  const team = String(Reflect.get(Object(Array.isArray(made) ? made[0] : made), 'id'))
  await app.write([{ add: 'tasks', of: team, values: { team, title: name, note: 'the week' } }], system)
  return team
}

// A value of the input as the code of the work writes it inside its text.
const shown = (field: string): string => ['$', `{input.${field}}`].join('')

const summaryCount = (app: TestApp) => Object(app.filled().find((one) => one.column === 'summary'))

test('[51-12] in a tenant table, a closed file is counted by its fills, and after its work changed the pass opens each closed file and makes its values anew', async (t) => {
  const folder = copyOf(t, 'fillingApart')
  const { app, dataFolder } = await appIn(t, folder)
  const teams = [await teamWith(app, 'North'), await teamWith(app, 'South')]
  const closed = async (): Promise<boolean> =>
    (await listed(app, dataFolder)).files.filter((one) => teams.includes(one.id)).every((one) => one.open === false)
  // The files close before their values are due: the directory counts them as missing.
  await passing(app, 90)
  assert.equal(await closed(), true, 'the files of the teams are closed')
  assert.equal(summaryCount(app).missing, 2, 'a closed file is counted by its fills')
  // At their fillAt the values are made, and the files close again with none missing.
  const summaries = async (): Promise<unknown[]> => {
    const all: unknown[] = []
    for (const team of teams) for (const row of await app.rows('tasks', { of: team })) all.push(row.summary)
    return all
  }
  await until(app, 'the values are made', async () =>
    (await summaries()).every((one) => one === 'North: the week' || one === 'South: the week'),
  )
  await passing(app, 90)
  assert.equal(await closed(), true, 'the files of the teams are closed again')
  assert.equal(summaryCount(app).missing, 0)

  // A version whose work makes another value, switched to while every file is closed.
  const functions = join(folder, 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8').replace(
      `${shown('title')}: ${shown('note')}`,
      `${shown('title')} - ${shown('note')}`,
    ),
  )
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'bundle-2') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  await app.switch(await app.add(built.bundleFolder))
  await until(app, 'the pass opened the closed files and made their values anew', async () =>
    (await summaries()).every((one) => typeof one === 'string' && one.includes(' - ')),
  )
})
