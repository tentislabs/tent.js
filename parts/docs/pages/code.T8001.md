# T8001 date-by-javascript

In a plain definition, `==`, `!=`, `===`, `!==` or `-` stands between two moments, written or handed to `calc`, or a moment stands inside a text with values. It is a warning. JavaScript holds two moments to be two things, and writes one in the zone and the language of the server, so its meaning is not the one that is meant.

## Details

The check reports it where it can see that both values are of the type `date`: a field of an input, a column of a row that `db` handed, `now`, and the answer of `later` and `earlier`. `<`, `<=`, `>` and `>=` between two moments mean what they say, and are not reported.

## The fix

Use `between(a, b, 'ms')`, which is 0 for the same moment and the time from one to the other. Write a moment into a text with `concat(...)`, which writes it in the standard form.

## See also

`word.between`, `word.concat`, `code.T8002`, `topic.values`
