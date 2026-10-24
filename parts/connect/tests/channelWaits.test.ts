import assert from 'node:assert/strict'
import test from 'node:test'
import type { Channel } from '../mcp/client.ts'
import { mcpClient } from '../mcp/client.ts'

/** A channel to a program that is silent to every request. */
function silentChannel(): Channel {
  return { send: () => undefined, each: () => undefined, close: () => undefined }
}

/** How many timers this program holds now. */
const timers = (): number => process.getActiveResourcesInfo().filter((one) => one === 'Timeout').length

test('[25-11] a request to a program that is a server, whose step ends before it is answered, leaves no timer behind it', async () => {
  const client = mcpClient({
    channel: silentChannel(),
    timeout: 600_000,
    size: 1_048_576,
    form: { get: () => 'newest', set: () => undefined },
  })
  const before = timers()
  const step = new AbortController()
  const call = client.call('silent', {}, step.signal).then(
    () => 'answered',
    () => 'ended',
  )
  step.abort(new Error('the step ended'))
  assert.equal(await call, 'ended')
  assert.equal(timers(), before, 'the time of the request still runs')
})
