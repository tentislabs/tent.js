import test from 'node:test'
import { testApp } from 'tentjs/test'

test('a page that frames a page of another host', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.open('/framed', { as: maya })
  await app.close()
})
