# What the engine counts

This page gives the counts of a minute, and everything the engine counts.

## The counts of a minute

| Who | Count | Where none is stated |
|---|---|---|
| A caller who is nobody, for their address | `limits.anyonePerMinute` calls | 60 |
| A signed-in caller, whatever their address | `limits.callerPerMinute` calls | 600 |
| An address, for requests for a screen | `limits.screensPerMinute` | 300 |

One request more is `code.T0005`. An action that a screen reads as an entry of its `data` counts as one call of the caller who asked for the screen, beside the count of the screen: past the count the page is the error screen, with `code.T0005`. A request for `/sitemap.xml`, `/sitemap-<n>.xml` or `/robots.txt` counts as one call of its caller: a visitor past `limits.anyonePerMinute` is refused them too, until the minute has run. `/_t/health` and a file of the bundle are counted by nothing.

A count is kept for one minute of the clock, from its first second to its last, and starts anew with the next: so 61 calls that cross from one minute into the next are all taken. A test of a count sends them within one minute, or moves the clock of a test app (`topic.tests.data`). An address is the one the connection came from, or behind a named proxy the one the proxy states. `tent start` listens on `127.0.0.1` where `--host` names no other, so every request of this computer comes from `127.0.0.1`, also one sent to `localhost`; a test that holds a count reaches the app by `http://127.0.0.1:<port>`.

## What the engine counts

Beside the log, which is cut when it is full, the engine keeps counts of how much each app used: a row of `_t_counts` for each day, each thing, each caller where callers are counted, and each unit. They are facts: the engine knows no price and bills nobody.

| What | Its name | Units |
|---|---|---|
| A call of a query, a change or an action, a screen, a route, a call coming in | Its name | `calls`, `failed`, `ms`, `cpuMs`, `mainCpuMs`, `rowsWritten`, and through the door `bytesIn` and `bytesOut` |
| A run of a flow or an agent | Its name | `runs`, `steps`, `workedMs`, `cpuMs`, `mainCpuMs` |
| A call of a service | `<service>.<call>` | `calls`, `failed`, `ms`, `bytesIn`, `bytesOut` |
| A request that reached no definition | `door` | `calls`, `failed`, `bytesIn`, `bytesOut`, `mainCpuMs` |
| A `fetch` of the code's own | `fetch` | `calls`, `failed`, `ms`, `bytesIn`, `bytesOut` |
| A model | Its name, answered by the model that answered | Its own units, with `bytesIn` and `bytesOut`. A model over a service call is counted here, and not under its service |
| Mail, files, the files of the bundle | `mail`, `files`, `static` | `mails`, `bytesOut`; `bytesIn` of uploads, `bytesOut` of downloads, `fileByteSeconds`, `fileBytesPeak`; `calls`, `bytesOut` |
| Live data | `live` | `watches`, `liveSeconds`, `livePeak`, `bytesOut`, and the processor time of making its queries anew |
| The data, the links to readers and to workers, the engine's own work | `data`, `copy`, `work`, `upkeep` | `dataByteSeconds`, `dataBytesPeak`; `bytesIn`, `bytesOut`; `cpuMs`, `mainCpuMs` |

Processor time is booked once, to the piece of work that came from outside: a call from code inside a call adds its `calls` and `ms`, and its processor time is the outer one's. `cpuMs` is read from the clock of the thread that did the work alone; `mainCpuMs` is an estimate for the main thread, booked at each place where the work enters, calls the engine, is answered and returns. A peak is never added. The rows of `data`, `upkeep`, `static`, `door`, `copy` and `work`, and every peak, have the caller empty.

The counts are gathered in memory and written every `limits.countEvery` (1 minute) and when the app closes or falls asleep, to the day in which they are written: so once a day has ended, its sums never change. A program that is killed loses no more than one `countEvery`, and never counts over. The size of the data is measured every `limits.levelEvery` (1 hour); the time an app stood closed, or slept, is booked at its next opening. A reader counts as its writer counts, and hands its counts to the writer in batches that are written once. `limits.callerCountsKept` joins old rows by caller into rows for the whole app, and `limits.countsKept` removes old days; each is for ever when left out.

Who is counted is `countBy`: of the project, of one function, flow or agent, and the least of it is what `engine.open` was given (`option.project.countBy`). `engine.open` also takes `countEvery`, `levelEvery`, `callerCountsKept` and `countsKept`. A program reads the counts with `counts` of `tentjs/engine`, as the system alone: `app.read(counts.where({ day }), { as: 'system' })`.

`engine.program()` answers what the program itself used, counted from its start: `{ id, since, upMs, cpus, memoryLimit?, cpuMs, cpuMsGiven, memoryByteSeconds, memoryPeak, bytesIn, bytesOut, diskBytes, children }`. `cpuMsGiven` is what of its processor time it booked to its apps; the rest belongs to no app, and how it is spread is the host's rule.
