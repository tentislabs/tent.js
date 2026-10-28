import test from 'node:test'
import { testApp } from 'tentjs/test'

test('a page whose picture comes from another host', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.open('/pictured', { as: maya })
  await app.close()
})
