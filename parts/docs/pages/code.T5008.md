# T5008 heavy-work-note

A note: work that may be done twice. The check finds it, and refuses nothing.

## Details

An action that states `worker` or `background` is handed to a machine, which may be lost while it works: its work is then given again from its start. What it sent out before - a mail, a call of a service - may be sent twice. An action that states `sends: false` says that it sends nothing out, and is not noted.

A `batch` that states `split` cuts a batch that failed in two until the one entry that fails stands alone: the good entries are carried out again on the way.

## The fix

State `sends: false` where the work sends nothing out. Where it does, give each call it makes outside a once-only key, so that a second making is answered the first answer.

## See also

`topic.workers`, `code.T5007`
