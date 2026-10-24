# `cli` of `project`

The app's own command line.

## Value

`{ name, names, login }`: the name of the command, a record from a definition to the word of its command, and `'key'` to turn the browser's way of `login` off. Left out, the command is named after the project.

## Example

```ts
export const shop = project('shop', {
  cli: { name: 'shop', names: { file: 'fetch-file' }, login: 'key' },
})
```

## See also

`word.project`
