# Services, calls coming in, keys and the command line

The helpers of a test app for services, calls coming in, keys and the command line, each with what it does:

| Helper | Does |
|---|---|
| `app.fake(service, { call: answer })` | Stands in for an outside service: each entry is the answer of a call, or a function of its input that gives it or throws. For an outside MCP server each entry is the answer of a tool, by its name, and the input is held to the fields that `mcp.lock.json` holds for that tool. `app.fake(service).sent` is what it was sent, in order: `[{ call, input, once }]`. A fake skips the request, the limits and the tries, and keeps the check of the sign-in: a faked service with `oauth` still needs a connection |
| `testApp({ real: ['stripe'] })` | Lets the services it names through. Every other service that a test did not fake fails its calls with `code.T7115`, so a test reaches no outside service by accident |
| `app.connection(user, service, { account })` | Writes a connection of that user to a service with `oauth`, as a connect would |
| `app.incoming(name, { body, headers, sign })` | Sends a call to an `incoming`, signed the way its scheme asks with the secret the test app holds, unless `sign` is false, and answers the standard response |
| `app.key({ scopes, roles, user, asks })` | Makes a key, and answers `{ caller, key }`: the caller for `app.as(caller)`, and the key for a request |
| `app.cli(words, { as, input, person, answers })` | Runs the app's own command line with those words, as `tent cli` does on this computer, and answers `{ code, out, err }`. `as` is the id of a user, `'nobody'` or `'system'`, as `--as` of `tent cli`, and `'system'` where it is left out. `input` is what the standard input holds, `person: true` makes the terminal one a person sits at, and `answers` are the lines that person types |

```ts
test('the forecast is read from the weather service', async (t) => {
  const app = await testApp()
  t.after(() => app.close())
  const weather = app.fake('weather', { today: ({ city }) => ({ temp: city === 'Oslo' ? 4 : 20 }) })
  assert.deepEqual(await app.as('system').call('forecast', { city: 'Oslo' }), { temp: 4 })
  assert.deepEqual(weather.sent.map((one) => one.call), ['today'])
})
```

A key is tested where it is sent: `app.key` answers the key, and a request that carries it as `Authorization: Bearer <key>` passes every step of the door, as one of a program does. `app.as(caller)` takes the caller that `app.key` answers; `app.cli` acts for a user, nobody or the system, so the command line with a key is tested against a running app, as a person runs it: `tent cli <its address> <command>` with the key in `TENT_KEY` and the address in `TENT_AT` (`command.cli`).

```ts
const { key } = await app.key({ scopes: ['ticketList'] })
const answer = await app.request(
  new Request('http://localhost/api/ticketList', { headers: { authorization: `Bearer ${key}` } }),
)
assert.equal(answer.status, 200)
```
