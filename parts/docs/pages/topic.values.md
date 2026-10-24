# The value words

A value word works a value out of the values it is handed. It does nothing to the world, and it means the same in every place a value may stand: in a body, in a form written with values, in a view and in the `from` of a column.

## One function, two answers

Handed plain values, a value word answers its value. Handed a reference, as `input('limit')`, `col('net')` or the record of another value word, it answers its record, which is worked out when the definition is carried out. Its type is the type of its value in both cases, so one word is written the same way everywhere.

```ts
round(12.345, 1)                       // 12.3
round(calc('*', input('net'), 1.2), 1) // { "fn": "round", "args": [{ "calc": "*", ... }, 1] }
```

Four things ask the engine, and so have no value while a definition is being written: `word.now`, `word.random`, `word.token`, and `word.dayOf` with no zone. Each answers its value while a call is under way, and its record where a definition is being made. A setting does the same.

## The words

| Words | For |
|---|---|
| `word.concat`, `word.lower`, `word.upper`, `word.trim`, `word.startsWith`, `word.contains`, `word.slice`, `word.join` | Text |
| `word.calc`, `word.round`, `word.floor`, `word.ceil`, `word.least`, `word.most` | Numbers |
| `word.range`, `word.where`, `word.each`, `word.sum`, `word.avg`, `word.min`, `word.max` | Lists |
| `word.later`, `word.earlier`, `word.between`, `word.dayOf`, `word.now` | Moments and days |
| `word.fingerprint`, `word.sameSecret`, `word.token`, `word.random`, `word.chunks` | Backend code alone |

## A moment and a day

In backend code a moment is a `Date`, and in a view it is text in the standard form. A word takes either kind and answers the kind it was handed. A day is text, as `'2026-10-08'`, on both sides. `==` and `-` between two moments do not mean the same on both sides, so the words are the way that means one thing in every place: `between(a, b, 'ms')` is the time from one moment to another.

## Nothing, and a wrong kind

`later`, `earlier`, `between` and `dayOf` answer nothing where the moment or the day they are handed is nothing, so an optional date passes through them. A word that takes a list fails with `code.T0027` where it is handed nothing in its place. A value of another kind than a word works with, as a length of time that does not read, is `code.T0027` too.

## How large

A value word makes a list or a text of 1,000,000 entries or characters at most, or of as many as `limits.valueSize` of the project says: a word asks the engine for the limit of the app whose call is under way. Beyond that it fails with `code.T0027`, which names the limit, `valueSize`.
