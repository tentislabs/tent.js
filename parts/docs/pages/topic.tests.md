# Tests of an app

`tentjs/test` gives a test a fresh copy of the app, in the program of the test itself. A test is a file under `tests/`, written for the test runner of the runtime, `node:test`, with `node:assert`. `tent test` runs every `.ts` and `.tsx` file under `tests/`, in its folders too, each as a program of its own in the folder of the project, but the files that end in `.ai.ts`, which `tent test --ai` runs alone (`command.test`): so a helper that tests share, as a fake, lies outside `tests/`, in a folder such as `fakes/`, and a test imports it from there.

## A test app

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

`testApp()` builds the project of the folder the test was started in, opens it in an engine of its own on empty temporary data, in the mode `test`, and applies `seed.ts`. `testApp({ folder })` names another project. A project that does not build opens no test app: the promise is refused with the first error of the build, and its message lists them all. `app.close()` closes the app and its engine and removes the temporary data. An app that a test left open, because it failed before its `close()` or never called it, is closed for the test once its test file has run, so a test that fails still ends. A test app holds every member of an app of the engine too, `app.request` among them: see `topic.engine.web`.

## Callers

`app.user(values)` adds a row to `users`, as the system, and answers a caller: `{ kind: 'user', user: { id, roles } }`. An app with no `users` table fails with `code.T0014`.

`app.make(table, count, (i) => values)` writes that many rows of a table, as the system, and answers them in order. A column that the function gives a value for, by the number of the row from 0, takes it. One that may be left out, has a default or is worked out by the engine is left out. Every other is filled from its type: a `choice` its first value, a `text` one of its own, a `number` its lowest, a `boolean` `false`, a `date` and a `day` the present one, and a `link` a row of its table that is made first. `app.make('orders', 50)` writes fifty orders with their customers made. A column of a kind it cannot fill, a `file`, is `code.T0002`: give it a value.

`app.as(caller).call(fn, input)` calls a function as that caller. `caller` is a caller, the id of a user, such as one the seed made, `'nobody'` or `'system'`. The id of a user is read from `users`, with its roles, and one that names no row is `code.T2103`. `fn` is the name of a function, or its definition. A value is handed as code holds it: a `Date` for a `date`. The call finds the function, checks its rule and its input, carries it out under the rules of the tables, and filters its answer, as a call from a page does. A call that fails refuses its promise with the `TentError`, whose `code` a test reads. A call by the name of a query, a change or an action is typed by the type list of the project, as `app.rows` is; what a flow answers is `unknown` to the type checker, so a test reads it field by field, `Object(answer).id`, or holds it whole with `assert.deepEqual`.

`app.as(caller).page(path)` answers what a request for that address answers, as that caller: `{ status, headers, html }`. A screen that needs a sign-in answers 302, with where it leads in `headers.location`, and an address that no screen fits answers 404. The HTML holds the drawing of the screen with its data, so a test reads the words of a row in it.

`app.session(caller)` makes a session for that user, as `sessions.start` does, with no request and no address of the app, and answers the line of its cookie, `tent_session.<the app's name>=<the token>`: every request that carries it is that user's through every step of the door, and an id that names no row of `users` is `code.T2103`. It is how a test makes a real browser a user, and what `app.browser({ as })`, `app.open(path, { as })` and `app.shot(path, { as })` stand on: see `topic.engine.web`. The walk of an app, which a person would take, signs in through the app's own sign-in screen instead.

A test caller exists in the program of the test alone.
