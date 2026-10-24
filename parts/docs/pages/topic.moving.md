# Moving an app to another computer

An app is two things: its bundle, which a build writes and a publish brings, and its data folder. Moving an app is copying both to another engine and starting it there; the framework has no command of its own for it, and needs none.

## What the data folder holds

What the app is, in forms that other tools read too (`topic.leaving`): `data.db`, with `tenants/` beside it where a table keeps a file for each tenant; `files/`; `versions/`, for the runs that wait and the pages that are open; `history.db`; `settings.live`; and `secrets.live` with its key, which is `secret.key` or the value of `TENT_SECRET_KEY`. Without that key neither the secrets nor a `sealed` column opens. On test data the `.test` files stand in their place.

What starts anew on the other engine, and is not carried unless it is copied: `logs.db`, `backups/`, `evals/`, `shots/`, and a file that a machine kept as lost. What an engine makes again by itself: `cache/`, `build/`, `certs/`, `engine.json` and `asleep.json`.

## Why the first engine is stopped first

Two engines that run copies of one data folder under one name are two apps. Each answers what it is asked, each fires its own schedules and takes up its own waiting runs, and each writes what the other never sees: a mail of a schedule is sent twice, and a write answered by one is lost on the other. Nothing in the data can tell them apart. So the first engine is always stopped before the copy is started, and is never started again on that folder once the copy runs.

## With the app stopped

1. Close the app to its callers: with its `onRequest`, or wherever its names point.
2. Take a last backup from the running engine, once `tent runs` shows no run at work: `tent data backup`, with `--whole` where a table keeps a file for each tenant.
3. Stop the first engine.
4. Copy `files/`, `versions/`, `history.db`, `settings.live` and `secrets.live`, with the backup, to the other computer.
5. Start the other engine with the same key of the secrets, on the same version, brought as a bundle, and put the backup in place there through it with `tent data restore`.

```sh
tent data backup --data /srv/shop
tent data restore /srv/shop/backups/data-2026-10-13T05-10-42-345Z.db --data /srv/shop
```

What was written after the backup is not in it: that is why the app is closed to its callers first.

## With no answered write lost

1. Start the other engine as a near reader of the first, with the same key of the secrets: `tent start --reads <address> --key-from <file>`. It is handed the whole data, every loadable version, every file, the settings and the history. No secret is copied to a reader, so its secrets are set there.
2. When `tent machines` shows it current, stop the first engine.
3. Make the second the writer: `tent take-over`.

Between the stop and the take-over the app does not answer. Where the names of the app point, and when, is the business of whoever runs the engines.

## See also

`command.data`, `command.start`, `command.machines`, `command.take-over`, `topic.engine`
