# T7110 request-not-accepted

The provider did not accept the request: its server answered with a status from 400 to 499 that is no "too many requests", such as a key it refused, a model name it does not know, or a size it will not take. The call fails with the status 502, and is given to no second model.

## The fix

Check the key of the model and its value in the secrets, the name of the model at its provider, and what the request holds. The log of the model calls holds what the server answered.

```ts
export const writer = model('writer', { provider: 'openai', name: 'gpt-5', key: secret('OPENAI_KEY') })
```

## See also

`option.model.key`, `option.model.name`, `code.T7104`
