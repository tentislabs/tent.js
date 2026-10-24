# T3008 incoming-not-verified

A call coming in states neither `verify` nor `open`: whoever finds its address would start its flow.

## Details

An `incoming` either checks the signature of what arrives, with `verify`, or says why it takes calls that nobody signed, with `open: 'why'`. The finding stands at the line of the definition.

## The fix

State `verify` with the signature of its sender, or `open: 'why'` where nobody can sign it.

## See also

`option.incoming.verify`, `option.incoming.open`, `word.incoming`
