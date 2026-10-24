# T7019 tool-answer-open

The `output` of a tool is or holds `json`. A warning of the check.

## Details

What a tool answers reaches the model only as far as its `output` names it: the rest is filtered out. An `output` of `json` names nothing, so all of the answer reaches the model, held to no type.

## The fix

Give the tool an output of typed fields.

## See also

`option.agent.tools`, `option.flow.output`
