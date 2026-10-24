# `from` of `service`

A published description of the API of the service, in JSON of version 3.0 or 3.1, which the calls that `use` names are read from by the build.

## Value

The path of a file of the project, from the file that states it where it starts with a dot. The build reads it and never the app while it runs: only the calls it reads reach the description, beside those that `calls` writes, and they are typed in `tent.d.ts`, so `stripe.postRefunds(...)` is checked as a written call is. A call is named after its operation with the first letter made small. Text becomes `text`, with a list of values `choice`, with the format of a date and time `date`, of a day `day`; a number `number`, a whole one with `whole`; true or false `boolean`; a list `list`; a record with named fields `object`; anything else `json`. A file in YAML, or of the version before 3.0, is turned into JSON of 3.1 with `tent api read`.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
  from: './stripe.openapi.json',
  use: ['PostRefunds', 'GetChargesCharge'],
})
```

## Errors

`code.T7013`: the file cannot be read, is of another version, or lacks a named operation; and a warning for each part taken as `json`. `code.T1007`: a call that both `calls` and `from` give. `code.T1014`: a file outside the folder of the project.

## See also

`word.service`, `option.service.use`, `command.api`
