# What the MCP layer was built against

The layer is our own (`25-mcp-and-python.md`, section 14), and the words of the standard that it reads and writes stand in `standard.ts`. Each is the standard's, and is read from its own pages before the first release and again at each release.

Written on 2026-10-15, on a computer that may reach no address outside it: the pages below were not opened for this writing. What the layer holds is the plain reading of each page as it stood at the last reading of the builder, and each name of `standard.ts` is to be held against the pages at the next reading.

| What | Page |
|---|---|
| The message format, its ids, its failures and their numbers | https://www.jsonrpc.org/specification |
| The older forms: the opening request, its note, the sign of life, the list and the call of tools, their marks, a typed answer, a failure of a tool | https://modelcontextprotocol.io/specification/2025-11-25 , https://modelcontextprotocol.io/specification/2025-06-18 , https://modelcontextprotocol.io/specification/2025-03-26 |
| The way over the web, the version line, a kept stream, a note answered with 202 | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| The guarding of the address, the 401 and its line, the 403 of a missing scope | https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization |
| A question to the person, its yes | https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation |
| The newest form: the version and what the client can do in `_meta` of each request, the request that tells what the server is, the lines of the version and of the method, the answer that more is needed and the call that comes back with it | https://modelcontextprotocol.io/specification/2026-07-28 |
| The files that a server offers to be read, their list and their reading, the failure of one that is not there | https://modelcontextprotocol.io/specification/2025-11-25/server/resources |
| A screen in a frame of the chat app: the address of a tool's file in `_meta.ui`, the kind of the file, the hosts it loads from, and the messages between the frame and the chat app (`ui/initialize`, the answer of the tool, `tools/call`, `ui/open-link`, the size) | https://github.com/modelcontextprotocol/ext-apps , specification 2026-01-26 |
