# `maxSize` of `file`

The largest file that is taken.

## Value

A size in words: `'10 MB'`, with `KB`, `MB` or `GB`, counted in 1,024s. It is stored in bytes. Left out, the type states no size of its own.

## Example

```ts
receipt: file({ maxSize: '10 MB' })
```

## See also

`word.file`, `topic.types`
