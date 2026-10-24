# T7021 not-for-a-chat

A screen that is offered to MCP reads or calls a function that is not offered to MCP. An error of the check. It is also the warning of what such a screen holds that a frame of another site cannot have.

## Details

A chat app shows a screen that states `offer: ['mcp']` in a frame of its own. There the screen reaches the app through the chat app: every `read`, `useCall` and `Form` is a call of the function's tool, so a function that is not offered to MCP has no tool, and the frame is answered `code.T0001`.

The warnings are of what works on a page of the app and not in a frame of another site:

| What | In the frame |
|---|---|
| A state kept in the device or in the browser | Starts at its default |
| A script that `unlock` lists | Not loaded |
| A member of an agent, or `working` of a flow or of an action | No tool: it works only where the chat app lets the frame connect, and is nothing elsewhere |

A function that a view hands to `useQuery` or `useCall` by a name worked out while running is not seen by the check.

## The fix

Offer the function to MCP too, with `offer: ['mcp']`, or keep the screen for the app alone. For a warning, keep the state in the page or in the address, and draw what the frame cannot have only on the app's own pages.

## See also

`topic.mcp`, `option.project.mcp`, `code.T7009`
