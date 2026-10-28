import test from 'node:test'
import { expect, testApp } from 'tentjs/test'

test('the home screen sounds as it was kept', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const page = await app.open('/', { as: maya })
  await expect(page).heard('home')
  await app.close()
})
