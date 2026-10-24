# `settings`

The values of the settings that the project states, each under its name and of its type. A setting is a value that whoever runs the app may set, with no build.

## Example

```ts
import { anyone, project, query, settings, text } from 'tentjs'

export const shop = project('shop', {
  settings: { shopName: { type: text({ default: 'The shop' }), public: true } },
})

export const shopName = query('shopName', {
  access: anyone('the name of the shop stands on every page'),
  output: text(),
  run: () => settings.shopName,
})
```

## Members

| Member | Is |
|---|---|
| `settings.<name>` | The value of that setting: what was set for it, or the default of its type where nothing was set, or nothing where its type has no default |

In a call a setting is its value. Where a definition is being made, as in `rows:` and `set:`, it is the record `{ "setting": "<name>" }`, which is worked out when the definition is carried out.

**Setting one.** `tent settings set <name> <value>` sets a value, held to the type of the setting, on test data, and with `--live` on live data: see `command.settings`. The values are kept in the data folder, in `settings.test` and `settings.live`, not encrypted. The modes `development` and `test` read the test file, and `live` the live one. A running engine uses a new value at once: the next read of the setting answers it, and every live query is run again, since a query may read one.

**Public settings.** A setting that states `public: true` reaches every page: a view is handed them as `settings`, and `hook.useSettings` answers them. Any other setting stays on the server.

## Errors

`code.T0013` when a setting is read with an engine in the slot and no call under way, as in a maker.

## See also

`word.project`, `command.settings`, `handle.secrets`, `hook.useSettings`, `handle.log`
