# A driver of your own

A test may drive a browser of its own, with the cookie of a session for its user set into it (`app.session`). These are then the test's own:

- **The browser.** It is the driver's, fetched as its own documents say: `tent add @playwright/test`, then `npx playwright install chromium` in the folder of the project fetches the Chromium that this version of Playwright drives, and `npx playwright install chromium firefox webkit` the three engines. `app.open` uses the builds that the engine pins, and never these.
- **The address.** A test app answers on no port: every request of `app.open` and `app.browser` reaches it in the program of the test. A driver reaches an app over a port instead: one that the test starts with `tent start --mode test --seed --port 0`, which names its address on the standard error and is ended by its number (`command.start`), or one that a program of the test opens with `createEngine({ port: 0 })` (`topic.engine`), whose `app.session` makes the cookie. Such a program fakes a model by `makers.providers`, a provider of its own under the name of the model's provider (under "A faked model", above). A walk of an app that a person would take signs in through the app's own sign-in screen.
- **A microphone.** `app.open` gives a page none. A test of `useMicrophone` starts its own Chromium with the browser's own flags for a recording that is no device, `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture=<a .wav file>`, so the page hears that file. A Firefox of its own takes the preferences `media.navigator.streams.fake` and `media.navigator.permission.disabled`, both `true`, and hears a tone in the place of a file. Playwright's WebKit on Windows opens no microphone, so a step that speaks is walked in the other two there.
- **Motion.** A picture of `page.picture()` is taken as the page stands at that moment: a step waits for what it set off by fact, and for no transition, animation or view transition to end. A driver of its own asks for less motion with `reducedMotion: 'reduce'` of the browser's context in Playwright, so a page whose CSS keeps its motion inside `@media (prefers-reduced-motion: no-preference)` is pictured at rest.

Such a test finds a thing as a person does: by what it is and by its words, and never by a class or an id of the page, which are the page code's own and may change.

| To find | By | With Playwright |
|---|---|---|
| What is pressed | Its role, `button` or `link`, and its words or its `aria-label` | `page.getByRole('button', { name: 'Mark paid' })` |
| A field | Its label: the `<label>` around it or named by `for`, or the label that `useField` gives from its type | `page.getByLabel('Total')` |
| A form | The `aria-label` of the `Form` | `page.getByRole('form', { name: 'New order' })` |
| A heading, a text | Its words | `page.getByRole('heading', { name: 'Orders' })`, `page.getByText('Ada Lovelace')` |
| The words of a failure | The field they belong to: they describe it | `page.getByLabel('Total')` is described by them: `await expect(page.getByLabel('Total')).toHaveAccessibleDescription('This is needed.')`. An error that names no field is an `alert` after the last field of its form |
| A field in error | Its state | `aria-invalid` is `true` on it |

`expect` in the table is of the package `@playwright/test`, which a project installs for it: `tent add @playwright/test`. The driver alone, `playwright-core`, holds every `page.getBy...` of the table and no `expect`. With it a test reads the words of a failure itself, through the field that they describe, and holds them with `node:assert`:

```ts
const total = page.getByLabel('Total')
const words = await total.evaluate(
  (field) => document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent,
)
assert.equal(words, 'This is needed.')
assert.equal(await total.getAttribute('aria-invalid'), 'true')
```


A page is sent as HTML and comes alive when its code has loaded. A press before that is lost, so a test waits for the mark first: `await page.locator('#tent[data-t-alive]').waitFor()` (`topic.screens`). No header and no field of a request of the web names one.
