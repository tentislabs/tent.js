# T7004 too-many-tools

More functions are offered to MCP than `toolsListed` lets a chat app be listed. A warning of the check.

## Details

A chat app pays for every tool it is listed before a chat starts. `mcp.toolsListed` of `project`, 20 where it states none, says how many a caller is listed at most. A caller who would be listed more is listed two tools in their place: `findFunction`, which finds a function by the words of its name and its `about`, and `callFunction`, which calls one. Each function is still found by its own name. `mcp.only` narrows what is offered, and what is counted.

It is also the warning of a project that offers to MCP something a person signs in for, and has no screen at its `signInPath`: a chat app signs a person in there, so no chat app gets in. What a project with `mcp: { anyone: true }` offers under the rule `anyone` is reached with no sign-in, and needs no screen.

## The fix

Offer fewer functions to MCP, narrow them with `mcp.only`, or raise `mcp.toolsListed` where the pair is not what the app wants. Add a screen of sign-in at the `signInPath`: `topic.signIn` writes one.

## See also

`topic.mcp`, `option.project.mcp`
