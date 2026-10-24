# T1011 bad-word

A length of time, a size or a schedule does not read.

## Details

A length of time is a number and a unit, `ms`, `second`, `minute`, `hour`, `day`, `week`, `month` or `year`, with or without its final `s`: `'1.5 hours'`. A size is a number and `KB`, `MB` or `GB`: `'10 MB'`. A schedule of `every` is `'15 minutes'`, `'2 hours'`, `'day at 09:00'`, `'monday at 09:00'` or `'month on 1 at 09:00'`.

It holds wherever a length is written: in an option, as the second value of `later` and of `earlier`, and in `time`, `reserve` and `remember.for` of a step. A length that is worked out while running is held there, with `code.T0027`.

## The fix

Write the word in one of its forms. A length is stored in milliseconds and a size in bytes.

## See also

`topic.words`
