# `testApp`

A fresh copy of the app for a test, in the program of the test itself: the project built, opened in an engine of its own on empty temporary data, in the mode `test`, with `seed.ts` applied.

## Example

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'

test('a customer cannot mark an order paid', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const [order] = await app.rows('orders')
  await assert.rejects(app.as(maya).call('markPaid', { order: order.id }), { code: 'T3101' })
  await app.close()
})
```

## Options

| Option | Means |
|---|---|
| `option.testApp.clock` | A clock of the app that stands still until the test moves it. |
| `option.testApp.folder` | The folder of the project the test app is built from. |
| `option.testApp.randomSeed` | The seed of every number the app draws in the test. |
| `option.testApp.real` | The services that are let through to where they are. |
| `option.testApp.room` | Where the code of the app runs. |
| `option.testApp.secrets` | The values of secrets, by their names. |

## Returns

A promise of the test app: every member of an app of the engine (`topic.engine`), and the helpers of a test beside them - `user`, `as`, `rows`, `make`, `write`, `browser`, `open`, `fake`, `mark`, `back`, `clock` with `advance` and `set`, `called`, `settled`, `restart`, `reader`, `kill` and `close` among them, each on `topic.tests`. It uses the project's `engine.ts`, but for `mailer` and `clock`, which `app.mailbox` and `app.clock` take the place of. Every secret that a definition names has a value: the text `test-<NAME>`, or what `secrets` gives. A test app that a test left open is closed once its test file has run.

## Errors

A project that does not build opens no test app: the promise is refused with the first error of the build, and its message lists them all.

## See also

`topic.tests`, `word.expect`, `word.evals`, `command.test`
