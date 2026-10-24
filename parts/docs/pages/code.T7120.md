# T7120 nobody-to-ask

A function that states `danger: 'ask'` was called by a program, and no yes of a person came with the call. A caller gets it with the status 403.

## Details

A program is a key, at `/api/` and at `/_t/call/`, and at `/_t/call/` any caller of a request that carries no `Origin` of the app, which a page always sends. At `/api/` every caller is asked. The code is answered after the input was checked and before the function runs, so only a caller who may call it, with an input that fits, learns that it asks. `fields.ask` holds a text that only the engine can make and read: it holds the function, the fingerprint of the input, the caller and the time.

The same call sent again with that text in the header `Tent-Agreed` runs the function once, within `limits.askTime` (10 minutes). Another input, another caller, a text that was used, and an older one are answered this code again, with a new text. A key that states `asks: 'none'` is never asked: that is the builder's word that it needs no person. `app.call` of a program that holds the app asks nobody.

**Over MCP** every caller is asked, unless `mcp.asks` trusts the client's own asking. A client of the newest form that says it can ask its person is answered that more is needed, with the question, and the call that comes back with a yes and the text runs once; a yes that arrives twice is answered what the first was. A client of an older form is asked down its kept stream, where the project states `mcp: { stream: true }`. Any other client, and a no, is answered this code. For a caller that has a user, `fields.page` names the app's page `/_t/ask?a=<the text>`: there the signed-in person who is that user sees the tool's title and its input, with a field marked `secret` as `[secret]`, and says yes or no; a yes lets the next such call of that caller, with that input, run once. A screen of the builder's own that states `for: 'ask'` takes the place of the engine's page, handed `ask`: `{ title, tool, input, allow, refuse }`.

## The fix

Ask the person what `fields.ask` stands for, and on a yes send the same call again with `Tent-Agreed: <the text>`. Over MCP, send the person to `fields.page`, or ask with the client's own question.

## See also

`handle.keys`, `option.action.danger`, `topic.mcp`
