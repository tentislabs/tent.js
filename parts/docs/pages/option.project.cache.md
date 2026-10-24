# `cache` of `project`

What the engine tells a cache that stands outside it: the header in which every public answer names the tables it read, so that such a cache drops by key what a write made stale.

## Value

`{ keysHeader }`, the name of a header, as `'surrogate-key'`. Every answer of a screen that states `cache: { public: true }` then carries in it each table its queries read, as `t:<table>`, between spaces, and the event `page.stale` holds the keys of each write too (`word.event`). Before a switch turns visitors over, the engine draws the addresses asked most in the last day into the cache of the new version, up to `limits.warmPages` (200) within `limits.warmTime` (30 seconds). Left out, no answer carries such a header.

## Example

```ts
export const shop = project('shop', {
  cache: { keysHeader: 'surrogate-key' },
})
```

## See also

`word.event`, `word.project`
