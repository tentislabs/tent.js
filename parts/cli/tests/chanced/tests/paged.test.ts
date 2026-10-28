import test from 'node:test'
import { testApp } from 'tentjs/test'

test('a page opened on a held clock', async () => {
  const app = await testApp({ clock: 'held' })
  await app.open('/')
  await app.close()
})
