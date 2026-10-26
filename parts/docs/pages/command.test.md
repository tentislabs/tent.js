# `tent test`

Runs the tests of the app: every file under `tests/` of the project, by the test runner of the runtime, where `testApp()` gives each test a fresh temporary copy of the app, and replays each test whose result stands on nothing that changed since it passed. With `--ai` it runs the tests of AI behaviour instead.

## Usage

```
tent test [<file or name>] [--all] [--declared [--update]] [--ai] [--budget <unit>=<most>] [--compare] [--from-runs <agent> [--below <score>] [--data <folder>]] [--plan <screen>] [--watch] [--shard <n>/<of>] [--join <folder>]... [--looks update] [--room <program or apart>]
```

## Options

`<file or name>` runs one test file, named by its path from the folder of the project, as `tests/orders.test.ts`, or else the tests of that whole name in every file, as `"an order is added"`; it may also be given as `--only <file or name>`. It takes one word, and goes with none of `--from-runs`, `--plan`, `--join`, `--looks`, `--watch` and `--shard`. A file that is no test file, a name that no test carries, and a second word are each refused with the usage line.

`--all` runs every test, and makes the record of each anew: run it on the main branch of a repository. Without it, a test that passed is replayed, and not run, while what it stood on is unchanged: every definition it touched and every one that reacts to what it touched (a flow on a table it wrote or an event it raised, the work that fills a column of such a table, a screen or a route at an address it asked), its test file with every file it reaches and every module of the project its program loaded, also by `await import` and `require`, each word of the environment its code or the app's read, with its value, `tent.ts`, `seed.ts` and `engine.ts`, the messages and the assets, the packages, the framework, the runtime, the system and the room, the browsers it drove and the pictures it held. Each file stands as it was when the run began. A test that failed, one that reached outside the program (a plain `fetch` of the app's code or of the test file, a service let through by `real`, a model that no test faked, a file read through `node:fs` or `require`, a connection of the app's code through `node:http`, `node:https` or `node:net`, a request of a page to another host, a Python program), and the tests of a file that opens its app in `before` and shares it, are never replayed. What each test touched, its result, its time and its key are kept in `.tent/tests.json` of the project, which `tent check`, `tent impact` and `--watch` read.

`--declared` runs, in place of the tests of the project, the tests made from what the app declares: what each caller gets of each function, offered flow and table, held to `tests/declared/access.json` as a kept picture is held, each input at the edges of its type, and each form of each screen (`topic.tests.declared`). `--update` keeps the table of access anew, where a change of access was meant. They are kept in no record of the tests, and never replayed.

`--ai` runs only the files that end in `.ai.ts`, one after another, with the keys of the secrets of the project's test data: there the models are real, unless a test fakes them. Such a file runs `evals` and `judge` of `tentjs/test` over an agent, a flow or a function.

`--budget <unit>=<most>` is one bound for the whole command, given once for each unit it bounds: each `evals` that states no `budget` of its own is handed what is left of it, and the first unit that is passed stops the cases left, which are counted in `notRun`. Left out it is `tokensOut=500000`, which every call of a model counts; `--budget none` runs with no bound.

`--from-runs <agent>` runs no test: it asks the engine that runs the app, through `--data <folder>` or the `.tent/` of the project, for the kept runs of the agent that people rated, the lowest rated first, and writes them as a file of evals, `tests/<agent>.runs.ai.ts`, one case for each run with what it was asked as `say` and an empty `expect` to fill in, and what it answered and its rating beside it. `--below <score>` keeps the runs rated below that score alone. With `--json` it prints `{ file, cases }`.

A case may say several things in turn: `say: ['...', '...', '...']` starts one run for each, in order, on one conversation of the caller where the agent keeps one, and holds what the last answered, with every tool that the runs called.

Each run keeps what the cases gave in `evals/` of the engine's own folder, `.tent/evals/`, in a file named by its time and the version of the app: `{ version, at, results }`. With `--compare` it sets them against the newest earlier file, matching the results and the cases by their names, names each case that passed before and fails now or whose score fell by more than 0.1, and ends with 1 where there is one.

`--plan <screen>` writes `tests/<screen>.test.ts`, a first draft of a test for a person or a model to finish: it opens the screen as a test user, fills each field of its forms with a value of its type, presses each press, and holds that every function it called answered. It reads the description alone, and writes over no file that is there.

`--room apart` runs the code of the app in the test room in every test that `testApp()` opens: a thread of its own that shares nothing with the engine, where every call crosses as it does into the room of a host (`adapter.Room`). A test that passes in the room of the program and fails there leans on one heap: a value it handed across that it then changed, a function it kept past its call. `--room program` runs it in the room of the program, the default. Where it is left out, the run takes `TENT_ROOM=apart` of its environment.

`--watch` runs every test, and then on each save first the tests that touched a definition the save changed, as `.tent/tests.json` names them from their last run, and then the rest. Each test is printed as it ends, `passed <file>: <name>` or `failed <file>: <name>`, and each round ends with a line that counts them. It runs until it is ended.

`--shard <n>/<of>` runs the `n`th of `of` shares of the test files, split by their names, so that a suite runs on several machines. Every run keeps its report in `results/tests/report.json` of the project. `--join <folder>`, given once for each folder, answers the one report of the shares, from each folder that holds the `report.json` of a share: the same report as one run.

`--looks update` keeps each new picture and each new thing heard that `expect(page).looks` and `.heard` wrote beside what is kept, `<name>.new.png` and `<name>.new.txt`, under its own name, and answers what it kept. Run it once you have looked at them.

## Example

```
tent test --json
tent test --ai --budget tokensOut=200000 --budget images=20 --compare
tent test --plan ordersScreen
tent test --shard 2/4 --json
tent test --join first --join second --join third --join fourth
```

## Output

With `--json`:

```json
{ "ok": true, "value": { "passed": 2, "failed": 0, "replayed": 1, "files": ["tests/orders.test.ts"], "failures": [] }, "findings": [] }
```

As text, each test stands on a line of its own, `passed <file>: <name>`, `failed <file>: <name>` or `replayed <file>: <name>`, a test that reached outside the program is named with what it reached, a test on a held clock that opened a page is named as reaching outside the held clock, and a last line counts them. A replayed test is never counted as passed.

`failures` holds the facts of each test that failed, as data: `[{ test, file, line, expected, got, call: { name, caller, input, answer, error, trace, read, wrote }, fix, randomSeed }]`. `line` is the line of the test file where it failed, `expected` and `got` the two values it held against each other, and `call` the last call it made before that line: whom as and with what, what it answered, or the code that refused it, with the definition and the line of the app's own code where that code failed, the rows it read, and each row it wrote as it was before and after, at most 50 of a table. `trace` is followed with `tent logs --trace <id>`. `fix` is the fix of the code that refused the call, and `randomSeed` the seed of the test's app, with which a test app draws the same numbers again (`option.testApp.randomSeed`). The finding of each failure tells the same in words.

Each file is a program of its own, started in the folder of the project. A test file names the framework as `tentjs/test`, and a file of the project as the files of a project name each other. A test that failed is a finding that holds its whole failure: what the test threw, with both values where two were held against each other, the line of the project where it was thrown, and what that test wrote out with `console.log` and `console.error`. The command ends with 1. A file whose name ends in `.ai.ts` holds tests of AI behaviour, and is left out.

A test whose page opens in an engine of a browser that does not speak WebDriver BiDi on this computer is not run: it is neither passed nor failed, and stands in `notRun`, `[{ test, why }]`, by its file and its name, with what was not had.

## See also

`topic.tests`, `topic.commands`, `command.check`, `command.impact`, `option.testApp.clock`, `option.testApp.randomSeed`
