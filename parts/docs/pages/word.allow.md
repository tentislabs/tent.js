# `allow`

A rule that looks at the input or at rows. Its arrow is handed the user, the checked input and a `db` that reads as the caller.

## Example

```ts
access: allow((user, input, db) => db.members.where({ team: input.team, user: user?.id }).count() > 0)
```

## Returns

The record of the rule. The arrow may not be async.

## See also

`topic.words`, `word.where`
