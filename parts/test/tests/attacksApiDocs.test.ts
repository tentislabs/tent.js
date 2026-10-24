import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../index.ts'
import { keyOf, sent } from './keyedApp.ts'
import { closing, copyOf } from './projects.ts'

// A function whose words are written to break out of the text they stand in.
const tagged = `
export const tagged = query('tagged', {
  about: '<script>alert("about")</script>',
  access: 'signedIn',
  offer: ['api'],
  input: {
    words: text({ label: '<img src=x onerror=alert("label")>', help: '"><svg onload=alert("help")>' }),
  },
  output: text(),
  run: ({ input }) => input.words,
})
`

test('[05-11.33] an about and a label that hold a tag are shown on /api/docs as text, and the page runs no script', async (t) => {
  const folder = copyOf(t, 'keyed')
  appendFileSync(join(folder, 'functions.ts'), tagged)
  const app = await testApp({ folder, secrets: { GITHUB_ID: 'the id of the app', GITHUB_SECRET: 'the secret' } })
  closing(t, () => app.close())
  const { key } = await keyOf(app, { scopes: ['*'] })
  const page = await sent(app, 'GET', '/api/docs', { key })
  assert.equal(page.status, 200)
  assert.match(String(page.headers.get('content-security-policy')), /default-src 'none'/)
  const html = await page.text()
  assert.match(html, /tagged/)
  // No element is made of the words: neither the script, nor a picture or a drawing with a handler.
  for (const made of [/<script/i, /<img/i, /<svg/i, /onerror=/i, /onload=/i])
    assert.equal(made.test(html.replace(/&lt;[\s\S]*?&gt;/g, '')), false, `the page holds ${made}`)
  for (const shown of ['&lt;script&gt;', '&lt;img src=x', '&lt;svg onload'])
    assert.ok(html.includes(shown), `the words are shown as text: ${shown}`)
})
