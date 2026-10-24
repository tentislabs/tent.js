# `head` of `project`

Lines of the head of every page.

## Value

A list of `{ meta }`, `{ link }` and `{ script }`. A `meta` line takes `name`, `property`, `content` and `media`. A `link` line takes `rel`, `href`, `type`, `sizes`, `media`, `hreflang`, `title`, `as` and `crossorigin`, where `rel` is `icon`, `apple-touch-icon`, `manifest`, `alternate`, `preconnect`, `dns-prefetch` or `preload`. A `script` line takes `src`, `async`, `defer`, `type`, `load` and `consent`. Each is text, but for `async` and `defer`, which are true or false, and `href` and `src`, which may be an asset. The `src` of a script is an asset, or an address on a host that `unlock.scripts` of the project lists. Left out, no line is added. A `script` line may also state `load`, when it is loaded: `'now'` (the default), in the head of the first HTML; `'alive'`, added by the page code once the page has come alive, so it never holds up the first paint or the first press; `'idle'`, added when the browser is next idle after that. `consent` names a `boolean` state kept in the device: the script is added only once that state is true, on the page where it becomes true, with no reload, and nothing of it is asked for before. A script of `'alive'` or `'idle'` is added once for a visit, also where two screens name it.

## Example

```ts
export const shop = project('shop', {
  head: [{ meta: { name: 'theme-color', content: '#0f1115' } }],
})
```

## Errors

`code.T1014`: a line that is none of the three, that states a name its kind does not take, or whose `src` lies on a host that `unlock.scripts` does not list.

## See also

`word.project`
