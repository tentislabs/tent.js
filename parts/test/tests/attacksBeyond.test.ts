import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gated, got, noted, notesIn, recordOf, signedIn } from './gates.ts'
import { refusedWith, wholeLog, wholeOf, wire } from './sieges.ts'

test('[05-4.10] on live data the error screen of an action and of a view that fail with a secret text, and a read of the action, say T0009 and a reference, and nothing of the text', async (t) => {
  const gate = await gated(t, { open: { mode: 'live' } })
  for (const path of ['/leaks', '/broken', '/writes/change', '/writes/sql']) {
    const page = await got(gate, path)
    // A view that fails once the head of its page was sent keeps the status of the head, and says noindex.
    assert.equal(page.status, path === '/broken' ? 200 : 500, path)
    if (path === '/broken') assert.ok(page.text.includes('<meta name="robots" content="noindex">'), path)
    // On live data the page of a failure is the engine's own, which says its words and nothing of the failure (43,
    // section 5): a reader finds it in the log by the reference of the read below.
    assert.match(page.text, /<h1>500<\/h1><h2>Something went wrong\.<\/h2>/, path)
    // Nothing of what failed, of the code of the app, or of where the engine lies on this computer.
    for (const told of [
      'SECRET-OF',
      'the key of the service',
      'read-only',
      'addNote',
      gate.bundle,
      gate.dataFolder,
      'node:',
      '.ts:',
      ' at ',
    ])
      assert.ok(!page.text.includes(told), `${path} tells ${told}`)
  }
  const read = await wire(gate, { path: '/_t/read/leaks' })
  assert.equal(read.status, 500)
  const { ref, trace, ...error } = Object(read.body.error)
  assert.deepEqual(error, { code: 'T0009', name: 'internal', message: 'Something went wrong.' })
  assert.match(String(ref), /^[a-z0-9]{8}$/)
  assert.match(String(trace), /^[0-9a-f]{32}$/)
  // The text is in the log, where the reference finds it, and in no answer.
  assert.ok(wholeLog(gate.dataFolder).includes('SECRET-OF-THE-ACTION-0123456789'))
})

test('[05-4.10] a read at /_t/read/ of a query the caller may not call, with an input that does not fit, as another caller, and by a name that is no query and no action', async (t) => {
  const gate = await gated(t, { open: { mode: 'test' } })
  await noted(gate, { title: 'the one note' })
  const ada = await signedIn(gate, 'Ada', ['staff'])
  const bob = await signedIn(gate, 'Bob')
  // A page of a signed-in browser names the user it was drawn for, as `as`, where the body names none itself.
  const read = (name: string, body: unknown, signed?: { id: string; cookie: string }) => {
    const named =
      signed && typeof body === 'object' && body !== null && !Array.isArray(body) && !('as' in body)
        ? { ...body, as: signed.id }
        : body
    return wire(gate, {
      path: `/_t/read/${name}`,
      body: JSON.stringify(named),
      headers: signed ? { cookie: signed.cookie } : {},
    })
  }
  const seen = async (name: string, body: unknown, signed?: { id: string; cookie: string }): Promise<unknown[]> => {
    const answer = await read(name, body, signed)
    return [answer.status, answer.error.code ?? answer.body.value]
  }
  // The rule of what is read holds for the caller of the request, before its input is looked at.
  assert.deepEqual(await seen('forStaff', { input: {} }), [401, 'T0006'])
  assert.deepEqual(await seen('forStaff', { input: {} }, bob), [403, 'T3101'])
  assert.deepEqual(await seen('forStaff', { input: { more: 1 } }, bob), [403, 'T3101'])
  assert.deepEqual(await seen('forStaff', { input: {} }, ada), [200, 'for the staff'])
  assert.deepEqual(await seen('whoAmI', { input: {} }, bob), [200, bob.id])
  // A caller is who the request is, and never who its body names: a body that names another is told that its
  // caller changed, and is not run.
  for (const as of [ada.id, 'system', { kind: 'system' }, `user:${ada.id}`]) {
    assert.deepEqual(await seen('forStaff', { input: {}, as }, bob), [403, 'T3101'], JSON.stringify(as))
    // From nobody, a page drawn for a user is told that its caller changed; a field that names no user is nothing.
    const drawn = typeof as === 'string' ? [403, 'T3101'] : [401, 'T0006']
    assert.deepEqual(await seen('forStaff', { input: {}, as }), drawn, JSON.stringify(as))
    assert.deepEqual(await seen('whoAmI', { input: {}, as }, bob), [403, 'T3101'], JSON.stringify(as))
    assert.deepEqual(await seen('forStaff', { input: {}, caller: as, user: as, roles: ['staff'] }, bob), [403, 'T3101'])
  }
  // An input that does not fit is T0002, and a body that is no record of a read too.
  for (const body of [{ input: { more: 1 } }, { input: [] }, { input: 'x' }, [], 'x', 7, null])
    assert.deepEqual(await seen('allNotes', body), [400, 'T0002'], JSON.stringify(body))
  assert.equal((await read('allNotes', {}, undefined)).status, 200)
  // A version that never was, and one that climbs, is T0007 with the running version, and reads no file.
  const running = String(Object((await wire(gate, { method: 'GET', path: '/_t/health' })).body.value).version)
  assert.match(running, /^[0-9a-f]{32}$/)
  for (const version of ['../../data', '..\\..\\data', 'a'.repeat(32), `${running}/../x`, '']) {
    const answer = await read('allNotes', { input: {}, version })
    assert.deepEqual([answer.status, answer.error.code, answer.error.running], [409, 'T0007', running], version)
  }

  // A name that is no query and no action answers as a name that is nothing, whole, on live data.
  const live = await gated(t, { open: { mode: 'live' } })
  const before = await notesIn(live)
  const none = wholeOf(await wire(live, { path: '/_t/read/nothing', input: { title: 'x' } }))
  assert.equal(none.status, 404)
  for (const name of [
    'addNote',
    'notes',
    'users',
    'gate',
    'shownScreen',
    '_t_rate',
    '_t_sessions',
    '_t_calls',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'allNotes/..',
    'allNotes/../addNote',
    '..%2Fcall%2FaddNote',
    'addNote%00',
    'allNotes%00',
    'AddNote',
    'addNote.',
    'addNote%20',
    '%',
    '',
  ])
    assert.deepEqual(wholeOf(await wire(live, { path: `/_t/read/${name}`, input: { title: 'x' } })), none, name)
  assert.equal(await notesIn(live), before)
})

test('[05-4.1@5] a private column of a row is in no page and in no read, the page record names of its user the id and the roles alone, and no answer tells of the engine', async (t) => {
  const gate = await gated(t)
  await noted(gate, { title: 'a note', hidden: 'HIDDEN-VALUE-OF-A-ROW' })
  const bob = await signedIn(gate, 'Bob', ['clerk'])
  const answers = [
    await got(gate, '/', { cookie: bob.cookie }),
    await got(gate, '/code'),
    await got(gate, '/links'),
    await got(gate, '/nothing'),
    await got(gate, '/broken'),
    await got(gate, '/staff/'),
    await got(gate, '/account'),
    await got(gate, `/_t/b/${Object(Object(gate.app.description.browser).screens).shownScreen[0]}`),
    await got(gate, '/_t/b/description.json'),
    await wire(gate, { path: '/_t/read/allNotes' }),
    await wire(gate, { path: '/_t/read/staffNotes', headers: { cookie: bob.cookie } }),
  ]
  for (const [k, answer] of answers.entries()) {
    assert.ok(!answer.text.includes('HIDDEN-VALUE-OF-A-ROW'), `the answer ${k} holds a private column`)
    assert.ok(!/"hidden"\s*:/.test(answer.text), `the answer ${k} names a private column`)
    // No header says what answers, or which version of it.
    for (const name of ['server', 'x-powered-by', 'via', 'x-runtime', 'x-tent-version', 'x-tent-engine'])
      assert.equal(answer.headers[name], undefined, `the answer ${k} sends ${name}`)
    assert.equal(answer.headers['x-content-type-options'], 'nosniff', `the answer ${k}`)
  }
  // The page record holds what the document of the page names, and of the user the id and the roles of the row.
  const record = recordOf(answers[0].text)
  assert.deepEqual(record.user, { id: bob.id, roles: ['clerk'] })
  const named = [
    'version',
    'mode',
    'status',
    'screen',
    'origin',
    'path',
    'params',
    'state',
    'language',
    'languages',
    'currency',
    'user',
    'settings',
    'zone',
    'framedBy',
    'load',
    'answers',
    // The nonce of the document, which a library's style tags are let in by (43, section 3, point 5).
    'nonce',
  ]
  assert.deepEqual(
    Object.keys(record).filter((key) => !named.includes(key)),
    [],
  )
  assert.deepEqual(record.settings, {})
  assert.ok(!answers[0].text.includes(gate.dataFolder) && !answers[0].text.includes(gate.bundle))
})

test('[05-4.3@5] the answer of the engine that sends a visitor on, for an address with a slash at its end and for a screen that needs a sign-in, leads to a path of the app', async (t) => {
  const gate = await gated(t)
  const paths = [
    '/staff/',
    '/account/?x=1',
    '/account?back=//evil.example',
    '/account?back=https://evil.example',
    '/staff/?//evil.example',
    '/staff/?back=//evil.example',
    '//evil.example/',
    '///evil.example/',
    '/\\evil.example/',
    '/\\/evil.example/',
    '/%5Cevil.example/',
    '/%5c%5cevil.example/',
    '/%2F%2Fevil.example/',
    '/%2f/evil.example/',
    '/%2F/evil.example/',
    '/./evil.example/',
    '/.//evil.example/',
    '/x/..//evil.example/',
    '/x/%2e%2e//evil.example/',
    '/%09/evil.example/',
    '/%0a/evil.example/',
    '/%0d%0aLocation:%20https://evil.example/',
    '/%0d%0aSet-Cookie:%20taken=1/',
    '/;/evil.example/',
    '/;@evil.example/',
    '/@evil.example/',
    '/%20/evil.example/',
    '/evil.example//',
    '/https:/evil.example/',
    '/https:%2F%2Fevil.example/',
    '/%68ttps://evil.example/',
    '/staff%2F/',
    '/staff/%2F',
    '/staff/7/?next=/\\evil.example',
  ]
  let sent = 0
  for (const path of paths) {
    const answer = await got(gate, path)
    assert.equal(answer.headers['set-cookie'], undefined, path)
    if (answer.status < 300 || answer.status > 399) continue
    sent++
    const location = answer.headers.location ?? ''
    // The address it sends to, read as a browser reads it from the address that was asked for, is the app's own.
    assert.equal(new URL(location, `${gate.origin}${path}`).origin, gate.origin, `${path} sends to ${location}`)
    // Its path starts with one slash and holds no backslash, and no line of a header ends inside it.
    const [before] = location.split('?')
    assert.ok(before.startsWith('/') && !before.startsWith('//') && !before.includes('\\'), `${path}: ${location}`)
    assert.ok(!/[\r\n\t]/.test(location), `${path}: ${JSON.stringify(location)}`)
    assert.equal(answer.text, '')
  }
  assert.ok(sent >= 8, `${sent} of the addresses are sent on`)
})

test('[17-5] app.session is for a user as the row holds it: the roles that the asker states, a name of the system, and the id of a row of another table make no caller', async (t) => {
  const gate = await gated(t)
  const note = await noted(gate, { title: 'a note' })
  const bob = await signedIn(gate, 'Bob')
  // A caller that states roles of its own is taken by its id: the session is the user of the row, with its roles.
  const cookie = gate.app.session({ kind: 'user', user: { id: bob.id, roles: ['staff', 'admin'] } })
  const read = await wire(gate, {
    path: '/_t/read/forStaff',
    body: JSON.stringify({ input: {}, as: bob.id }),
    headers: { cookie },
  })
  assert.equal(read.error.code, 'T3101')
  assert.equal((await got(gate, '/staff', { cookie })).status, 404)
  assert.deepEqual(recordOf((await got(gate, '/account', { cookie })).text).user, { id: bob.id, roles: [] })
  // What is no user of the app has no session.
  for (const user of [
    'system',
    'nobody',
    '',
    note,
    `${bob.id} `,
    `${bob.id}%`,
    '*',
    '%',
    { kind: 'system' },
    { kind: 'nobody' },
    { kind: 'key', key: { id: bob.id, roles: ['staff'] } },
    { user: {} },
    { kind: 'user', user: { id: note, roles: ['staff'] } },
    null,
    7,
    [bob.id],
  ])
    assert.equal(
      await refusedWith(
        Promise.resolve().then(() => gate.app.session(Object(user) === user ? Object(user) : String(user))),
      ),
      'T2103',
      JSON.stringify(user),
    )
})
