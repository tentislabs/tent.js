# T7131 guard-refused

A guard of an agent did not pass a text.

## Details

A guard of `guards.in` refused the person's message, or the answer of a tool from outside the app, or a guard of `guards.out` refused the answer of the model. Its step - `guard in 1 <guard>`, `guard in N.M <guard>` or `guard out <guard>` - failed with this code, whose message and `fields` name the guard and its `why`. A guard that failed itself counts as one that refused. The turn ended there, and the person was answered the text of `guards.refused`: the run is done, and is not failed.

## The fix

Read why the guard refused in the step of the run (`tent runs show <run>`). Where the guard was right, nothing is to be mended. Where it refused what it should pass, change the guard; where a tool's answer was refused, look at what the tool reads from outside.

## See also

`option.agent.guards`, `word.noOtherPeople`, `word.noPersonal`
