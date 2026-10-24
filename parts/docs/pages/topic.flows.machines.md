# Flows on many machines

This page says how flows run on an app on many machines, and on an app that keeps a data file for each tenant.

## An app on many machines

Every flow runs on the writer alone: it fires each trigger, holds each timer and carries out each step, once. The runs are rows of the data, so a reader holds them too. `read`, `find` and `wait` of `app.runs`, `runs.read`, `runs.find` and `tent runs` are answered by a reader from its own data. A start, a yes, a no and a stop are the writer's, as every write is.

When a reader takes over, it starts the runner: each run that waited goes on from its saved step, and a timer that came due meanwhile fires once. A writer that another machine took over from stops its runner for good.

## An app that keeps a data file for each tenant

A run lives in the file it was added in. A trigger on a tenant table, and a `start` or an `emit` inside a change that writes a tenant's file, add the run in that write: the id of the run ends with the table and the tenant, `<run>.teams.<tenant id>`, so whoever holds the id finds its file. A run that it calls or starts lives in the same file, and every other run in the shared file.

A run that waits in a file that is closed is woken by the engine. When a file closes, its row of the directory keeps when its earliest run must wake and which events its runs wait for; the engine opens the file at that time, or when such an event is emitted in another file. `tent data files --due` lists those files. A change that a step calls in another file is carried out once, as in one file. `together` counts the runs of one file. `runs.find({ of: 'all' })` and `tent runs --all` visit every file, and `of` names one.

An `emit` or a `start` before the first write of its change is of the shared file: a change that then writes a tenant's file is refused with `code.T2109`. Write first, then emit.

## See also

`word.flow`, `option.flow.tries`, `option.flow.limits`, `option.flow.together`, `word.start`, `word.event`, `command.runs`, `code.T5106`
