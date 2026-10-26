# Tests made from the declarations

`tent test --declared` makes tests from what the app declares - every definition, who may call it, and the type of each input - and runs them, with no line written by hand: the tests an agent and a person forget, who may call what and the edges of each input.

## Who gets what

Each function, each offered flow, each agent that states `access`, and each table read, added to, changed and removed, is called with a sample input as every kind of caller: nobody, a user with no role, a user of each role that a rule of the project names, the system, and a key and a grant where the definition is offered to the API or to MCP. A table that names an owner is held to its owner and to another user too, and one that names a tenant is read, changed and removed by the system in the tenant of its row and in another: a read of one row that the caller does not reach finds nothing. What each gets - taken, or refused with which code - forms one table, kept in `tests/declared/access.json`:

```json
{
  "refundOrder - access: as a user of the role staff": "taken",
  "refundOrder - access: as a user with no role": "refused T3101"
}
```

The first run writes it. A later run holds what came to it, as a kept picture is held (`word.expect`): a change of access fails, naming each line that changed, `refundOrder - access: as a user of the role staff: was taken, now refused T3101`. Look at it, and keep the new table with `tent test --declared --update`, as `--looks update` keeps pictures. A rule written as code is called, and what it answers is kept, never judged.

## The edges of each input

Each field of the input of each function is called, as the system, at the values its type takes at its edges: exactly its `min` and its `max`, an empty text and an empty list where they are let, the field left out where it is optional, each value of a choice, and a link to a row that exists. A value the type refuses is the engine's to refuse, and is not tried. Each answer is taken, or refused with the app's own code or a code of the engine below status 500; an internal error, `code.T0009`, fails the case. A failing case is cut down to the smallest input that still fails, as Hypothesis and fast-check shrink a case, and that input is printed, to call again by hand:

```
priced.price - number({ min: 0, max: 100 }): 100, internal T0009
The code of the app failed: a price of 100 is too dear
at functions/priced.ts:9 (priced)
the smallest input that fails: {"price":61}
```

## Forms

Each form of each screen whose address names no value is sent from a page of the app (`app.open`) as a user of every role: empty, with a sample, and with each field of a text, a number or a choice at its edges. It answers as its call answers with the same input; a form that the page itself holds back, for fields that do not fit, answers as the call refuses it.

## Nothing reaches outside

Every service and every model is stood in by one that refuses with `code.T7132`, and so is every plain `fetch`, every request of a page to another host, and every connection of the app's code through `node:http`, `node:https` or `node:net`. A Python program, which the engine cannot hold, is named in the line of its case as reaching outside. Mail goes to the mailbox, and a run that asks a person is answered no. The runs are settled after each case, and each case starts from one mark of the data.

## One order, one sample

The same description gives the same cases in the same order on every computer: the order of the names of the definitions. A value of each type is made in one place, `word.sampleOf`, which `app.make` and `tent test --plan` read too, and the values of a choice are read from where the description keeps them.

## Beside the tests written by hand

`word.declared` runs the same cases from a test file of the project's own, so they run beside the tests a person wrote.

## See also

`command.test`, `word.declared`, `word.sampleOf`, `code.T7132`, `topic.tests`
