# `build` of `project`

The escape for changing the builder.

## Value

`{ vite }`: a function that is handed the settings of the builder and answers them. It is code. Left out, the builder runs with its own settings.

## Example

```ts
export const shop = project('shop', {
  build: { vite: (config) => config },
})
```

## See also

`word.project`
