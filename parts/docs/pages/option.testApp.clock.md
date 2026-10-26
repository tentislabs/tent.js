# `clock` of `testApp`

A clock of the app that stands still until the test moves it.

## Value

`'held'`: the time of the app stands at the moment the test app was opened, and moves only with `app.clock.advance('3 days')` and `app.clock.set('2030-01-01T09:00:00Z')`, as the fake timers of Jest, Vitest and Sinon stand. `Date.now()`, `new Date()` and `now()` in the app's own code read it, in the room of the program, the test room and the held room, while the test's own code reads the time of the system. A timer of the app comes due only as the test moves the time past it, and `app.settled()` moves it to the timer that is due first where nothing else is under way. Left out, the clock runs on with the time of the system, and `advance` and `set` move it beside that.

A worker with `separate: true`, a Python program and the browser's own timers run on the time of the system: the held clock does not reach them.

## Example

```ts
const app = await testApp({ clock: 'held' })
app.clock.set('2030-01-01T09:00:00Z')
await app.as(maya).call(placeOrder, { item: 'tent' })
app.clock.advance('3 days')
await app.settled()
```

## Errors

`code.T0027`: a length or a moment that does not read.

## See also

`word.testApp`, `option.testApp.randomSeed`, `topic.tests`
