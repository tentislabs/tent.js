# `anyone`

The rule that lets anyone in, with the reason written down.

## Example

```ts
access: anyone('the contact form is public')
```

## Returns

The record `{ rule: 'anyone', why }`.

## See also

`topic.words`, `word.role`
