# `real` of `testApp`

The services that are let through to where they are.

## Value

A list of the names of services. Every other service that a test did not fake (`app.fake`) fails its calls with `code.T7115`, so a test reaches no outside service by accident. Left out, none is let through.

## Example

```ts
const app = await testApp({ real: ['stripe'] })
```

## Errors

`code.T7115`: a call of a service that is neither faked nor named here.

## See also

`word.testApp`, `topic.tests`, `word.service`
