import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { anotherHost, outsideCopy, testedNow } from './review12Host.ts'

test('[53-14] no generated case reaches outside: a page of a form case that loads a picture from another host, and code that asks another host by node:http, are each held', async (t) => {
  const host = await anotherHost(t)
  const project = outsideCopy(t, 'review12-declared', host.at)
  // The tests written by hand are no part of the cases.
  rmSync(join(project, 'tests'), { recursive: true, force: true })
  const ran = await testedNow(project, '--declared')
  // The run made its cases, the form among them.
  assert.match(ran.printed, /addNote - form on \/pictured/, ran.printed)
  assert.match(ran.printed, /httpOut - access/, ran.printed)
  const reached = (path: string): number => host.asked.filter((one) => one === path).length
  assert.deepEqual({ picture: reached('/picture'), http: reached('/http') }, { picture: 0, http: 0 })
})
