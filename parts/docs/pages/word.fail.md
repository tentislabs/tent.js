# `fail`

Ends a query, a change or an action with an error that the caller sees, under a code of the builder's own.

## Example

```ts
fail('not-charged', 'This order was never charged.')
```

## Options

| Option | Means |
|---|---|
| `option.fail.fields` | What the error tells beside its words, each by its name. |

## Returns

It never returns: it throws a `TentError` with the code, the words and the fields it was given.

## Errors

`code.T0013`: a code of the form of a code of the framework, a `T` and four digits, which a caller would read as the framework's own. A code of your own is a lowercase word with letters, digits and hyphens.

`code.T0027`: a code or words that are no text.

## See also

`topic.errors`
