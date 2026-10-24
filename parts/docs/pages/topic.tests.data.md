# Rows, marks and the clock

`app.rows(table)` answers every row of a table, with full access. A table is named by its name or by its definition. Named by its name, the rows are typed by the type list of the project, as a `call` by a name is: after `const [order] = await app.rows('orders')` the type checker knows the columns of `order`, and refuses one that the table does not hold.

`app.mark()` takes a mark, the data as it is now, and `app.back(mark)` puts the data back as it was then. Both answer a promise. A mark is taken back to as often as a test asks.

```ts
const mark = await app.mark()
await app.as(maya).call('addOrder', { title: 'A shelf' })
await app.back(mark)
```

`app.clock.advance('3 days')` moves the time of the app forward, and calls each timer of the app that falls due on the way, in the order of their moments. The time of a test app goes on by itself as the time of the system does, and `advance` moves it beside that. A length that does not read, and one that moves the time back or not at all, is `code.T0027`.

`app.runs` reads, waits for, answers and stops the runs of the flows, as `app.runs` of the engine does. `await app.settled()` answers once no run is queued or working: each is done, failed or stopped, or waits for a time, an event or a person. So a test starts or sets off its runs, moves the clock, and settles before it looks:

```ts
await app.call('placeOrder', { title: 'A shelf' })
await app.settled()
app.clock.advance('3 days')
await app.settled()
assert.equal(app.mailbox.length, 1)
```

`app.restart()` closes the engine and opens it again on the same data, as after the program was stopped between two steps.

## A tenant table

`app.rows(table, { of })` answers the rows of one tenant of a tenant table, by the id of the tenant. Without `of` it answers the rows of every tenant, one tenant after another. The examples from here on are of an app with a table `teams` and a tenant table `tasks` by its column `team`, whose seed makes the team North with one task.

```ts
test('the tasks of one team', async () => {
  const app = await testApp()
  const [north] = await app.rows('teams')
  const south = await app.write([{ add: 'teams', values: { name: 'South' } }], { as: 'system' })
  assert.equal((await app.rows('tasks', { of: north.id })).length, 1)
  assert.equal((await app.rows('tasks', { of: Object(south)[0].id })).length, 0)
  assert.equal((await app.rows('tasks')).length, 1)
  await app.close()
})
```

## Many machines

`app.reader()` answers a reader of the test app in the same program, joined to it with no network. It is a test app itself, on the clock of its writer: a beat and its answer pass when the test moves the clock, and a moment later. `app.reader({ far: true })` makes it a far reader. A reader also has `hold()` and `release()`, which hold back everything its link carries and let it go again, `cut()` and `join()`, which close its link and open it again, and `takeOver()`, which makes it the writer.

```ts
test('a reader holds what its writer wrote', async () => {
  const app = await testApp()
  const reader = await app.reader()
  await app.write([{ add: 'teams', values: { name: 'South' } }], { as: 'system' })
  while (!reader.at().current || reader.at().n < app.at().n) {
    app.clock.advance('1 second')
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.deepEqual((await reader.rows('teams')).map((team) => team.name).sort(), ['North', 'South'])
  await app.close()
})
```

`app.kill()` ends a machine as a killed program would: nothing more is committed, answered or sent. A call that is under way is refused to its caller with `code.T0029`, and the data folder is left as a kill leaves it. `app.restart()` opens the folder again, after `kill()` and after `close()` of a reader. `app.restart({ reads: other })` opens it as a reader of that test app, and `app.restart({ at: mark })` first puts the data of that mark in place, as a disk that lost its last writes.

```ts
test('a reader takes over, and the old writer comes back as its reader', async () => {
  const app = await testApp()
  const reader = await app.reader()
  while (!reader.at().current) {
    app.clock.advance('1 second')
    await new Promise((done) => setTimeout(done, 20))
  }
  await app.kill()
  // A reader takes over once it has not been current for `limits.behind`, five seconds.
  while (reader.at().current) {
    app.clock.advance('1 second')
    await new Promise((done) => setTimeout(done, 20))
  }
  await reader.takeOver()
  assert.equal(reader.role, 'writer')
  await app.restart({ reads: reader })
  assert.equal(app.role, 'reader')
  await reader.close()
  await app.close()
})
```
