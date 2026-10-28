import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { recordedCopy } from './recordedProject.ts'
import { anotherHost, testedNow } from './review12Host.ts'

/** The project with a screen that frames a page of the other host, which the project lets its pages frame. */
function framedCopy(t: TestContext, name: string, at: string): string {
  const project = recordedCopy(t, name, 'review12/framed')
  writeFileSync(join(project, 'lib', 'at.ts'), `export const frameAt = '${at}/framed'\n`)
  writeFileSync(
    join(project, 'tent.ts'),
    `import { project } from 'tentjs'\n\nexport const recorded = project('recorded', { title: 'Recorded', unlock: { frames: ['${at}'] }, privateHosts: ['${at}'] })\n`,
  )
  return project
}

test('[53-14] no generated case reaches outside: a frame of another host in the page of a form case is held', async (t) => {
  const host = await anotherHost(t)
  const project = framedCopy(t, 'review12-framed-declared', host.at)
  rmSync(join(project, 'tests'), { recursive: true, force: true })
  const ran = await testedNow(project, '--declared')
  assert.match(ran.printed, /addNote - form on \/framed/, ran.printed)
  assert.deepEqual(
    host.asked.filter((one) => one === '/framed'),
    [],
  )
})

test('[53-5] a test whose page frames a page of another host reached outside, and is never replayed', async (t) => {
  const host = await anotherHost(t)
  const project = framedCopy(t, 'review12-framed', host.at)
  const first = await testedNow(project)
  assert.equal(first.ended, 0, first.printed)
  assert.ok(host.asked.includes('/framed'), JSON.stringify(host.asked))
  const second = await testedNow(project)
  assert.match(
    second.printed,
    /^\s*passed tests\/framed\.test\.ts: a page that frames a page of another host$/m,
    second.printed,
  )
})
