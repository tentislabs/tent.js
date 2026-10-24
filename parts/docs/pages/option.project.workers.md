# `workers` of `project`

The kinds of worker that heavy work may name.

## Value

A record from a kind to its options, with `any` for work that states `background` alone. Left out, heavy work runs on a thread of this program. `alone` of a kind is how many of its workers may be kept for tasks that are handed out alone, a whole number of 1 or more, or `false` for none. Left out, it is 1. `loaded` of a kind is `'first'`, which holds when it is left out: of the free workers, one that holds the `python` of a task loaded is handed it before one that does not, and `place` picks among those; with `'no'`, `place` picks among all.

## Example

```ts
export const shop = project('shop', {
  workers: { gpu: { about: 'A machine with a graphics card', atOnce: 4, idleAfter: '2 minutes', next: { kind: 'any', after: ['lost'] } } },
})
```

## Errors

`code.T1014`: `alone` of a kind is neither `false` nor a whole number of 1 or more.

`code.T1003`: a kind states an option that it does not have.

## See also

`word.project`
