# `sameSecret`

Says whether two texts are the same, in constant time, so that the time it takes does not tell where they differ. It belongs to backend code, and is no word of a view.

## Example

```ts
if (!sameSecret(input.code, invite.code)) fail('wrong-code', 'That code is not right.')
```

## Returns

True or false. False when either is nothing or empty text, so an empty stored code lets nobody in. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.fingerprint`, `word.token`
