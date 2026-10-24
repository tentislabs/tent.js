# `secret`

Names a secret, where a definition needs one. A definition never holds the value.

## Example

```ts
key: secret('STRIPE_KEY')
```

## Returns

The record `{ secret: 'STRIPE_KEY' }`, which is stored as it is.

## See also

`topic.words`
