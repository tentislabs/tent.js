# T7112 tool-changed

A tool of an outside MCP server is not as it was approved, and is held back.

## Details

The engine looks at the tools of each outside server again from time to time. A tool whose description or input changed since `tent mcp approve` wrote it into `mcp.lock.json`, or that the server no longer lists, is held back by itself: it is not offered to a model, and a call of it is this error. The log says so for each such tool. The other tools of the server go on.

## The fix

Look at the tool again with `tent mcp approve <service>`, and build and run the version that holds the new approval.

## See also

`option.service.mcp`, `command.mcp`
