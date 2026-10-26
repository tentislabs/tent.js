import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { expect, testApp } from 'tentjs/test'

test('the home screen looks as it was kept', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const page = await app.open('/', { as: maya })
  await expect(page).looks('home')
  await app.close()
  // Stands for a picture that a person keeps anew while the run goes on, after the test held the page to it.
  execFileSync(process.execPath, [
    '-e',
    "require('fs').writeFileSync('tests/looks/chromium/home.png', 'a picture kept anew while the run went on')",
  ])
})
