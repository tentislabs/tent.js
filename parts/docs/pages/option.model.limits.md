# `limits` of `model`

How much the model may use in a day, for the app and for each caller, and how long one call may take.

## Value

`{ perDay, perCallerPerDay, time }`. `perDay` and `perCallerPerDay` are each a record of units with the most of each for a day, `{ tokensOut: 2000000 }`: `calls`, `tokensIn`, `tokensOut`, `seconds` (of sound heard), `characters` (spoken), or any unit the provider reports, such as `images`. A unit that is not named is not bounded. `time` is how long a call may wait for the first part of its answer, and for a call that does not write how long it may take in all. Left out, 60 seconds and no bound of use.

Every try of a call is counted in the engine's table of counts, at once, under the day of `project.zone`, the model that was asked, the one that answered and the caller, and before each call the counts of the day are held against the limits of the model that was asked and of the one that answers: one that was reached refuses the call with T7102, naming the limit and the unit. A fall-back whose own limit is reached is passed over. What a provider does not report of the units of a fixed call is counted by a rule: a token for every 3 bytes of text, 1,500 for a picture. A day is a day of `project.zone`. A caller who is nobody is counted by their visitor id. `countBy: 'app'` counts the model for the app as a whole, and then it states no `perCallerPerDay` (T7003).

The limits are numbers written in the definition. A limit that a person sets for themselves while the app runs is the app's own: a row of a table of the app holds it, and the app's code holds it against what the person used today, which a table with `shows: 'counts'` reads (`option.table.shows`), before it calls the model, and refuses with a `fail` of its own. The counts are written every `limits.countEvery`, one minute, so such a limit is held to the use of a minute ago; the model's own limits still bound every call above it.

## Example

```ts
export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  limits: { perDay: { tokensOut: 1000000 }, perCallerPerDay: { tokensOut: 100000 }, time: '60 seconds' },
})
```

## Errors

- `code.T7102`: a limit was reached; the call is refused.
- `code.T7003`: a limit names no unit, or a unit that nothing counts.

## See also

`word.model`, `option.model.countBy`, `command.models`
