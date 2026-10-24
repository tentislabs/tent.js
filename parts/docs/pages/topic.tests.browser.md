# A test in a real browser

`app.open(path, { as, size, dark, language, engine })` opens an address of the app in a real browser, and answers the page once it has landed. `as` makes the browser that user, by the cookie of a session that `app.session` made, set into the browser before its first request, and the page is the visitor's where it is left out. `size` is the window, `[390, 844]` for a phone, and 1280 by 800 where it is left out. `dark` asks for the dark setting of the device, which the project's CSS reads, and `language` names the language the browser asks for. `engine` is `'chromium'` where it is left out, driven through its own channel; `'firefox'` and `'webkit'` are driven through the WebDriver BiDi standard. Where an engine does not speak it, the opening fails with `code.T0016` marked as not run, and `tent test` names the test as not run, never as passed. So is WebKit wherever no build of it that the engine pins has a driver of WebDriver BiDi: a test never drives a WebKit of the computer. Chromium and Firefox are the builds that the engine pins, the same on every computer: the ones the tool of tests Playwright installed at those versions, or else fetched the first time a test needs them, and never a browser of the computer. The browser reaches nothing but the app: every other request it makes goes through the guarded fetch, under the rules of the mode `test`.

```ts
test('a customer adds an order', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: [] })
  const page = await app.open('/orders', { as: ada })
  await page.type('title', 'A shelf')
  await page.press('Save')
  const [shelf] = await app.rows('orders')
  assert.equal((await page.block(`order-${shelf.id}`)).text, 'A shelf')
  await app.close()
})
```

A step finds what it names by what the screen calls it, never by a class or a place of the page, so a test outlives a change of the layout:

| Step | Finds |
|---|---|
| `page.field(name)` | The field that a form sends under that name, or else the field a screen reader names so, by its label |
| `page.press(words)` | The press, the link or the button with those words or that `label`, and presses it as a person does |
| `page.block(id)` | The element of that `id` on the page |
| `page.text(words)` | The one element that shows exactly those words |
| `page.say(message)` | Sends a message in the chat screen of an agent, and answers when its turn has ended |
| `page.type(field, text)` | Puts the text into the field in the place of its words, as a person types it |
| `page.pick(field, choice)` | Picks an option of a list, a button of a group by its value or its words, or sets or unsets a box with `true` or `false` |
| `page.upload(field, files)` | Hands a field of files those files: `{ name, bytes, kind }`, or a list of them |
| `page.back()` | Goes one step back, as the back button of the browser does |
| `page.reader()` | What a screen reader hears of the page: each thing with its role, its name and its state, one on a line |
| `page.picture()` | A picture of the page, as the bytes of a PNG file. `{ full: true }` takes its whole height |

`app.close()` ends the browser of every page the test opened. `field`, `block` and `text` answer what they found: `{ role, name, text, value, checked, disabled }`. A name that finds nothing fails at once with `code.T0001`, and one that finds two with `code.T0002`: each says what it looked for and what the screen holds, its presses, its fields and its elements with an `id`.

**A step waits by fact.** It answers when what it set off has truly landed: every call it made was answered, every live query the page watches holds the answer to the newest write, a move drew its screen and its transition between views ended, and the page is alive. So a write that a test made with `app.write` is on the page by the next step, and no test waits for a length of time. A step answers what the page holds once it has landed, and follows nothing that changes after it: a value that goes on changing, as an answer that a run writes while it works, is read again by each step that asks for it after, `page.block('answer')`, as it then stands. A step that never lands fails after `limits.testStep` of `project`, 10 seconds where it is left out, with `code.T0008`, which names what it was still waiting for. So does a step whose browser does not answer, whatever the page holds: one held by a question of the browser's own, as `alert` asks, fails so, and the test goes on.

**Every caller waits the same way.** `app.as(caller).call`, a tool of `app.mcp(...).call` and `app.cli` answer once every page the test opened holds what they wrote, as a step of a page does: a test that calls the API with a key, an MCP tool with a grant and the command line finds each row on the page at its next step.

**A chat with an agent.** `page.say('Where is my order?')` types the message into the field `message` of a chat screen, presses Enter as a person does, and answers once the turn of the run it started has ended: `{ run, state, text, steps, asks }`, where `steps` are the steps of the run with their states and `asks` the steps that wait for a person. The conversation is on the page at the next step. A turn has ended where its run is done or failed, or waits in a step of the engine's, an ask of a tool or a question of the model, which `say` answers with `state: 'waiting'`, and a test then answers with `app.runs.approve`. A run whose own work waits for something else, as a driver of your own that waits for a row of the app, is still running, and `say` fails with `code.T0008` after `limits.testStep`: such a turn is started with `page.type('message', words)` and `page.press('Send')`, and the test reads what the page shows at its next steps.

**The clock.** `app.clock.advance('3 days')` moves the time of every page the app has open, and of every page it opens later, with the time of the app: a screen that says "ends in 3 days" is tested by moving three days, and is drawn again at once.

**When a step fails** the test keeps what the page held under `results/tests/<the name of the test>/` of the folder the test runs in: `picture.png`, the page as it stood; `console.txt`, what it wrote to its console and threw; `reader.txt`, what a screen reader heard; and `traces.txt`, the trace of every call the page made, which `tent logs --trace <id>` opens. The failure names the folder. It is no part of the project: the `.gitignore` that `tent new` writes leaves it out, and a project made another way names `results/` in its `.gitignore` too.

**Pictures and what a reader hears.** `expect` of `tentjs/test` holds a page to what the project keeps of it:

```ts
import { expect, testApp } from 'tentjs/test'

test('the orders look as they did', async () => {
  const app = await testApp()
  const page = await app.open('/orders', { size: [390, 844] })
  await expect(page).looks('orders')
  await expect(page).heard('orders')
  await app.close()
})
```

`looks(name, { share })` takes a picture of the page and holds it against `tests/looks/<engine>/<name>.png` of the project: a pixel differs where one of its four numbers differs by more than 8 of 255, and the picture passes where no more than `share` of its pixels differ, one in a hundred where it is left out. `heard(name)` holds what a screen reader hears, as `page.reader()` answers it, against `tests/heard/<engine>/<name>.txt`. Where nothing is kept yet, and where the page differs, the step fails as not approved and writes the new one beside, as `<name>.new.png` or `<name>.new.txt`. Look at it, and keep the new ones with `tent test --looks update`.

**One part alone.** `app.open(Badge, { props: { label: 'New' } })` opens the component `Badge` alone, drawn with those props and with nothing of a screen around it, so a part is tested as it is. The props are held to the types it declares, and one that does not fit is `code.T0002`. Only the mode `test` draws a part alone: in development and on live data the address answers 404.
