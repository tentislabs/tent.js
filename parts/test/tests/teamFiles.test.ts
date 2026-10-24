import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

const got = async (browser: TestBrowser, id: unknown) => {
  const answer = await browser.request('GET', `/_t/files/${String(id)}`)
  return { status: answer.status, text: await answer.text() }
}

test('[50-8] a file that a row of a tenant holds is downloadable by who may read that row and by nobody else, the hold names its tenant, and the file is loose again when the row lets go of it', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'teamFiles') })
  closing(t, () => app.close())
  await app.user({ email: 'maya@example.com', roles: [] })
  await app.user({ email: 'omar@example.com', roles: [] })
  const maya = await signedIn(app, 'maya@example.com')
  const omar = await signedIn(app, 'omar@example.com')
  const north = String((await maya.call('addTeam', { name: 'North' })).value)
  const south = String((await maya.call('addTeam', { name: 'South' })).value)

  // A file that is uploaded needs no file of a tenant: it is loose, and its uploader's.
  const file = String((await maya.call('putText', { words: 'the paper of the north' })).value)
  assert.deepEqual([(await got(maya, file)).status, (await got(omar, file)).status], [200, 404])
  // A row of the file of a tenant holds it: the first row of that tenant, whose file is made by this write.
  const kept = await maya.call('keepPaper', { team: north, title: 'kept', paper: file })
  assert.equal(kept.ok, true, JSON.stringify(kept))
  // Held, the file is no longer loose: it is there after the hour of a loose file, for who may read its row.
  app.clock.advance('2 hours')
  assert.deepEqual(await got(maya, file), { status: 200, text: 'the paper of the north' })
  assert.equal((await got(omar, file)).status, 404)
  assert.equal((await got(app.browser(), file)).status, 404)
  // A change may store only a file that its caller may download, in the file of a tenant as anywhere.
  const theirs = await omar.call('keepPaper', { team: south, title: 'not theirs', paper: file })
  assert.equal(theirs.ok, false, JSON.stringify(theirs))

  // The row lets go of the file: it is loose again from that moment, its uploader's, and gone an hour later.
  assert.equal((await maya.call('dropPaper', { team: north, row: kept.value })).ok, true)
  app.clock.advance('30 minutes')
  assert.equal((await got(maya, file)).status, 200)
  app.clock.advance('31 minutes')
  assert.equal((await got(maya, file)).status, 404)
})

test('[50-8] removing a tenant removes its holds: a file that a row of that tenant held is loose again from that moment, and no hold names the tenant', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'teamFiles') })
  closing(t, () => app.close())
  await app.user({ email: 'maya@example.com', roles: [] })
  const maya = await signedIn(app, 'maya@example.com')
  const north = String((await maya.call('addTeam', { name: 'North' })).value)
  const south = String((await maya.call('addTeam', { name: 'South' })).value)
  const ofNorth = String((await maya.call('putText', { words: 'of the north' })).value)
  const ofSouth = String((await maya.call('putText', { words: 'of the south' })).value)
  assert.equal((await maya.call('keepPaper', { team: north, title: 'n', paper: ofNorth })).ok, true)
  assert.equal((await maya.call('keepPaper', { team: south, title: 's', paper: ofSouth })).ok, true)
  app.clock.advance('2 hours')
  assert.deepEqual([(await got(maya, ofNorth)).status, (await got(maya, ofSouth)).status], [200, 200])

  // The tenant goes, with its file and its rows: what its rows held is held by nothing any more.
  assert.equal((await maya.call('dropTeam', { team: north })).ok, true)
  // Loose again, the file is its uploader's for an hour, and then gone. The file of the other tenant stays.
  assert.equal((await got(maya, ofNorth)).status, 200)
  app.clock.advance('61 minutes')
  assert.equal((await got(maya, ofNorth)).status, 404)
  assert.deepEqual(await got(maya, ofSouth), { status: 200, text: 'of the south' })
})
