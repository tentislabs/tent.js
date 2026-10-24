# T4003 network-in-query

A query reaches the network: it calls `fetch`, a call of a service, or a model. A query reads through `db` and nothing else.

## The fix

Reach out in an action, and keep what it answered in a table that the query reads.

## See also

`word.action`, `word.service`, `topic.check`
