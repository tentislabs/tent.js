# `uploads` of `project`

Who may upload a file.

## Value

A rule, as on a function. Signed-in callers when left out.

## Example

```ts
export const shop = project('shop', {
  uploads: 'signedIn',
})
```

## See also

`word.project`
