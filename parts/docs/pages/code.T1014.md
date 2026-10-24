# T1014 bad-value

An option holds a value that is not allowed where it stands.

## Details

Among them: a `size` of a vector under 1, a `pattern` that is no regular expression, a `min` over its `max`, a zone the runtime does not know, a `currency` that is no three letters, a value that is no type, no rule, no plan, no write or no trigger where one is asked for, a trigger whose `where` holds a plan, a rule whose filter leaves an entry out with `given`, a `users` table whose `roles` column is no `list(text())`, an `auth` of a service that is none of its six forms, `alone` of a kind of worker that is neither false nor a whole number of 1 or more, and a tool name of MCP that is longer than 64 characters.

An option of any word whose value is of another kind than the option takes is reported by its name, and is left out of the description: a function where a text, a number, true or false or a record stands, as `about: () => 'Notes'`. The finding names the option as it was written, as `rows` and `set`. What a definition is written with holds, at any depth, text, a number that JSON writes, true, false, nothing, a list, a record that was written in place, a thing that a word of ours made, and a function where the option at that place takes one. Anything else - a function elsewhere, a symbol, a `bigint`, a `Date`, a thing that a class made - is reported with the way to it, as `options.at`, and the definition is left out. An option that names a definition takes its name as text or the definition itself: what is neither, as the number in `reads: [5]`, is reported by its place, as `reads.0`, and the option is left out. An error that is thrown while one definition is described is reported on that definition with the words of the error, and the definition is left out. A table that names a `private` column in `search` is reported too. A definition whose record lacks a field that the description needs, as a model with no `provider`, is left out whole.

A column with `from` is worked out from the columns of its own row. Its `from` holds no `now`, `random`, `token`, `input`, `caller` or setting, no `each`, no other column with `from`, and no column through a link. One that names an optional column, or that divides or takes a remainder, may hold nothing, so its column states `optional: true`. What it works out is of the type of its column. And no plain write names such a column: the store works it out.

A zone that is written as the second value of `dayOf` is one that the runtime knows, wherever the word stands.

Of `head`: a line is `{ meta }`, `{ link }` or `{ script }` with the names of its kind, and the `src` of a script is an asset or an address on a host that `unlock.scripts` lists. Of the state of `project`: `in: 'address'` is for a screen and a component, `back` is for a state that is kept in the address, and a state `in: 'device'` is a `boolean`, a `choice`, a `number`, or a `text` with a `max` of 100 or less.

Of the state of a screen and of a component: a state that is no `boolean`, states no `default` and is not `optional` has nothing to start as, and is reported by its name, as `state.search`; an `in` is `'address'`, `'device'` or `'browser'`; a `json`, a `file` and a `vector` cannot be kept in the address; `back` is for a state that is kept in the address; a component declares no state `in: 'device'`; and the states that an app keeps `in: 'device'` share one cookie, whose value may be 3,500 bytes with every state at the largest it could hold. Of a screen: an address that starts with `/_t/` or with the code of a language could never be reached, and `for` is one of the four special screens.

The build raises it where it reads: for a file that the project names, by an import, by `from` of a service or by `file` of a `python`, and that lies outside the folder of the project and of every folder that `roots` names, also after every link is followed; for a file that cannot be read or loaded; for `input`, `caller` or `col` called in a body, which reads those values by their names; and for the arrow of a rule that holds more than a read through `db`, a call of a query and a value word, `random()` and `token()` among it.

The check reports it for a word that asks the engine, a setting and a reference word that stand at the top of a file, outside the options of a definition, as `const cutoff = later(now(), '7 days')`: no call is under way while a file is loaded, so the name holds a record where its type says a value.

`word.each` raises it while it runs, where it is handed a reference in the place of its list, as `each(input('lines'), ...)` in a form written with values: `each` takes an arrow, which only a body and the code of a view can hold.

A list or an object that holds itself has no stored form, and neither has a value that is nested more than 200 deep, nor one that stands in so many places that it would be stored as more than 1,000,000 values. A definition that is written with one is reported with the way to it, as `options.tools.1`, and is left out of the description. A word that stores what it was handed raises it while it runs: a write, a filter, and a value word that is handed a reference.

`search` of a plan takes the words themselves, as `search(input('words'))`, and `given` marks an entry of a filter alone: `search(given(input('words')))` is reported as `rows.search.input`, which is required and was not given, and the plan is left out. An empty text finds every row, so a query whose input states `words: text({ default: '' })` lists every row until words are given (`topic.plans`).

A word that makes a definition raises it where its name is no text or its options are no record, and so does a member of a plan that is handed a value of another kind than it takes, as `orders.sort(5)`, a row that is no record, as `orders.add(null)`, and `limit` and `skip` for anything but a whole number of zero or more.

While an app runs, the data part raises it for five things that the build cannot see. A group works a `sum`, an `avg`, a `min` or a `max` out of a link column: a link is no measure, and the rows are counted or grouped by it. A `pick` of a plan names what is no column of its table: a `pick` names columns of the table itself, so a path through a link in it, as `pick(['customer.name'])`, is refused, and what a linked row holds is read with `with`. A `where` rule that is code answers a filter with an entry written with `given`: the rule then shows no row, since an entry that is left out for a caller with no value would show that caller every row. A `db` that is limited to its caller searches a table that names a `private` column in `search`: a search would tell of that column. And a plan made in code states a `limit` or a `skip` that is under zero or no whole number.

## The fix

Write the value that the option takes. For `each`: use it in a body or in a view, and in a form written with values use a word that takes no arrow, as `sum` or `join`.

## See also

`word.each`, `topic.words`, `topic.types`, `topic.build`
