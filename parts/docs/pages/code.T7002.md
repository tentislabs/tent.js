# T7002 three-marks

An agent that can do all three of what makes it open to being led: read what is not open to everyone, take in text from outside, and send data out. A warning of the check.

## Details

The check marks each tool of the agent, and the agent itself:

- it reads what is not open to everyone: a tool reads a table whose `read` rule is not `'anyone'`, or is code, whose body the check cannot see;
- it takes in text from outside: a tool calls a service or an action, reads a file, hears, is code or `python`, or reads a table that callers other than its owner may write;
- it sends data out: a tool sends, and is named in `trust`, so the person is never asked before it does.

Text from outside may hold words written to lead the model. Where the agent can also read what is closed and send it out, those words can carry the data away. A sending tool that asks the person before it runs breaks the third mark, and the check is silent.

## The fix

Leave out one of the three marks: take the sending tool out of `trust`, so the person is asked before it sends; or give the agent no tool that takes in text from outside; or let it read only what is open.

## See also

`word.agent`, `option.agent.trust`, `option.agent.tools`, `option.action.sends`
