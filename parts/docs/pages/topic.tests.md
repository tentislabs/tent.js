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

`app.make(table, count, (i) => values)` writes that many rows of a table, as the system, and answers them in order. A column that the function gives a value for, by the number of the row from 0, takes it. One that may be left out, has a default or is worked out by the engine is left out. Every other is filled with a sample of its type, `word.sampleOf`: a `choice` its first value, a `text` one of its own, a `number` its least, or 1 where none is stated, a `boolean` `false`, a `date` and a `day` the present one, and a `link` a row of its table that is made first. `app.make('orders', 50)` writes fifty orders with their customers made. A column of a kind it cannot fill, a `file`, is `code.T0002`: give it a value.

`app.as(caller).call(fn, input)` calls a function as that caller. `caller` is a caller, the id of a user, such as one the seed made, `'nobody'` or `'system'`. The id of a user is read from `users`, with its roles, and one that names no row is `code.T2103`. `fn` is the name of a function, or its definition. A value is handed as code holds it: a `Date` for a `date`. The call finds the function, checks its rule and its input, carries it out under the rules of the tables, and filters its answer, as a call from a page does. A call that fails refuses its promise with the `TentError`, whose `code` a test reads. A call by the name of a query, a change or an action is typed by the type list of the project, as `app.rows` is; what a flow answers is `unknown` to the type checker, so a test reads it field by field, `Object(answer).id`, or holds it whole with `assert.deepEqual`.

`app.as(caller).page(path)` answers what a request for that address answers, as that caller: `{ status, headers, html }`. A screen that needs a sign-in answers 302, with where it leads in `headers.location`, and an address that no screen fits answers 404. The HTML holds the drawing of the screen with its data, so a test reads the words of a row in it.

`app.session(caller)` makes a session for that user, as `sessions.start` does, with no request and no address of the app, and answers the line of its cookie, `tent_session.<the app's name>=<the token>`: every request that carries it is that user's through every step of the door, and an id that names no row of `users` is `code.T2103`. It is how a test makes a real browser a user, and what `app.browser({ as })`, `app.open(path, { as })` and `app.shot(path, { as })` stand on: see `topic.engine.web`. The walk of an app, which a person would take, signs in through the app's own sign-in screen instead.

A test caller exists in the program of the test alone.

## Only what a change touched runs again

`tent test` keeps what each test touched in `.tent/tests.json`, with how it ended, its time and its key: the functions, flows, screens, components, routes, commands and incoming calls it called or drew, the tables it read and wrote, also through `app.rows` and `app.make`, the services and models it called, the events it raised, and each address it asked, also one that answered "not found". The next run replays each test whose result stands on nothing that changed since it passed, as Bazel and Nx keep theirs, and runs the rest: a change of one function runs again the tests that touched it. A replayed test is printed as replayed, and never counted as passed. A result stands on more than what the test touched: every module of the project its program loaded, each word of the environment its code or the app's read, in any room, with its value, a copy of the whole environment reading every word, and each kept picture and kept text it held a page to, as it stood before the run. A test that failed, one that reached outside the program - a plain `fetch`, also of the test file itself, a service let through by `real`, a model that no test faked, a file read through `node:fs` or `require`, a connection to another host by any way the runtime gives (`fetch`, `WebSocket`, `node:http`, `node:http2`, `node:net`, `node:tls`, `node:dgram`), a lookup of a name of another computer, a pipe or a local socket that another program serves, a request of a page to another host, a program the test started that is no program of the runtime, a file of the project that a program it started read, a Python program - and the tests of a file that opens its app in `before`, are never replayed. `tent test --all` runs every test: run it on the main branch of a repository. `tent check` warns of each definition no test touched (`code.T9004`), and `tent impact` names the tests of each change from the same record.

## A failure that tells everything

A test that fails is printed with the line where it failed, what was expected and what came, and the last call it made before that line: whom as, with what, what it answered or the code that refused it, the rows it read, and each row it wrote as it was before and after, with its trace (`tent logs --trace <id>`) and the fix of that code. A failure of the app's own code names the definition and the line of its source. `tent test --json` holds the same as data, in `failures`. A refusal that `app.as(caller).call` answers carries `trace` and the facts of its call, `call`, as fields of its own; `app.called(work)` gives them for any piece of work of a test.

## No chance in a test

`testApp({ clock: 'held' })` gives an app whose clock stands still until the test moves it, with `app.clock.advance('3 days')` and `app.clock.set('2030-01-01T09:00:00Z')` (`option.testApp.clock`). Every number the app draws - `random()`, `token()`, `step.random()`, the ids of its rows, and `Math.random()` in its own code - comes from the test's random seed, the name of the test where `randomSeed` names none (`option.testApp.randomSeed`): the same test draws the same numbers on every computer, and a failing test prints its seed, so it runs again exactly. `Date.now()` and `new Date()` in the app's own code read the app's clock, in the room of the program, the test room and the held room, while the test's own code reads the time of the system. A worker with `separate: true`, a Python program and the browser's own timers stand outside the clock and the seed: a test on a held clock that opens a page is named in the output as reaching outside the held clock.

## Tests made from the declarations

`tent test --declared` makes tests from what the app declares, with no line written by hand: what each caller gets of each definition, the edges of each input, and each form: see `topic.tests.declared`.
