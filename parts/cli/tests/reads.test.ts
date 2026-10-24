import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { startWords } from './startWords.ts'
import { closed, copied, shell, typed } from './typed.ts'

const key = 'k'.repeat(48)

/** Waits until something holds, and fails where it does not within the time a test gives it. */
async function until(holds: () => boolean | Promise<boolean>, what: string, within = 60_000): Promise<void> {
  const ends = performance.now() + within
  while (performance.now() < ends) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.fail(`it did not come to hold within ${within} ms: ${what}`)
}

/** The calls that the log of a data folder holds, each as its name and its code. */
function callsIn(dataFolder: string): string[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT name, kind, code FROM "calls" ORDER BY rowid')
      .all()
      .map((row) => `${row.kind} ${row.name} ${row.code ?? 'ok'}`)
  } finally {
    log.close()
  }
}

test('[29-2] `tent start --reads` runs a reader as a program of its own: it fetches the version and the data with the key of its file and says what it runs, answers a query itself, hands a change to its writer, and joins as a far reader with --far', async (t) => {
  // What the test started is ended before its folder is removed: what ends a test is done in the order it was said.
  const engine = createEngine({ port: 0 })
  const children: { child: ChildProcess; ended: Promise<void> }[] = []
  t.after(async () => {
    for (const { child, ended } of children) {
      child.kill()
      await ended
    }
    await engine.close()
  })
  const project = copied(t, 'reads')
  const built = await buildProject(project, { for: 'dev' })
  const [writerData, readerData] = [join(project, '..', 'writer'), join(project, '..', 'reader')]
  const writer = await engine.open(built.bundleFolder, {
    dataFolder: writerData,
    mode: 'test',
    readers: [key],
    insecure: true,
  })
  await writer.call('addUser', { name: 'Ada', roles: [] }, { as: { kind: 'system' } })
  const { port } = JSON.parse(readFileSync(join(writerData, 'engine.json'), 'utf8'))
  const keyFile = join(project, '..', 'reader.key')
  writeFileSync(keyFile, `${key}\n`, { mode: 0o600 })
  closed(keyFile)

  /** Starts the reader as a person types it, and answers the program with the line it says and the port in it. */
  const started = async (...flags: string[]): Promise<{ child: ChildProcess; said: string; at: string }> => {
    const words = startWords([
      'start',
      '--reads',
      `http://127.0.0.1:${port}`,
      '--key-from',
      keyFile,
      '--data',
      readerData,
    ])
    const child = spawn(process.execPath, [shell, ...words, '--port', '0', '--insecure', ...flags], {
      cwd: project,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const ended = new Promise<void>((done) => child.once('exit', () => done()))
    children.push({ child, ended })
    let said = ''
    child.stderr?.setEncoding('utf8').on('data', (piece: string) => {
      said += piece
    })
    await until(() => /:(\d+)\b/.test(said) || child.exitCode !== null, 'the line that tent start says it runs with')
    const at = Number(/:(\d+)\b/.exec(said)?.[1])
    assert.equal(Number.isInteger(at) && at > 0, true, `tent start said: ${said}`)
    return { child, said, at: `http://127.0.0.1:${at}` }
  }
  const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' }
  const readerRow = (): { id: string; far: boolean; current: boolean } | undefined =>
    writer.machines().find((one) => one.role === 'reader')

  // It needs no bundle: it says the app and the mode of its writer, which no word of the command named.
  const near = await started()
  assert.match(near.said, /^shop runs at http:\/\/localhost:\d+ \(test\)\./m)
  // A reader says that it is ready once it is current: until then it answers nothing itself.
  await until(async () => (await fetch(`${near.at}/_t/health`)).status === 200, 'the reader is current')
  assert.deepEqual([readerRow()?.far, readerRow()?.current], [false, true])
  const id = readerRow()?.id
  // A query is answered by the reader itself, and a change is handed to the writer, which carries it out.
  const asked = await fetch(`${near.at}/_t/call/whoAmI`, post)
  assert.deepEqual([asked.status, Object(await asked.json()).value], [200, 'no user'])
  const handed = await fetch(`${near.at}/_t/call/addOrder`, { ...post, body: '{"input":{"title":"a lamp"}}' })
  assert.equal(Object(Object(await handed.json()).error).code, 'T0006')
  // The log of the writer holds the two calls, beside the rows of what the reader asked of the link.
  assert.deepEqual(
    callsIn(writerData).filter((row) => !row.startsWith('copy ')),
    ['change addUser ok', 'change addOrder T0006'],
  )
  assert.deepEqual(callsIn(readerData), ['query whoAmI ok', 'handed /_t/call/addOrder ok'])
  near.child.kill()
  await children[0].ended
  await until(() => readerRow() === undefined, 'the writer saw the reader leave')

  // Started again on its folder with --far, it is the same machine, and a far reader.
  await started('--far')
  await until(() => readerRow()?.current === true, 'the far reader is current')
  assert.deepEqual([readerRow()?.far, readerRow()?.id], [true, id])
})

test('[29-2] `tent start --reads --key-from` takes the key from a file of the current user that no other user may read, and refuses any other before a byte of it is read, naming the file and how it is closed', async (t) => {
  const project = copied(t, 'reads-key')
  const keyFile = join(project, '..', 'reader.key')
  const reader = join(project, '..', 'reader')
  // No writer answers at that address: a reader that was let read its key ends by itself with T0029.
  const started = (file: string): ReturnType<typeof typed> =>
    typed(
      project,
      ...startWords([
        'start',
        '--reads',
        'http://127.0.0.1:9',
        '--key-from',
        file,
        '--data',
        reader,
        '--insecure',
        '--json',
      ]),
    )
  // A file that another user may read: the command takes no key from it.
  writeFileSync(keyFile, `${key}\n`, { mode: 0o644 })
  if (process.platform === 'win32') execFileSync('icacls', [keyFile, '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  else chmodSync(keyFile, 0o644)
  const open = await started(keyFile)
  const [found] = open.answer.findings ?? []
  assert.deepEqual([open.ended !== 0, found?.code], [true, 'T0013'])
  assert.equal(found.message.includes(keyFile), true, found.message)
  assert.match(String(found.fix), process.platform === 'win32' ? /icacls/ : /chmod 600/)
  assert.equal(String(found.fix).includes(keyFile), true)
  assert.equal(open.printed.includes(key), false)
  // Closed as the fix says, it is taken: the reader reaches for its writer, and finds none.
  closed(keyFile)
  const taken = await started(keyFile)
  assert.deepEqual([taken.ended !== 0, taken.answer.findings?.[0].code], [true, 'T0029'])
  // A link to such a file is refused too, where this user may make one.
  const link = join(project, '..', 'link.key')
  try {
    symlinkSync(keyFile, link, 'file')
  } catch (error) {
    t.diagnostic(`a link could not be made here, so it was not tried: ${Reflect.get(Object(error), 'code')}`)
    return
  }
  const linked = await started(link)
  assert.deepEqual([linked.ended !== 0, linked.answer.findings?.[0].code], [true, 'T0013'])
  assert.match(String(linked.answer.findings?.[0].message), /link/)
})
