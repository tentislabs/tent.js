import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { callCrossed } from '../rooms/calls.ts'
import { heldRoom } from '../rooms/held/room.ts'
import { startHeld } from '../rooms/held/process.ts'
import { placedVersion } from '../rooms/inProgram/loader.ts'
import type { Ways } from '../rooms/room.ts'
import { workFolder } from './apps.ts'

// An action of a version of development that reads a file by its place: what it is handed to read.
const action = `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
export const act = { options: { run: ({ input }) => readFileSync(input.file ?? join(import.meta.dirname, 'words.txt'), 'utf8') } }
`

test('[21-17] the held program of an app of development reads the files its version lists, and no file of the store of another version', async (t) => {
  const folder = workFolder(t)
  const store = join(folder, 'build', 'files')
  mkdirSync(store, { recursive: true })
  const put = (text: string): string => {
    const print = fingerprintOf(new TextEncoder().encode(text))
    writeFileSync(join(store, print), text)
    return print
  }
  const own = put(action)
  const words = 'the words of the version'
  const ownWords = put(words)
  // A file of another version of the session, in the same store.
  const other = put('what another version holds')
  const place = join(folder, 'versions', 'v1')
  mkdirSync(join(folder, 'versions'), { recursive: true })
  writeFileSync(`${place}.json`, JSON.stringify({ files: { 'act.js': own, 'words.txt': ownWords }, store }))
  const program = startHeld({ place, native: [], nativeFolders: [], serve: () => undefined })
  t.after(() => program.close())
  const status = await program.status()
  assert.ok(
    !status.execArgv.some((flag) => flag.startsWith('--allow-fs-read=') && flag.includes(join('build', 'files'))),
    `the held program is granted the store: ${status.execArgv.join(' ')}`,
  )
  const refused = (): never => {
    throw new Error('the test hands the room nothing')
  }
  const ways: Ways = { runtime: refused, db: refused, back: refused, fetch: refused }
  const room = heldRoom({ app: 'listed', dataFolder: join(folder, 'data'), mode: 'development', where: 'main', ways })
  t.after(() => room.close())
  const version = placedVersion(
    { id: 'v1', modules: [{ path: 'act.js', kinds: ['action'] }], read: () => new Uint8Array(), hold: true },
    place,
  )
  await room.load(version)
  const called = room.entry('v1', { kind: 'action', module: 'act.js', path: ['act', 'options', 'run'] })
  const ran = async (file?: string): Promise<{ value: unknown } | { error: unknown }> => {
    try {
      return {
        value: await callCrossed(undefined, room, { sync: false, pure: false }, (o) =>
          called([{ input: { file } }], o),
        ),
      }
    } catch (error) {
      return { error }
    }
  }
  assert.deepEqual(await ran(), { value: words }, 'the held program reads a file of its version by its place')
  assert.ok('error' in (await ran(join(store, other))), 'a file of another version is read')
  assert.ok('error' in (await ran(join(store, ownWords))), 'the store itself is read')
})
