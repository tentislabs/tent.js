# History with an engine and on a server

This page says how the history works with an engine and on a server, and the errors it answers.

## With an engine

A program that runs an app and keeps its history hands the engine two things with `engine.give`, as `tent dev` does: the admin command `history`, so that a command of this computer reaches the history that the program holds open, and its share of the daily upkeep.

```ts
engine.give('admin', 'history', { run: (app, args) => answer(args) }, app)
engine.give('upkeep', 'history', { daily: () => void history.tidy(Date.now(), { kept }) }, app)
```

An admin command that was given stands in front of the engine's own of that name, and passes what every command of the channel passes. A share of the upkeep is carried out when it is given and then every `upkeepEvery` of the project, 1 day where none is stated. What it throws is written to the log, and stops nothing. With no app named, a thing is given for every app of the engine.

After going back, the data follows the files with `app.switch(version, { back: true })`: a table and a column that was renamed since, with `was`, takes its old name again with its values, and a table and a column that the data holds and the older version does not know is retired with no statement. Nothing is dropped, and a later switch to a version that knows it revives it with its values. `app.facts(description, { back: true })` says, with nothing changed, what such a switch would be refused for: `tent dev` asks it before it writes the files of a point.

## On a server

`tent start` keeps a history beside the data of the app it runs, and puts it behind the addresses of publishing with `serveSync(engine, app, history)` of `tentjs/publish`: `/_t/sync/have`, `/_t/sync/blobs` and `/_t/sync/points`, each called with a key that holds a right (`code.T9104`). `push` and `pull` of `tentjs/publish` are what `tent push` and `tent pull` stand on. A program of its own serves addresses of its own the same way, with `engine.serve`, and the door does its part for them: the size of each request, a key that holds one of the rights it asks for, its count, its time, and the row of the log.

```ts
engine.serve(app, '/_t/mine', { right: () => ['mine'], size: () => 65_536, perMinute: 600, time: 10_000 }, async ({ request, key }) =>
  new Response(JSON.stringify({ ok: true, value: key.id })),
)
```

A key's rights are any words: a key made with `keys.add({ name, rights: ['mine'] })` is a caller there and nobody at every other address. Over anything but a secure connection such addresses are not found, but for this computer's own names and in an app that was opened with `insecure`.

What each point changed against its first parent is kept with it when it is recorded, and with its description when it is marked: `compare` of a point and its first parent reads it, and works nothing out again. That is what the server holds the paths of two pushes against.

## Errors

`code.T9107` for a point or a blob that is not there, for a point that was dropped where its files are asked for, and for what another history sent that does not fit its id. `code.T9101` from `merge` for a side that is unsettled. `code.T9102` from `settle` while what a merge left is there. `code.T0002` from `branch` for a name that cannot name one. `code.T0013` from `back` and `write` for a file that would be written over what no point holds or through a link, and from `exportGit` on a computer with no `git`, and for a folder that holds what no export wrote.

## See also

`command.history`, `topic.source`
