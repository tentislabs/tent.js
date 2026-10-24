# T0018 cannot-open

The data cannot be opened. The app does not open.

## Details

| The case | What it names |
|---|---|
| The store is older than the engine needs | The version of the store, and 3.51.3, the oldest SQLite that the data is opened with |
| The data file was made by a newer engine | The shape number of the file, and the one that this engine knows |
| A definition is tied to SQLite and the store has no raw SQL | Each definition that uses `db.sql` |
| The app was built for a newer engine of the same major version than the one that runs it, as `app.needsEngine` of its description says | The engine it needs, and this one: the version to update to |

The store that was opened for the look is closed again, and nothing says that an engine runs on the data.

## The fix

Run the app with the runtime that the framework ships with, and with an engine as new as the one that wrote its data. On a store of your own that has no raw SQL, write the definitions that use `db.sql` with plans. An app built for a newer engine opens once the player is as new: `tent update`.

## See also

`adapter.Store`, `code.T0011`, `command.update`
