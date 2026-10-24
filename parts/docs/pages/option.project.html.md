# `html` of `project`

Attributes of the `<html>` element of every page, for a library whose styles read one before the page has come alive, as Mantine reads `data-mantine-color-scheme`.

## Value

A record of attributes, each a name and a text: `{ 'data-mantine-color-scheme': 'light' }`. A name is small letters, digits and hyphens. It is neither `lang` nor `dir`, which the engine writes itself, and does not start with `on`. Left out, the engine writes its own attributes alone.

## Example

```ts
export const shop = project('shop', {
  title: 'Shop',
  html: { 'data-mantine-color-scheme': 'light' },
})
```

## Errors

`code.T1014`: a name of another form, one the engine writes itself, a handler of an event, or a value that is no text.

## See also

`word.project`, `option.project.head`, `hook.useNonce`, `topic.screens`
