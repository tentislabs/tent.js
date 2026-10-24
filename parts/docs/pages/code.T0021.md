# T0021 mail-not-sent

The mail server did not take a message. The log holds its answer.

## Details

When the server took the message for some addresses and not for others, the message went to those it took, and the error names the rest. A second try of the same call sends the whole message again, to those who had it too: code that minds catches this code and sends to the rest.

## The fix

Read the answer of the server in the log, with `tent logs`. Where the error names addresses, send the message again to those.

## See also

`handle.mail`, `option.project.mail`
