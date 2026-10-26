import test from 'node:test'
import { testApp } from 'tentjs/test'
import { socketOut } from '../functions/socketOut'

test('a function whose code connects to another host by WebSocket', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(socketOut, {})
  await app.close()
})
