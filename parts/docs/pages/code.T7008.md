# T7008 tools-too-deep

The flows and agents that are tools of an agent stand deeper than `callDepth`, or lead back to the agent. The check finds it.

## Details

A flow or an agent that is a tool is a run of its own, called from the run of the one that uses it. Runs stand at most `callDepth` deep, 3 where `project.limits` states none: the call of a run one level deeper is refused with `code.T5105`. A tool that leads back to the agent that uses it would call it for ever.

## The fix

Give the agent fewer levels of tools that are runs, raise `callDepth` in `project.limits`, or take the agent out of the tools that lead back to it.

## See also

`option.agent.tools`, `option.project.limits`, `code.T5105`
