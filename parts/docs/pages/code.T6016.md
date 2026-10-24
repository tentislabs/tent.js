# T6016 needs-an-engine

A screen that calls a function was exported, and an exported page has no engine to call where none stands behind its address. A warning: the screen is written all the same.

## Details

`tent export` warns of each screen that calls a function: through `useCall`, a `Form`, or an entry of `data` that does not wait. The finding names the functions.

```tsx
<Form call={addNote}>           // T6016 in an export: addNote is called by the engine
```

Served by a plain host of files with no engine behind it, such a page shows what it was exported with, and a press that needs a call fails at once with `code.T0001`. Served with the engine behind the same address, the call works as in a served app.

## The fix

Serve the export with the engine behind the same address, so that the host sends what it holds no file for on to the engine. Or leave the call out of a screen that is meant for a site of plain files.

## See also

`command.export`, `topic.engine`
