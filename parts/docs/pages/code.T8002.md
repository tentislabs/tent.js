# T8002 list-by-javascript

In a plain definition, `==`, `!=`, `===` or `!==` stands between two lists or records. It is a warning. JavaScript holds two of them to be the same only when they are one thing in memory, which is never the meaning that is meant, and a body that was read makes a top-level `const` anew each time it reads it.

## Details

The check reports it where it can see that both values are lists or records: one written in place, a top-level `const` or an option of the project that holds one, rows that `db` handed, and a field of an input of such a type.

## The fix

Compare a field of each, as their ids, or the entries one by one.

## See also

`code.T8001`, `topic.values`
