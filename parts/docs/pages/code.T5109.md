# T5109 worker-refused

The writer does not take a worker that asked to join. It answers `no`, and the worker dials again by its backoff.

## Details

A worker is not taken where:

- its engine is of another major version than the writer's;
- it names a kind that `project.workers` does not state, and that is not `any`;
- it names a kind that its key does not hold, or asks for more tasks at once than its key allows;
- its key has as many workers joined as it allows.

The key of a worker is one of `workers` of `engine.open`, a key or `{ key, kinds, atOnce, workers }`.

## The fix

Start the worker with the kinds that the project states and its key holds, with `--kinds`, and no more at once than its key allows, with `--at-once`. Run the same major version of Tent on every machine.

## See also

`topic.workers`, `code.T5107`
