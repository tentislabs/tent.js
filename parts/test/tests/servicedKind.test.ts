import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { remoteOf, servicedEngine } from './remotes.ts'

const maya: { as: Caller } = { as: { kind: 'user', user: { id: 'maya', roles: [] } } }

test('[24-2] a file that a service answers with no name of its own is named after the call with the ending of the kind its bytes say, not the kind the service states', async (t) => {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
      '1f15c4890000000d49444154789c636000000000050001a5f645400000000049454e44ae426082',
    'hex',
  )
  const remote = await remoteOf(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' })
    response.end(png)
  })
  const { app } = await servicedEngine(t, remote)
  const id = String(await app.call('chart', {}, maya))
  assert.deepEqual(await app.call('fileOf', { id }, maya), { kind: 'image/png', name: 'chart.png', size: png.length })
})
