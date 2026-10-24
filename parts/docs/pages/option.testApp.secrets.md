# `secrets` of `testApp`

The values of secrets, by their names.

## Value

A record of texts by the names of secrets. Every other secret that a definition names has the value `test-<NAME>`. Left out, every secret has that value.

## Example

```ts
const app = await testApp({ secrets: { STRIPE_KEY: 'sk_test_example' } })
```

## See also

`word.testApp`, `word.secret`
