# T7130 no-typed-answer

An agent that states `output` ended its run with no call of `answer`.

## Details

An agent with `output` answers a value of that type through the engine's own tool `answer`. Where the model answers with text alone and calls no tool, the run fails with this code: the text is never passed off as a value. A caller who waits for the run is told `code.T0009`, since what went wrong is the model's.

## The fix

Tell the model in the `instructions` to give its answer with the tool `answer`, test it with `evals` and `expect.value`, or take `output` away where a text is enough.

## See also

`option.agent.output`
