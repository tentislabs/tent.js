import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockOf, gated, got, noted, readSigns, recordOf, renoted, shapeOf, signedIn, tagsOf } from './gates.ts'
import { byWire, wholeOf } from './sieges.ts'

// The two line separators, written by their numbers so that this file holds neither as itself.
const [lineEnd, paragraphEnd] = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)]

// Texts that a row may hold, each of which would end a script, a tag, an attribute or a comment were it written as it is.
const hostile = [
  '</script><script>window.pwned = 1</script>',
  '<!--',
  '<!--<script>',
  '<!-- --!> <script>window.pwned = 1</script>',
  `one${lineEnd}two${paragraphEnd}three`,
  '<img src=x onerror=alert(1)>',
  '</title><script>alert(1)</script>',
  '</h2></div><iframe src="//evil.example"></iframe>',
  '" onmouseover="alert(1)',
  "' autofocus onfocus='alert(1)",
  '&lt;script&gt; &amp;amp; &#60;b&#62;',
  ']]><![CDATA[<b>',
  '</SCRIPT ><svg/onload=alert(1)>',
  '</textarea><script>alert(1)</script>',
  '\\u003cscript\\u003e',
  '<b>bold</b> <a href="javascript:alert(1)">x</a>',
]

/** What stands between the tags of the first element of that name, with its signs read: the words a reader sees. */
function wordsOf(html: string, name: string): string {
  const found = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(html)
  return readSigns(found?.[1] ?? '')
}

test('[05-4.1@5] a row whose text holds </script>, <!--, a line separator and an HTML tag is shown as written in an element, in the title and in the page record, and no element is made from it', async (t) => {
  const gate = await gated(t)
  const id = await noted(gate, { title: 'Ann' })
  // The pages with a harmless text: what each holds of elements, attributes and comments, whatever its words are.
  const plain: Record<string, string[]> = {}
  for (const path of ['/', '/code']) plain[path] = shapeOf((await got(gate, path)).text)
  // A form names the address that it is sent to with no script, and how.
  assert.ok(plain['/'].includes('h2') && plain['/code'].includes('form action aria-label method novalidate'))

  for (const text of hostile) {
    await renoted(gate, id, { title: text })
    for (const path of ['/', '/code']) {
      const page = await got(gate, path)
      assert.equal(page.status, 200, text)
      // No element, no attribute and no comment more than the harmless text gave.
      assert.deepEqual(shapeOf(page.text), plain[path], `${path} ${JSON.stringify(text)}`)
      // The script of the page record holds none of the characters that could end it, and reads back as written.
      const block = blockOf(page.text)
      for (const sign of ['<', '>', '&', lineEnd, paragraphEnd])
        assert.ok(!block.includes(sign), `${path} ${JSON.stringify(text)}: the record holds ${JSON.stringify(sign)}`)
      const answers = Object(recordOf(page.text).answers)
      assert.equal(answers[0].value[0].title, text)
      // The words are shown as they were written: in the element, in the title, and in every place a field takes words.
      assert.equal(wordsOf(page.text, 'h2'), text)
      assert.equal(wordsOf(page.text, 'title'), text)
      const labelled = tagsOf(page.text).find((tag) => 'aria-label' in tag.attributes)
      assert.equal(labelled?.attributes['aria-label'], text)
      if (path === '/code') {
        // The field of the form, among the hidden ones that name it.
        const field = tagsOf(page.text).find((tag) => tag.name === 'input' && tag.attributes.name === 'title')
        assert.deepEqual([field?.attributes.placeholder, field?.attributes.value], [text, text])
        assert.equal(wordsOf(page.text.slice(page.text.indexOf('<span id="help"')), 'span'), text)
      }
    }
  }
})

test('[05-4.1@5] a text that the address itself carries, as a value of the address and as a state, is written into the page as text: no element is made from it', async (t) => {
  const gate = await gated(t)
  const shown = shapeOf((await got(gate, '/echo/Ann?said=Bo')).text)
  const missing = shapeOf((await got(gate, '/nothing/Ann?said=Bo')).text)
  let drawn = 0
  for (const text of hostile) {
    const sent = encodeURIComponent(text)
    const page = await got(gate, `/echo/${sent}?said=${sent}`)
    // A value that is no address of the app is not found, and the page that says so holds no more elements either.
    assert.ok(page.status === 200 || page.status === 404, text)
    assert.deepEqual(shapeOf(page.text), page.status === 200 ? shown : missing, JSON.stringify(text))
    const block = blockOf(page.text)
    for (const sign of ['<', '>', '&', lineEnd, paragraphEnd]) assert.ok(!block.includes(sign), JSON.stringify(text))
    if (page.status !== 200) continue
    drawn++
    const record = recordOf(page.text)
    assert.deepEqual([Object(record.params).word, Object(record.state).said], [text, text])
    assert.equal(wordsOf(page.text, 'h1'), text)
    assert.equal(wordsOf(page.text, 'title'), `${text} and ${text}`)
  }
  assert.ok(drawn >= 8, 'most of the texts are values of an address, and are drawn')
})

test('[05-4.3@5] a Link of /\\evil.example, //evil.example, a slash then a tab then a slash, and each written with percent signs draws no link that leads out of the app', async (t) => {
  const gate = await gated(t)
  const id = await noted(gate, { title: 'a link', to: '/account' })
  const hrefs = async (): Promise<string[]> =>
    tagsOf((await got(gate, '/links')).text)
      // A link whose address the rule of a path refuses is drawn with no address.
      .filter((tag) => tag.name === 'a' && !tag.closes && tag.attributes.href !== undefined)
      .map((tag) => tag.attributes.href ?? '')
  // A path of the app draws its links: by the path, by a box, by a screen with a value, and by the rest of an address.
  assert.deepEqual(await hrefs(), ['/account', '/account'])
  await renoted(gate, id, { to: 'account' })
  assert.deepEqual(await hrefs(), ['/echo/account?said=account', '/rest/account'])
  const leading = [
    '/\\evil.example',
    '//evil.example',
    '/\t/evil.example',
    '\\\\evil.example',
    '\\/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    ' //evil.example',
    '\t//evil.example',
    '///evil.example',
    '/\\/evil.example',
    '/.//evil.example',
    '/x/..//evil.example',
    'https://evil.example',
    'HTTPS://evil.example',
    'http:/evil.example',
    'http:evil.example',
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'evil.example',
    '//evil.example/%2F..',
    '/\\\\evil.example',
    `/${lineEnd}/evil.example`,
    '/\u0000/evil.example',
    '/\u000b/evil.example',
    '/\u000c/evil.example',
    '/ /evil.example',
  ]
  // Each of them written with percent signs: every sign, the signs that part an address, and written twice over.
  const percent = (text: string, signs: RegExp): string =>
    text.replace(signs, (sign) => `%${sign.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
  const tries = new Set<string>()
  for (const one of leading) {
    tries.add(one)
    tries.add(percent(one, /[\\/\t\n\r :]/g))
    tries.add(`/${percent(one.slice(1), /[\\/\t\n\r :]/g)}`)
    tries.add(percent(one, /[\\\t\n\r]/g))
    tries.add(percent(one, /[\\/\t\n\r :]/g).toLowerCase())
    tries.add(percent(percent(one, /[\\/\t\n\r]/g), /%/g))
  }
  const page = `${gate.origin}/links`
  for (const to of tries) {
    await renoted(gate, id, { to })
    for (const href of await hrefs()) {
      // A link is read as a browser reads it, from the page that holds it: it leads to the app, by its own scheme.
      const leads = new URL(href, page)
      assert.equal(leads.origin, gate.origin, `${JSON.stringify(to)} drew a link to ${JSON.stringify(href)}`)
      assert.ok(
        href.startsWith('/') && !href.startsWith('//') && !href.includes('\\'),
        `${JSON.stringify(to)}: ${href}`,
      )
    }
  }
})

test('[05-4.7] as a signed-in user, the address of a screen the caller may not see answers as one that does not exist, and a caller who is nobody is sent to the sign-in screen', async (t) => {
  const gate = await gated(t)
  await noted(gate, { title: 'for the staff' })
  const bob = await signedIn(gate, 'Bob')
  const ada = await signedIn(gate, 'Ada', ['staff'])
  // The staff sees the screens, so they are there.
  for (const path of ['/staff', '/staff/7', '/mixed'])
    assert.equal((await got(gate, path, { cookie: ada.cookie })).status, 200, path)
  // A signed-in caller who is not let in: the same answer, whole, as for an address of the same length that no screen has.
  for (const [kept, none] of [
    ['/staff', '/stuff'],
    ['/staff/7', '/stuff/7'],
    ['/staff?tab=paid', '/stuff?tab=paid'],
    ['/staff/', '/stuff/'],
    ['/mixed', '/maxed'],
    ['/staff/7?x=%3Cb%3E', '/stuff/7?x=%3Cb%3E'],
  ]) {
    const [first, second] = [
      await got(gate, kept, { cookie: bob.cookie }),
      await got(gate, none, { cookie: bob.cookie }),
    ]
    // What one request alone holds is the address it asked for, which the answer names: in the page, and where it sends on.
    // So is the nonce of its document, made at random for each page, which tells nothing of the screen.
    const whole = (answer: typeof first, path: string): string => {
      const text = JSON.stringify(wholeOf(answer))
      const nonce = /'nonce-([\w-]+)'/.exec(text)?.[1]
      const own = text.replaceAll(path.split('?')[0].replace(/\/$/, ''), '<own>')
      return nonce === undefined ? own : own.replaceAll(nonce, '<nonce>')
    }
    assert.equal(whole(first, kept), whole(second, none), kept)
    assert.ok([404, 308].includes(first.status), kept)
  }
  // Every other method is answered alike too.
  for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const ask = (path: string) =>
      byWire(t, gate).then(async (wire) => {
        wire.write(
          `${method} ${path} HTTP/1.1\r\nHost: localhost:${gate.port}\r\nCookie: ${bob.cookie}\r\nConnection: close\r\n\r\n`,
        )
        return ((await wire.closed(10_000))?.text ?? '').replace(/^date: .*\r\n/im, '').replaceAll(path, '<own>')
      })
    assert.equal(await ask('/staff'), await ask('/stuff'), method)
  }
  // Nobody is told that a sign-in is needed for a screen that needs a caller, by the page of the engine where the
  // project has no screen at its sign-in path, the same for each, and is told not found for what is none.
  const needed = await got(gate, '/staff')
  assert.deepEqual([needed.status, needed.headers.location], [401, undefined])
  assert.match(needed.text, /<h1[^>]*>401<\/h1>/)
  for (const path of ['/staff/7', '/account', '/mixed']) {
    const away = await got(gate, path)
    assert.deepEqual([away.status, away.headers.location, away.text], [401, undefined, needed.text], path)
  }
  assert.equal((await got(gate, '/stuff')).status, 404)
})

test('[05-4.8@5] a page with no framedBy says that no site may show it in a frame, whatever the request says and whatever the page answers', async (t) => {
  const gate = await gated(t, { limits: { screensPerMinute: 40 } })
  const bob = await signedIn(gate, 'Bob')
  const framing = { referer: 'https://evil.example/frame', 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' }
  const ancestors = (policy: string | undefined): string[] =>
    (policy ?? '').split('; ').filter((line) => line.startsWith('frame-ancestors'))
  // Every page: a screen, the screen that is not found, the screen of an error, and a screen that another caller is kept from.
  for (const [path, status, cookie] of [
    ['/', 200, ''],
    ['/echo/x', 200, ''],
    ['/nothing', 404, ''],
    // A view that fails once the head of its page was sent keeps the status of the head.
    ['/broken', 200, ''],
    ['/leaks', 500, ''],
    ['/writes/change', 500, ''],
    ['/staff', 404, bob.cookie],
    ['/account', 200, bob.cookie],
  ] as const) {
    for (const headers of [{}, framing, { ...framing, origin: 'https://studio.example.com' }]) {
      const page = await got(gate, path, { ...headers, ...(cookie ? { cookie } : {}) })
      assert.equal(page.status, status, path)
      assert.deepEqual(ancestors(page.headers['content-security-policy']), ["frame-ancestors 'none'"], path)
      assert.equal(page.headers['x-content-type-options'], 'nosniff')
      assert.equal(page.headers['cache-control'], 'no-store')
    }
  }
  // A screen that states `framedBy` names its sites, and they alone: the site that asks is not added.
  const framed = await got(gate, '/framed', { ...framing, origin: 'https://evil.example' })
  assert.deepEqual(ancestors(framed.headers['content-security-policy']), ['frame-ancestors https://studio.example.com'])
  // An answer that is no page of the app holds nothing of it to show: a page of the engine, as for a sign-in that is
  // needed where no sign-in screen stands, may be shown in no frame either, or it is an error as JSON.
  const away = await got(gate, '/account', framing)
  assert.deepEqual([away.status, ancestors(away.headers['content-security-policy'])], [401, ["frame-ancestors 'none'"]])
  let last = await got(gate, '/', framing)
  for (let k = 0; k < 45 && last.status !== 429; k++) last = await got(gate, '/', framing)
  assert.equal(last.status, 429)
  assert.match(last.headers['content-type'], /^application\/json/)
  assert.equal(last.headers['x-content-type-options'], 'nosniff')
})

test("[05-4.13] a request for a page with a Host of the attacker's own is T0017, behind a proxy and without one, and no full address in any page holds that name", async (t) => {
  const gate = await gated(t)
  const evil = [
    'evil.example',
    `evil.example:${gate.port}`,
    `localhost.evil.example:${gate.port}`,
    `localhost:${gate.port}.evil.example`,
    `evil.example#localhost:${gate.port}`,
    `localhost:${gate.port + 1}`,
    'localhost',
    `LOCALHOST.:${gate.port}`,
    `[::ffff:127.0.0.1]:${gate.port}`,
    `0.0.0.0:${gate.port}`,
  ]
  const refusals = new Set<number>()
  for (const host of evil)
    for (const path of ['/', '/account', '/nothing', '/_t/b/browser/x.js']) {
      const answer = await got(gate, path, {}, { host })
      // A text that is no name of a host at all is refused before the door, with its status and nothing else.
      if (answer.status === 400) assert.equal(answer.text, '', `${host} ${path}`)
      else assert.deepEqual([answer.status, answer.error.code], [421, 'T0017'], `${host} ${path}`)
      assert.ok(!answer.text.includes('<'), 'the refusal is no page')
      refusals.add(answer.status)
    }
  assert.ok(refusals.has(421))
  // With no proxy named, what a proxy would state is not read: the page names the app as it was reached.
  const stated = {
    'x-forwarded-host': 'evil.example',
    'x-forwarded-proto': 'https',
    'x-forwarded-for': '203.0.113.9',
    forwarded: 'for=203.0.113.9;host=evil.example;proto=https',
    'x-host': 'evil.example',
    'x-original-host': 'evil.example',
    origin: 'https://evil.example',
    referer: 'https://evil.example/',
  }
  for (const path of ['/', '/nothing', '/broken', '/echo/evil?said=x']) {
    const page = await got(gate, path, stated)
    assert.ok(!JSON.stringify([page.headers, page.text]).includes('evil.example'), path)
    assert.equal(recordOf(page.text).origin, gate.origin)
  }
  // A request line that names another host than its `Host` is no request for a page of that host.
  const wire = await byWire(t, gate)
  wire.write(`GET http://evil.example/ HTTP/1.1\r\nHost: localhost:${gate.port}\r\nConnection: close\r\n\r\n`)
  const raw = (await wire.closed(10_000))?.text ?? ''
  assert.ok(!raw.includes('evil.example') || /^HTTP\/1\.1 421 /.test(raw), raw.slice(0, 300))

  // Behind a named proxy that writes the host: the name it states is held to the names of the app.
  const behind = await gated(t, {
    engine: { proxy: { from: ['127.0.0.1'], host: true } },
    open: { address: 'shop.example' },
  })
  const through = (host: string, more: Record<string, string> = {}) =>
    got(behind, '/', { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': host, ...more }, { host: 'inner:8080' })
  for (const host of ['evil.example', 'shop.example.evil.example', 'evil.example, evil.example', 'shop.example:8443']) {
    const answer = await through(host)
    assert.deepEqual([answer.status, answer.error.code], [421, 'T0017'], host)
  }
  const own = await through('shop.example', { forwarded: 'host=evil.example' })
  assert.equal(own.status, 200)
  assert.equal(recordOf(own.text).origin, 'https://shop.example')
  assert.ok(!JSON.stringify([own.headers, own.text]).includes('evil.example'))
  // And a proxy that does not write the host: the name is the request's own, whatever the header says.
  const plain = await gated(t, { engine: { proxy: { from: ['127.0.0.1'] } }, open: { address: 'shop.example' } })
  const kept = await got(
    plain,
    '/',
    { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': 'evil.example' },
    { host: 'shop.example' },
  )
  assert.equal(kept.status, 200)
  assert.ok(!JSON.stringify([kept.headers, kept.text]).includes('evil.example'))
  const refused = await got(plain, '/', { 'x-forwarded-host': 'shop.example' }, { host: 'evil.example' })
  assert.deepEqual([refused.status, refused.error.code], [421, 'T0017'])
})
