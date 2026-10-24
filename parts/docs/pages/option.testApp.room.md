# `room` of `testApp`

Where the code of the app runs in the test.

## Value

`'apart'` runs it in the test room, a thread of its own with 512 MB, which crosses every call as a room apart does. `'program'` runs it in the program of the test. Left out, the room of the program, unless the run states `TENT_ROOM=apart`, which `testApp` alone reads, and which `tent test --room apart` states for a whole run.

## Example

```ts
const app = await testApp({ room: 'apart' })
```

## See also

`word.testApp`, `adapter.Room`, `command.test`
