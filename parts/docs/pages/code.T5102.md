# T5102 result-too-large

The result of a step, or the answer of a flow, is larger than its flow allows. The error says how many bytes it is.

## Details

A result is saved as plain data, and may be 1 MB where the flow states nothing. A step whose result is larger has failed like any step that fails. A flow whose answer is larger has failed with this code. The answer of a call that a person agreed to is kept with its step, and is held to the same limit.

## The fix

Put large data into a file with `files.put` and answer the id of the file. Where a larger result is truly needed, raise the limit: `limits: { result: '4 MB' }` on the flow. A run resumes more slowly the more bytes its steps saved.

## See also

`topic.flows`, `option.flow.limits`
