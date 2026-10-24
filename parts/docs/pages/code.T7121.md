# T7121 sequence-refused

A sequence that a model handed was refused before anything of it ran.

## Details

An agent that states `sequence: true` offers its model the tool `sequence`, whose `run` is a text in the words a body is written in. The engine reads the whole text and checks it before any call is made. The model is answered this code, with the line of the sequence, where the text holds what a sequence may not hold: `let`, a method of a value such as `.push`, a read of `process` or of `db`, `now()`, `random()`, `token()`, a setting, `start`, or a name that is no tool of the agent. It is answered this code with the two lines of the tool from the list where a call is sure to fail: a read of a field that the tool's answer does not have, a field the tool needs and was not handed, a field it does not take, a text where it takes a number, and a text that is no value of a `choice`. `fill` on an agent whose model has no `typedAnswers` is refused the same way.

A refused sequence has done nothing, and counts as one tool call. The model may hand another, or call the tools one at a time.

## The fix

Nothing in the app is wrong: the model wrote a sequence that cannot run. Where a model often writes such sequences, say more of the tools in their `about`, or test the agent with `evals`.

## See also

`option.agent.sequence`, `word.agent`
