# `kinds` of `file`

The kinds of file that are taken.

## Value

A list of media types: `['application/pdf']`, or `['image/*']` for every kind of image. Left out, the type asks for no kind.

## Example

```ts
receipt: file({ kinds: ['application/pdf'] })
```

## See also

`word.file`, `topic.types`
