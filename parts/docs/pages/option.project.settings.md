# `settings` of `project`

Typed values that are set apart for test and for live.

## Value

A record from a name to `{ type, public }`. The default of a setting is the `default` of its type. Left out, the app has no settings.

## Example

```ts
export const shop = project('shop', {
  settings: { supportEmail: { type: text({ default: 'help@example.com' }), public: true } },
})
```

## Errors

`code.T1009`: a setting named `then`.

## See also

`word.project`
