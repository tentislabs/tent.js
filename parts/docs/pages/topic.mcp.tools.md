# Tools, asking a person and streams

This page says which tools a caller is listed, what a call sent twice does, how a function asks a person, and the other parts of the standard.

## The tools listed

`mcp: { toolsListed }`, 20 where it is left out, is how many tools a caller is listed at most. A caller who would be listed more is listed two tools in their place: `findFunction`, which takes `{ words, after, limit }` and answers the functions whose name or `about` holds every one of the words, in any capitals, twenty at a time with a mark when there are more; and `callFunction`, which takes `{ name, input }` and calls one. Every function is still found by its own name. The check warns above it (`code.T7004`).

## A call sent twice

A call of a tool that is a change or an action, sent with the standard header `Idempotency-Key`, runs once for its caller and that key, as at `/api/` (`option.project.api`): sent again, it is answered with what it answered, and the same key with another input is `code.T0002`.

## A function that asks a person

A function that states `danger: 'ask'` asks a person before it runs, over MCP too. A client of the newest form that says it can ask its person is answered with the standard's own "more is needed": a question with yes and no, which shows the tool's title and its input in the messages `tent.ask.title` ("Run {tool}?"), `tent.ask.allow` and `tent.ask.refuse` of the project, with a text of the engine's own. The client asks, and calls the same tool again with the answer and that text: on a yes the function runs, once, also where the yes arrives twice; another input, a text older than `limits.askTime`, and a no are `code.T7120`. A client of an older form is asked down its kept stream, where the project keeps one. Every other client is refused with `code.T7120`, whose `fields.page` names the app's page `/_t/ask?a=<text>`: there the signed-in person who is the caller's user says yes or no, on a page of the engine's own or on a screen `for: 'ask'` of the builder's, and a yes lets the next such call run once. Where the run of an agent waits on the ask of a sequence, the one question lists every call it asks for, each with the title of its tool and its input, and ends with the words `tent.ask.more` ("More may be asked after these.") where the sequence may ask again later.

Claude says of no client of its own that it can be asked, so there every such tool is `code.T7120`, with the page. It asks its person before every tool by itself, whatever the tool's marks, so for Claude `asks: 'client'` fits what the person already sees.

The way out is the builder's word that a client's own asking is trusted: `mcp: { asks: 'client' }` for every client, or a list of the hosts of clients' documents, of client ids and of keys; a client that registered itself is never trusted by a list. A key that states `asks: 'none'` is never asked.

A flow and an agent that are offered to MCP ask the same way where their run waits for a person: the call is answered that more is needed, or, for a client that cannot ask, `code.T0008` with the run and `fields.page`, and the same tool called with `{ run }` waits again. For the ask of a sequence of an agent, the page lists every call that the ask lists, each with the title of its tool and its input, and the words `tent.ask.more` where more may follow; a screen `for: 'ask'` is handed them as `sequence` and `more` of `ask`.

## A kept stream, and other parts of the standard

The layer keeps no stream open and sends no note by itself, and its list of tools may be kept by a client for `limits.toolsKept` (5 minutes). A project that states `mcp: { stream: true }` answers a `GET` of `/mcp`, and the standard's own listening request, with a kept stream: it is sent the note that the tools changed when a new version goes live, a sign of life every 30 seconds, and the requests that a maker of `engine.ts` sends with `mcp.request(grant, method, params)`. A stream counts on `limits.liveConnections` of its address.

`mcp: { on: { 'resources/list': listResources } }` names a function of the app for a method that the layer does not answer by itself. It is called through the door as the caller, is handed `{ params }`, is never listed as a tool, and the layer names the part of the standard it belongs to in what it says of itself. A method that nothing answers is answered as not known.
