import assert from 'node:assert/strict'
import test from 'node:test'
import { addOrder, addTeam, command, dataPlace, deskBundle, logLines, pairOf, titlesOf } from './desks.ts'
import { until } from './many.ts'

test('[29-7] tent take-over names how many files of tenants the machine is still fetching, among what it may lack, also for a reader that was stopped while it fetched', async (t) => {
  // The test holds back each request by which the reader fetches the file of one tenant.
  const fetches: string[] = []
  let held: Promise<void> | undefined
  let release = (): void => undefined
  // The requests that end with a broken connection once they are let go, by their place among the fetches.
  const broken = new Set<number>()
  const hold = (): void => {
    held = new Promise<void>((done) => {
      release = done
    })
  }
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t), async (request) => {
    const { pathname, searchParams } = new URL(request.url)
    if (pathname !== '/_t/copy/data' || !searchParams.has('id')) return
    const mine = fetches.push(String(searchParams.get('id')))
    await held
    if (broken.has(mine)) throw new Error('the connection of the fetch broke')
  })
  const { writer, reader } = pair
  const beats = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 80; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  /** What `tent take-over` says with no `--yes`, on the reader. */
  const looked = async (): Promise<Record<string, unknown>> =>
    Object(await command(pair.reader.app, reader.dataFolder, 'take-over', { look: true }))
  const fetchedBy = (): number => logLines(reader.dataFolder, 'data file of a tenant was fetched').length
  const level = (): Promise<void> =>
    until('the reader holds what the writer holds', () => pair.reader.app.at().n === writer.app.at().n)
  await beats('the reader is current', () => reader.app.at().current)
  const [north, south] = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  await addOrder(writer.app, north, 'a lamp')
  await addOrder(writer.app, south, 'a desk')
  const backup: Record<string, unknown> = Object(
    await command(writer.app, writer.dataFolder, 'data', { what: 'backup' }),
  )
  await level()
  // A reader that fetches nothing says so, by the number and not by a field left out.
  assert.equal((await looked()).fetching, 0)

  // Both tenants are put back on the writer, and neither file arrives on the reader for now.
  hold()
  for (const team of [north, south])
    await command(writer.app, writer.dataFolder, 'data', { what: 'restore', file: String(backup.file), of: team })
  await until('the reader asked for both files', () => fetches.length === 2)
  await level()
  const during = await looked()
  assert.equal(during.fetching, 2)
  // It changed nothing, and the reader still follows.
  assert.deepEqual([during.role, pair.reader.app.role], ['reader', 'reader'])
  assert.equal(fetchedBy(), 0)

  // One file arrives, and then the other: the command counts what is left.
  release()
  await until('the reader holds both files', () => fetchedBy() === 2)
  await until('the command names no file any more', async () => (await looked()).fetching === 0)

  // The reader is stopped while it fetches one file. Started again it owes that fetch, and says so before and
  // after its link is open.
  hold()
  await command(writer.app, writer.dataFolder, 'data', { what: 'restore', file: String(backup.file), of: north })
  await until('the reader asked for the file again', () => fetches.length === 3)
  // The fetch of the reader that is stopped ends with it, and the next one is held back anew.
  const stopped = pair.reader.app
  const restarting = pair.restartReader()
  await until('the reader is closed', () => {
    try {
      stopped.at()
      return false
    } catch {
      return true
    }
  })
  const letGo = release
  broken.add(3)
  hold()
  letGo()
  await restarting
  assert.equal((await looked()).fetching, 1)
  await beats('the reader that started again asked for the file', () => fetches.length === 4)
  assert.equal((await looked()).fetching, 1)
  release()
  held = undefined
  await beats('the reader that started again fetched the file', () => fetchedBy() === 3)
  await until('the command names no file once more', async () => (await looked()).fetching === 0)
  assert.deepEqual(await titlesOf(pair.reader.app, north), ['a lamp'])
})
