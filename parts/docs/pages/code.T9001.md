# T9001 missing-message

A language file lacks a key that another language has. A warning: the page shows the message of the default language in its place.

## Details

Every language of `project.languages` gives each key that any of them gives. The finding names the key and the language that lacks it, at its language file.

```ts
// messages/en.ts
export default messages('en', { orders: { title: 'Open orders', empty: 'None yet' } })
// messages/tr.ts
export default messages('tr', { orders: { title: 'Açık siparişler' } })   // T9001: `tr` has no message for orders.empty
```

The keys that start with `tent.` are the framework's own: a language that does not give one uses the English one, and they are never T9001.

## The fix

Give the key in the language file of that language.

## See also

`option.project.languages`, `word.message`, `code.T9003`
