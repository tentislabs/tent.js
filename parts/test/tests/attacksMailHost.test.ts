import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import type { Socket } from 'node:net'
import { createServer } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { storedValues } from '../../engine/index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'
import { asNobody, besieged } from './sieges.ts'

const plain = { to: 'ada@example.com', subject: 'Your order', text: 'It is on its way.' }

test("[05-10.16] a mail secret that names a host inside its host's network, which privateHosts does not list, is refused by the address rule, and no connection is made", async (t) => {
  // A server on this computer that would take the connection: none may reach it.
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => undefined)
    socket.end('220 here\r\n')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  closing(
    t,
    () =>
      new Promise<void>((done) => {
        for (const one of sockets) one.destroy()
        server.close(() => done())
      }),
  )
  const port = Number(Reflect.get(Object(server.address()), 'port'))
  const project = copyOf(t, 'mailed')
  const file = join(project, 'tent.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace("import { project } from 'tentjs'", "import { project, secret } from 'tentjs'")
      .replace("address: 'shop@example.com' } },", "address: 'shop@example.com' }, send: secret('SMTP_URL') },"),
  )
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  // This computer by its name, by its number in four ways and in IPv6, a private network, and the cloud's own address.
  for (const host of [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `2130706433:${port}`,
    `0x7f000001:${port}`,
    `[::ffff:127.0.0.1]:${port}`,
    `[::1]:${port}`,
    '192.168.1.20:587',
    '172.16.0.4:587',
    '169.254.169.254:587',
  ]) {
    const dataFolder = join(project, `data-${host.replace(/[^a-z0-9]/gi, '-')}`)
    const address = `smtp://shop:the-password@${host}`
    testSecrets(dataFolder, made.description, { SMTP_URL: address })
    storedValues(dataFolder, made.description, { kind: 'secrets', live: true, name: 'SMTP_URL', value: address })
    const siege = await besieged(t, { bundle: made.bundleFolder, dataFolder, open: { mode: 'live', address: '*' } })
    const code = await siege.app.call('send', { message: plain }, asNobody).then(
      () => 'ok',
      (error) => String(error.code),
    )
    assert.equal(code, 'T0022', host)
  }
  assert.equal(sockets.size, 0, 'a connection reached the server of this computer')
})
