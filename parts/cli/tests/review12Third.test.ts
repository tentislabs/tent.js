import assert from 'node:assert/strict'
import { createSocket } from 'node:dgram'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { recordedCopy } from './recordedProject.ts'
import { anotherHost, testedNow } from './review12Host.ts'

/** A server of names of this computer that stands for one outside: answers what it was asked, by how many asks. */
async function anotherNameServer(t: TestContext): Promise<{ at: string; asked: () => number }> {
  let asked = 0
  const socket = createSocket('udp4')
  socket.on('message', () => {
    asked++
  })
  await new Promise<void>((done) => socket.bind(0, '127.0.0.1', done))
  t.after(() => socket.close())
  return { at: `127.0.0.1:${String(socket.address().port)}`, asked: () => asked }
}

/** A pipe of this computer that another program serves, as a server that forwards outside would: how many came. */
async function anotherPipe(t: TestContext): Promise<{ at: string; came: () => number }> {
  let came = 0
  const at =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\review12-${String(process.pid)}`
      : join(tmpdir(), `review12-${String(process.pid)}.sock`)
  if (process.platform !== 'win32') rmSync(at, { force: true })
  const server = createServer((socket) => {
    came++
    socket.resume()
  })
  await new Promise<void>((done) => server.listen(at, done))
  t.after(() => server.close())
  return { at, came: () => came }
}

/** A package of the project that starts a program of the runtime for the app's code, as many packages do. */
function spawningPackage(project: string): void {
  const folder = join(project, 'node_modules', 'review12-spawn')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({ name: 'review12-spawn', version: '1.0.0', type: 'module', exports: './index.js' }),
  )
  writeFileSync(
    join(folder, 'index.js'),
    "import { execFileSync } from 'node:child_process'\nexport const spawned = (code) => execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' })\n",
  )
}

test('[53-14] no generated case reaches outside: a lookup of a name, a pipe to another program, a program a package starts and a thread of the app are each held', async (t) => {
  const [host, names, pipe] = [await anotherHost(t), await anotherNameServer(t), await anotherPipe(t)]
  const project = recordedCopy(t, 'review12-ways-out', 'review12/waysOut')
  rmSync(join(project, 'tests'), { recursive: true, force: true })
  spawningPackage(project)
  writeFileSync(
    join(project, 'lib', 'at.ts'),
    `export const httpAt = '${host.at}'\nexport const dnsAt = '${names.at}'\nexport const pipeAt = ${JSON.stringify(pipe.at)}\n`,
  )
  const ran = await testedNow(project, '--declared')
  for (const name of ['askName', 'askPipe', 'askByPackage', 'askByThread'])
    assert.match(ran.printed, new RegExp(`${name} - access`), ran.printed)
  assert.deepEqual(
    {
      name: names.asked(),
      pipe: pipe.came(),
      package: host.asked.filter((one) => one === '/spawned').length,
      thread: host.asked.filter((one) => one === '/thread').length,
    },
    { name: 0, pipe: 0, package: 0, thread: 0 },
  )
})

test('[53-5] a test that asks another host again on a connection that a pool kept from an earlier test reached outside, and is never replayed', async (t) => {
  const host = await anotherHost(t)
  host.says.text = 'one'
  const project = recordedCopy(t, 'review12-pooled', 'review12/pooled')
  writeFileSync(join(project, 'lib', 'at.ts'), `export const httpAt = '${host.at}'\n`)
  const first = await testedNow(project)
  assert.equal(first.ended, 0, first.printed)
  host.says.text = 'two'
  const second = await testedNow(project)
  const name = 'tests/pooled.test.ts: the second test asks it again on the connection the pool kept'
  assert.match(second.printed, new RegExp(`^\\s*failed ${name}$`, 'm'), second.printed)
})
