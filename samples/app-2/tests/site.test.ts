import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

test('the seed holds five features, and the home page asks for three', async () => {
  const app = await testApp()
  const all = await app.rows('features')
  assert.equal(all.length, 5)
  const three = await app.as('nobody').call('featureList', { limit: 3 })
  assert.equal(three.length, 3)
  const ids = await app.as('nobody').call('featureIds', {})
  assert.deepEqual(ids.map((one) => one.id).sort(), all.map((one) => one.id).sort())
  await app.close()
})

test('a visitor sends a message, and nobody but the staff reads it', async () => {
  const app = await testApp()
  await app.as('nobody').call('sendMessage', { email: 'ada@example.com', text: 'Hello' })
  const kept = await app.rows('messages')
  assert.deepEqual(
    kept.map((one) => [one.email, one.text]),
    [['ada@example.com', 'Hello']],
  )
  await assert.rejects(app.as('nobody').call('sendMessage', { email: 'not an address', text: 'Hello' }), {
    code: 'T0002',
  })
  await assert.rejects(app.as('nobody').call('sendMessage', { email: 'ada@example.com', text: '' }), {
    code: 'T0002',
  })
  assert.equal((await app.rows('messages')).length, 1)
  await app.close()
})

test('every screen is drawn for a visitor, in English and in Turkish', async () => {
  const app = await testApp()
  const [first] = await app.rows('features')
  const pages: [string, string][] = [
    ['/', 'Run your shop from one screen'],
    ['/tr', 'Dükkanınızı tek ekrandan yönetin'],
    ['/pricing', 'Pricing'],
    ['/tr/pricing', 'Fiyatlar'],
    ['/gallery', 'Gallery'],
    ['/contact', 'Write to us, and we answer within a day.'],
    ['/contact?sent=true', 'Thank you'],
    ['/tr/contact?sent=true', 'Teşekkürler'],
    [`/features/${first.id}`, first.name],
  ]
  for (const [path, words] of pages) {
    const page = await app.as('nobody').page(path)
    assert.equal(page.status, 200, path)
    assert.ok(page.html.includes(words), `${path} shows "${words}"`)
  }
  const feature = await app.as('nobody').page(`/features/${first.id}`)
  assert.ok(feature.html.includes(`<title>${first.name}</title>`), 'the tab holds the name of the feature')
  assert.ok(feature.html.includes(`<meta name="description" content="${first.summary}">`))
  assert.equal((await app.as('nobody').page('/features/01m5cqzjqtejnt0taxmcgjmszz')).status, 404)
  assert.equal((await app.as('nobody').page('/nowhere')).status, 404)
  await app.close()
})

test('each language of a page names itself as its one address, and every language as its others', async () => {
  const app = await testApp()
  for (const [path, own] of [
    ['/pricing', '/pricing'],
    ['/tr/pricing', '/tr/pricing'],
  ]) {
    const { html } = await app.as('nobody').page(path)
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1] ?? ''
    assert.equal(new URL(canonical).pathname, own, `the one address of ${path} is its own`)
    const others = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(
      (one) => `${one[1]} ${new URL(one[2]).pathname}`,
    )
    assert.ok(others.includes('en /pricing'), `${path} names its English page`)
    assert.ok(others.includes('tr /tr/pricing'), `${path} names its Turkish page`)
  }
  await app.close()
})

test('the video of a feature waits for the visitor to agree', async () => {
  const app = await testApp()
  const [withVideo] = (await app.rows('features')).filter((one) => one.video)
  const page = await app.as('nobody').page(`/features/${withVideo.id}`)
  assert.ok(page.html.includes('Show videos'))
  assert.ok(!page.html.includes('<iframe'), 'no frame of the video host stands in the first HTML')
  await app.close()
})

test('the contact form with no script leads to "Thank you" in the language it was sent in', async () => {
  const app = await testApp()
  for (const [at, back] of [
    ['/contact', '/contact?sent=true'],
    ['/tr/contact', '/tr/contact?sent=true'],
  ]) {
    const browser = app.browser()
    const page = await browser.page(at)
    const version = /name="t-version" value="([^"]+)"/.exec(page.html)?.[1] ?? ''
    const form = /name="t-form" value="([^"]+)"/.exec(page.html)?.[1] ?? ''
    const drawnAt = /name="t-at" value="([^"]+)"/.exec(page.html)?.[1] ?? ''
    const sent = await browser.request('POST', '/_t/form/sendMessage', {
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({
        't-at': drawnAt,
        't-form': form,
        't-version': version,
        email: 'grace@example.com',
        text: 'A question',
      }).toString(),
    })
    assert.equal(sent.status, 303, at)
    assert.equal(sent.headers.get('location'), back, at)
  }
  assert.equal((await app.rows('messages')).length, 2)
  await app.close()
})
