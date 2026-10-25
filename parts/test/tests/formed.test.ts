import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

for (const engine of browserEngines) {
  test(`[32-1] a form of native controls of each kind, and a control that useField drives, sends what a person put in, each native control by its name: a moment in the zone of the page, a day, a picked list, one of a group of buttons, a tick and a slider, in ${engine}`, async () => {
    // Each engine fills a form of its own app, since the form writes a row.
    const { address }: Served = await served('formed')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/booking`)
      await page.locator('#guest input').fill('Ann')
      await page.locator('#mail').fill('ann@example.com')
      // A slider is moved with the keyboard: from the middle of one to nine, two steps up.
      await page.locator('#nights').focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.locator('#agreed').check()
      await page.locator('#at').fill('2026-10-08T12:30')
      await page.locator('#on').fill('2026-10-09')
      await page.locator('#size input[type="radio"]').nth(1).check()
      await page.locator('#extras').selectOption(['bed', 'view'])
      await page.locator('#price').fill('4250')
      await page.locator('#send').click()
      await page.locator('.who').waitFor()
      assert.equal(await page.locator('.who').textContent(), 'Ann ann@example.com 7 large')
      // Half past twelve in Tokyo, the zone of the page, is half past three by the clock of the world, and not half past
      // nine as in Istanbul, the zone of the project; a day is the day that was picked.
      assert.equal(await page.locator('.when').textContent(), '2026-10-08T03:30:00.000Z 2026-10-09')
      assert.equal(await page.locator('.what').textContent(), 'bed+view 4250 agreed loud')
      // After a send that worked the fields are back at their start.
      assert.equal(await page.locator('#guest input').inputValue(), '')
      assert.equal(await page.locator('#price').inputValue(), '')
      assert.equal(await page.locator('#agreed').isChecked(), false)
      assert.deepEqual(said, [])
    })
  })

  test(`[32-4] [32-3] the check of the browser holds a wrong value back without a call: a control that useField drives is told its words and aria-invalid, a native control the browser's own validity, and the first that failed takes the focus, in ${engine}`, async () => {
    const { address }: Served = await served('formed')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const called: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/_t/call/')) called.push(request.url())
      })
      await alive(page, `${address}/booking`)
      await page.locator('#mail').fill('no mail')
      await page.locator('#at').fill('2026-10-08T12:30')
      await page.locator('#on').fill('2026-10-09')
      await page.locator('#size input[type="radio"]').nth(0).check()
      await page.locator('#extras').selectOption(['desk'])
      await page.locator('#price').fill('-5')
      await page.locator('#send').click()
      await page.locator('#guest .error').waitFor()
      assert.equal(await page.locator('#guest .error').textContent(), 'This is needed.')
      const guest = page.locator('#guest input')
      assert.equal(await guest.getAttribute('aria-invalid'), 'true')
      assert.equal(await guest.getAttribute('aria-describedby'), await page.locator('#guest .error').getAttribute('id'))
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'guest')
      // A native control is told by the browser's own validity.
      const validity = (id: string) =>
        page
          .locator(`#${id}`)
          .evaluate((element) => (element instanceof HTMLInputElement ? element.validationMessage : ''))
      assert.equal(await validity('mail'), 'This does not have the right form.')
      assert.equal(await validity('price'), 'At least 0.')
      assert.deepEqual(called, [])
      // Each is mended: the form sends, and no field is held for its old words.
      await guest.fill('Bo')
      await page.locator('#price').fill('4250')
      await page.locator('#mail').fill('bo@example.com')
      await page.locator('#send').click()
      await page.locator('.what').waitFor()
      assert.equal(await page.locator('.what').textContent(), 'desk 4250 open loud')
      assert.equal(called.length, 1)
      assert.equal(await validity('mail'), '')
      assert.equal(await guest.getAttribute('aria-invalid'), null)
      assert.deepEqual(said, [])
    })
  })

  test(`[32-2] a field with a dotted name fills a field of an object and starts from its record in values, Enter in a field of one line sends the form, and sendOnEnter={false} keeps it from sending, in ${engine}`, async () => {
    const { address, app } = await served('formed')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/homes`)
      assert.equal(await page.locator('#city').inputValue(), 'Izmir')
      await page.locator('#owner').fill('Ann')
      await page.locator('#street').fill('Kordon')
      await page.locator('#street').press('Enter')
      await page.locator('.home').getByText('Ann Izmir Kordon').waitFor()
      // Enter in the field of a form that says sendOnEnter={false} sends nothing; its button does.
      await page.locator('#tag').fill('blue')
      await page.locator('#tag').press('Enter')
      await new Promise((done) => setTimeout(done, 500))
      assert.equal(await page.locator('.home').getByText('blue').count(), 0)
      await page.locator('#sendTag').click()
      await page.locator('.home').getByText('Tag Bursa Long blue').waitFor()
      assert.deepEqual(said, [])
    })
    const rows: unknown[] = Object(await app.read({ from: 'homes' }, { as: 'system' }))
    const ann = rows.find((one) => Object(one).owner === 'Ann')
    assert.deepEqual(Object(ann).address, { city: 'Izmir', street: 'Kordon' })
  })

  test(`[32-2] a second send while busy does nothing, reset names the one field that is emptied, and a form filled and sent within a tenth of a second, as a password manager does, is sent, in ${engine}`, async () => {
    const { address, app } = await served('formed')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const called: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/_t/call/')) called.push(request.url())
      })
      await alive(page, `${address}/join`)
      // The fields are set as a password manager sets them, with no key pressed, and the form sent at once.
      await page.evaluate(() => {
        const form = document.querySelectorAll('form')[1]
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        const set = (name: string, value: string) => {
          const field = form.querySelector(`[name="${name}"]`)
          if (!(field instanceof HTMLInputElement)) return
          setter?.call(field, value)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }
        set('owner', 'Quick')
        set('secret', 'pass-word')
        set('city', 'Rize')
        form.requestSubmit()
        form.requestSubmit()
      })
      await page.waitForFunction(() => document.querySelectorAll('form')[1].getAttribute('aria-busy') === null)
      assert.equal(called.length, 1)
      // Only the field that reset names is emptied after the send.
      assert.equal(await page.locator('#otherSecret').inputValue(), '')
      assert.equal(await page.locator('#otherCity').inputValue(), 'Rize')
      assert.deepEqual(said, [])
    })
    const rows: unknown[] = Object(await app.read({ from: 'homes' }, { as: 'system' }))
    assert.ok(rows.some((one) => Object(one).owner === 'Quick' && Object(Object(one).address).city === 'Rize'))
  })
}

test('[32-2] with scripts switched off a form sends, goes where then names, an arrow among them, and after a failure shows the screen with the words under the field and what was typed, the password left out, and only in the form that was sent', async () => {
  const { address } = await served('formed')
  await inBrowser(
    'chromium',
    async (page) => {
      await page.goto(`${address}/join`)
      await page.locator('#owner input').fill('Cem')
      await page.locator('#secret').fill('w0rd-secret')
      await page.locator('#city').fill('Bursa')
      await page.locator('#send').click()
      await page.waitForURL(`${address}/homes/Cem`)
      assert.equal(await page.locator('h1').textContent(), 'Cem in Bursa on Side')
      // A failure: the screen again, with the words under the field that failed and what was typed.
      await page.goto(`${address}/join`)
      await page.locator('#secret').fill('w0rd-secret')
      await page.locator('#city').fill('Izmir')
      await page.locator('#send').click()
      await page.locator('#owner').getByText('This is needed.').waitFor()
      assert.equal(await page.locator('#city').inputValue(), 'Izmir')
      assert.equal(await page.locator('#secret').inputValue(), '')
      assert.equal(await page.locator('#otherOwner').getByText('This is needed.').count(), 0)
      assert.doesNotMatch(await page.content(), /w0rd-secret/)
    },
    { scripts: false },
  )
})

test('[05-4.18] [05-4.19] [05-4.20] a form posted to /_t/form/ with a hidden address of another site or of no screen is T0002, one from another site with the cookie of the visitor or with Origin: null is T0004, and a failure holds no secret', async () => {
  const { address } = await served('formed')
  const post = (body: Record<string, string>, headers: Record<string, string> = {}) =>
    fetch(`${address}/_t/form/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(body).toString(),
    })
  const fields = { owner: 'Dag', secret: 'never-sent', city: 'Mersin', 't-form': 'join', 't-version': '' }
  for (const at of ['//evil.example', '/nowhere/at/all'])
    assert.equal(Object(await (await post({ ...fields, 't-at': at })).json()).error.code, 'T0002', at)
  // A cookie of the engine, by its name: a page of another site that posts here sends it with the visitor's request.
  const cookie = 'tent_session.shop=a-planted-session'
  const tries: Record<string, string>[] = [{ cookie, origin: 'https://evil.example' }, { cookie }, { origin: 'null' }]
  for (const headers of tries) {
    const answer = await post({ ...fields, 't-at': '/join' }, headers)
    assert.equal(Object(await answer.json()).error.code, 'T0004', JSON.stringify(headers))
  }
  // A failure holds no secret: the secret field comes back empty.
  const failed = await post({
    secret: 'never-sent',
    city: 'Mersin',
    't-at': '/join',
    't-form': 'join',
    't-version': '',
  })
  assert.equal(failed.status, 422)
  assert.doesNotMatch(await failed.text(), /never-sent/)
  // The arrow of `then` is worked out by drawing the screen once more, with what the call answered.
  const worked = await post({ ...fields, 't-at': '/join' })
  assert.equal(worked.status, 303)
  assert.equal(worked.headers.get('location'), '/homes/Dag')
})

test('[32-2] a form of a version that is gone is run by the running version and goes back to t-at, and not where the then of the running version goes', async () => {
  const { address } = await served('formed')
  const answer = await fetch(`${address}/_t/form/join`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      owner: 'Fay',
      secret: 'x',
      city: 'Van',
      't-at': '/join',
      't-form': 'join',
      't-version': '0123456789abcdef0123456789abcdef',
    }).toString(),
  })
  assert.deepEqual([answer.status, answer.headers.get('location')], [303, '/join'])
})

/** Owners and their pets, and a screen with a form of each sort that is sent with no script. */
const pets = {
  'pets.ts': `import { change, input, link, query, table, text } from 'tentjs'

export const owners = table('owners', { columns: { name: text() }, access: { read: 'anyone', add: 'anyone' } })

export const pets = table('pets', {
  columns: { name: text(), owner: link('owners') },
  access: { read: 'anyone', add: 'anyone' },
})

export const allOwners = query('allOwners', { access: 'anyone', rows: owners.oldest('name') })

export const addPet = change('addPet', {
  access: 'anyone',
  input: { name: text(), owner: link('owners') },
  set: pets.add({ name: input('name'), owner: input('owner') }),
})
`,
  'petsScreen.tsx': `import { screen, read, useField, Form } from 'tentjs/ui'
import { addPet, allOwners } from './pets'

function Name() {
  const f = useField('name')
  return (
    <label>
      <input {...f.input} />
      {f.error && <span className="failed">{f.error}</span>}
    </label>
  )
}

export const petsScreen = screen('petsScreen', {
  path: '/pets',
  access: 'anyone',
  data: { owners: read(allOwners) },
  view: ({ owners, calls }) => (
    <main>
      <Form id="pet" call={addPet}>
        <Name />
        <select name="owner">
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="submit">Add</button>
      </Form>
      <p id="said">{calls.pet.error ? calls.pet.error.code : 'none'}</p>
      {owners.map((o) => (
        <Form key={o.id} id={'pet-' + o.id} call={addPet} with={{ owner: o.id }}>
          <Name />
          <button type="submit">Add for {o.name}</button>
        </Form>
      ))}
      <Form call={addPet}>
        <Name />
        <select name="owner">
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="submit">Add again</button>
      </Form>
    </main>
  ),
})
`,
}

/** The hidden fields of each form of a document, in their order, each as a record of its names. */
function formsIn(html: string): { hidden: Record<string, string>; failed: number }[] {
  return [...html.matchAll(/<form [^>]*>([\s\S]*?)<\/form>/g)].map((one) => ({
    hidden: Object.fromEntries(
      [...one[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)].map((field) => [
        field[1],
        field[2],
      ]),
    ),
    failed: (one[1].match(/This is needed\./g) ?? []).length,
  }))
}

test('[32-2] with no script a select over the rows of a link sends the row, a form inside a list names itself by its id, a form with no id names its place, and a failure fills calls.<id>.error and the one form that was sent', async () => {
  const { address, app } = await served('formed', {
    change: (folder) => {
      for (const [file, text] of Object.entries(pets)) writeFileSync(join(folder, file), text)
    },
  })
  const made: unknown[] = Object(
    await app.write(
      [
        { add: 'owners', values: { name: 'Ann' } },
        { add: 'owners', values: { name: 'Bo' } },
      ],
      { as: 'system' },
    ),
  )
  const [ann, bo] = made.map((one) => String(Object(one).id))
  const first = await (await fetch(`${address}/pets`)).text()
  assert.match(first, new RegExp(`<option value="${ann}">Ann</option><option value="${bo}">Bo</option>`))
  const forms = formsIn(first)
  assert.equal(forms.length, 4)
  // The forms with an id are named by it, and the last by its number among the forms of the draw.
  assert.deepEqual(
    forms.map((one) => one.hidden['t-form']),
    ['pet', `pet-${ann}`, `pet-${bo}`, '#3'],
  )
  const post = (fields: Record<string, string>) =>
    fetch(`${address}/_t/form/addPet`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 't-at': '/pets', 't-version': '', ...fields }).toString(),
    })
  const sent = await post({ ...forms[0].hidden, name: 'Rex', owner: bo })
  assert.equal(sent.status, 303)
  const rows: unknown[] = Object(await app.read({ from: 'pets' }, { as: 'system' }))
  assert.deepEqual(
    rows.map((one) => [Object(one).name, Object(one).owner]),
    [['Rex', bo]],
  )
  // A failure of the form with an id: its view reads it in calls.<id>.error, and its field shows the words.
  const failedFirst = await post({ ...forms[0].hidden, name: '', owner: ann })
  assert.equal(failedFirst.status, 422)
  const firstHtml = await failedFirst.text()
  assert.match(firstHtml, /<p id="said">T0002</)
  assert.deepEqual(
    formsIn(firstHtml).map((one) => one.failed),
    [1, 0, 0, 0],
  )
  // A failure of the form of the second row shows in that form alone, and so does one of the form with no id.
  const failedRow = await post({ ...forms[2].hidden, name: '' })
  assert.equal(failedRow.status, 422)
  assert.deepEqual(
    formsIn(await failedRow.text()).map((one) => one.failed),
    [0, 0, 1, 0],
  )
  const failedLast = await post({ ...forms[3].hidden, name: '', owner: ann })
  assert.deepEqual(
    formsIn(await failedLast.text()).map((one) => one.failed),
    [0, 0, 0, 1],
  )
})

/** A screen whose form holds controls that `useField` drives, which count each time they are drawn in the browser. */
const counted = `import { screen, useField, Form } from 'tentjs/ui'
import { book } from './functions'

function Counted(o: { name: string; field?: string }) {
  const f = o.field === undefined ? undefined : useField(o.field)
  if (typeof document === 'object') Reflect.set(globalThis, o.name, Number(Reflect.get(globalThis, o.name) ?? 0) + 1)
  return f ? (
    <label id={o.field}>
      <input {...f.input} />
      {f.error && <span className="error">{f.error}</span>}
    </label>
  ) : null
}

export const countedScreen = screen('countedScreen', {
  path: '/counted',
  access: 'anyone',
  view: () => (
    <Form id="counted" call={book}>
      <Counted name="GuestRead" field="guest" />
      <Counted name="MailRead" field="mail" />
      <Counted name="NoneRead" />
      <button type="submit" id="countedSend">Book</button>
    </Form>
  ),
})
`

test('[32-4] a send that the check of the browser holds back moves the focus to the first field that failed before anything is drawn, and draws that field alone, not the fields that did not change nor the rest of the form', async () => {
  const { address }: Served = await served('formed', {
    change: (folder) => writeFileSync(join(folder, 'counted.tsx'), counted),
  })
  await inBrowser('chromium', async (page) => {
    await alive(page, `${address}/counted`)
    await page.locator('#mail input').fill('ann@example.com')
    // The focus lands before the words of the failed check are drawn: the browser lays the page out once.
    await page.evaluate(() =>
      document.addEventListener('focusin', (event) => {
        // The press itself gives the focus to what was pressed: the field that takes it after is the one held.
        const name = event.target instanceof Element ? event.target.getAttribute('name') : null
        if (name === null || name === 'mail' || Reflect.get(window, 'focusedWith') !== undefined) return
        Reflect.set(window, 'focusedWith', [name, document.querySelectorAll('.error').length])
      }),
    )
    const counts = (): Promise<number[]> =>
      page.evaluate(() => ['GuestRead', 'MailRead', 'NoneRead'].map((one) => Number(Reflect.get(globalThis, one) ?? 0)))
    const before = await counts()
    await page.locator('#countedSend').click()
    await page.waitForFunction(() => Reflect.get(window, 'focusedWith') !== undefined)
    await page.locator('#guest .error').waitFor()
    const [focused, words] = await page.evaluate(() => Reflect.get(window, 'focusedWith'))
    assert.equal(focused, 'guest')
    assert.equal(words, 0, 'no words of the check stand yet when the focus lands')
    // Two frames on: the part that reads the failed field was drawn once, and neither the part that reads a field
    // that passed nor the part that reads none was drawn again.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined)))),
    )
    const after = await counts()
    assert.deepEqual(
      after.map((one, at) => one - (before[at] ?? 0)),
      [1, 0, 0],
    )
  })
})

/** A screen whose form calls a stub of `book` whose types tell each time they are read once a send began. */
const watched = `import { screen, useField, Form } from 'tentjs/ui'
import { book } from './functions'

const told = (name: string): void => {
  if (Reflect.get(globalThis, 'sending') === true) Reflect.set(globalThis, 'typeRead', name)
}
const input = new Proxy(book.input, {
  get: (target, name) => (told(String(name)), Reflect.get(target, name)),
  ownKeys: (target) => (told('the names'), Reflect.ownKeys(target)),
  getOwnPropertyDescriptor: (target, name) => (told(String(name)), Reflect.getOwnPropertyDescriptor(target, name)),
})
const watchedBook = { ...book, input }

function Guest() {
  const f = useField('guest')
  return (
    <label id="guest">
      <input {...f.input} />
      {f.error && <span className="error">{f.error}</span>}
    </label>
  )
}

export const watchedScreen = screen('watchedScreen', {
  path: '/watched',
  access: 'anyone',
  view: () => (
    <Form id="watched" call={watchedBook}>
      <Guest />
      <input name="mail" />
      <button type="submit" id="watchedSend">Book</button>
    </Form>
  ),
})
`

test('[32-4] a send of a form is checked by what the build made of its function: no type of the input is read at the send, and its words are those of the check', async () => {
  const { address }: Served = await served('formed', {
    change: (folder) => writeFileSync(join(folder, 'watched.tsx'), watched),
  })
  await inBrowser('chromium', async (page) => {
    await alive(page, `${address}/watched`)
    await page.evaluate(() => Reflect.set(globalThis, 'sending', true))
    await page.locator('#watchedSend').click()
    await page.locator('#guest .error').waitFor()
    assert.equal(await page.locator('#guest .error').textContent(), 'This is needed.')
    assert.equal(await page.evaluate(() => Reflect.get(globalThis, 'typeRead')), undefined)
  })
})

test('[32-4] the door refuses the value that the check of the browser holds back, sent by a program', async () => {
  const { app } = await served('formed')
  await assert.rejects(
    app.call(
      'book',
      {
        guest: 'Ed',
        mail: 'no mail',
        nights: 3,
        agreed: false,
        at: '2026-10-08T09:30:00.000Z',
        on: '2026-10-09',
        size: 'small',
        extras: [],
        price: -5,
        quiet: false,
      },
      { as: { kind: 'system' } },
    ),
    (error: unknown) => Object(error).code === 'T0002' && Object(Object(error).fields).mail === 'pattern',
  )
})
