# `caller`

Stands for the caller, in a form written with values. `caller('id')` is its only form.

## Example

```ts
access: { read: where({ placedBy: caller('id') }) }
```

## Returns

The record `{ caller: 'id' }`, typed as text. It is worked out when the definition is carried out.

## See also

`topic.words`, `word.input`
