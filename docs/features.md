# What Tent.js does

Every feature of the framework, in one or two sentences each, as the website says them. Each line rests on the build documents and the shipped docs.

## The six that lead

In the order the website tells them: it is built for AI, it is safe, it does not break, its users feel it, it is fast, and it grows.

- **Every Function Is an AI Tool.** Queries, actions, flows and agents become tools automatically, with typed inputs and descriptions generated from your definitions. Every tool runs with the caller's permissions, and risky ones ask a person first. Add one option and the same function is an MCP tool, a REST endpoint with OpenAPI, or a CLI command.
- **Undo for AI.** Every write records who made it. Roll back exactly what one agent run, API key or connected AI app changed, while everyone else's work stays. And the whole app, code and data, can go back to any point.
- **Durable Workflows.** Write long-running work as async functions. Each step is saved as it completes, so runs survive restarts, retry on failure, and can wait for days. No queue required. Start them on a schedule, a row change or your own event, and every outside call runs exactly once.
- **Live Data.** Queries are live by default. When data changes, every open page receives just the rows that changed, and your own changes appear instantly, computed from the change itself. Calls made offline are held and sent once when the network returns.
- **Built-in Optimizations.** Data lives in the same process as your app, so reads skip the network. Server-only components send no JavaScript, unused parts never load, and pages stream while slow data loads. Public pages are cached and refreshed the moment their data changes.
- **Scale Across Machines.** Add read replicas next to one writer, give each tenant its own database file with one option, send heavy work to worker machines, and run many apps in one engine. Your code stays the same.

## Data

- **SQLite Built In.** Your data lives in SQLite files inside your app's own process. Reads skip the network, and moving an app is copying a folder.
- **Automatic Migrations.** Change a table and the engine migrates it on start. Safe changes apply on their own, and risky ones are checked against every row first.
- **Access Rules.** Declare who can read and change each table once. Pages, APIs, agents and MCP clients are all held to the same rules.
- **Search Built In.** Full-text and vector search on your own tables, combined in one query and filtered by access rules.
- **Tested Backups.** Scheduled backups run while the app serves, and each one is restored and checked before it counts.
- **Restore to Any Moment.** Every change is archived beside the backups, so data can be brought back to any moment, not just the last backup.
- **Encrypted Columns.** Mark a column sealed to store it encrypted. Secrets are encrypted value by value and never reach your code.
- **Kept Counts and Sums.** Counts and sums stay up to date with every write, so a dashboard reads one row instead of counting a table.
- **Data Retention.** Say how long a table keeps its rows, and older rows go on their own.
- **Files and Uploads.** Uploads are checked by their real bytes, size and type, and images are resized to standard widths.
- **Imports and Documents.** Import spreadsheets into a table, checked against its types, and read the text of PDF, Word, CSV and HTML files.

## Workflows

- **Schedules and Triggers.** Run work every day at 9, on a cron line, when a row is added or changed, or on your own events.
- **All-or-Nothing Writes.** A change is one transaction, and the flows it starts and the events it sends are part of the same write.
- **Exactly-Once Calls.** Outside calls and changes carry once-only keys, so a retry never charges twice.
- **Agents with Guardrails.** Agents work within the limits you set, ask a person before risky actions, and keep conversations in your own tables.

## Connected

- **Your App as a Service.** Offer any function as a REST endpoint with OpenAPI, an MCP tool with OAuth sign-in, or a CLI command, so other apps and AIs connect to yours.
- **Connect Any Service.** Declare an outside API once, or import its OpenAPI file. Keys, rate limits, timeouts and retries are handled.
- **Per-User Connections.** Call a service as each user, with their own account and OAuth handled for you.
- **Verified Webhooks.** Receive webhooks with signature checks built in.
- **Any npm Package.** Use any package in screens and backend code, with any CSS, Tailwind CSS or component library.
- **Python and Other Languages.** Write functions in Python, or bring Rust, Go and others through native packages, WebAssembly or MCP.
- **Mail.** Send mail through your own server. In development it goes to the log.

## Pages

- **React Screens.** Write views in React with any library. Types flow from your tables into every component.
- **Streaming and Caching.** Pages stream while slow data loads. Public pages are cached and refreshed when their data changes.
- **Server-Only Components.** Draw heavy components on the server and send the browser no JavaScript for them.
- **Offline-Safe Calls.** Calls made while offline are held, sent in order when the network returns, and run once.
- **Forms That Check Themselves.** Forms check input against your types, show errors per field, and work without JavaScript.
- **Instant Navigation.** Moving to another page takes one request, with prefetching and view transitions.
- **Image Optimization.** Images are served at the size the screen needs.
- **Languages.** Translations, localized addresses, and numbers, dates and money in each visitor's language.
- **SEO and Share Images.** Titles, descriptions and sitemaps from your data, with share images drawn from a component.
- **Static Export.** Write a site, or the public part of an app, as plain files for any host.

## Security

- **One Door for Every Request.** Every caller passes the same ten steps: rate limits, origin checks, typed input and filtered output.
- **Security Headers by Default.** A content security policy with nonces and the other safety headers, written for you.
- **Safe Outbound Requests.** Outgoing calls go only to secure addresses, and private networks are refused.
- **Sandboxed Packages.** Run actions in a sandbox under the runtime's permissions, for packages you don't fully trust.
- **Signed Updates.** Releases are signed, and a server can take security fixes by itself.

## Production

- **Self-Hosting with HTTPS.** One command runs your app on any server with certificates for your domains.
- **Gradual Rollouts.** Release to a share of visitors first. If errors or latency rise, it rolls back on its own.
- **Version History.** Every save is a snapshot. Compare, branch and merge by definition, and roll back with your data.
- **Branch Previews.** Open any branch as its own app before you merge it.
- **Tracing.** One trace follows a click through calls, flows, agents and workers, carries no user data, and exports to OpenTelemetry.
- **Real Visitor Speed.** Measure what real visitors experience, page by page and version by version, with nothing personal kept.
- **CDN Purging.** Get told the moment a cached page goes stale, so any CDN can drop it.
- **Stable Upgrades.** Within a major version every app keeps working, and upgrades rewrite your project for you.

## Developer Experience

- **Every Mistake at Once.** One check reports every error in the project, each with its fix.
- **Fast Refresh.** Saves show in the open page in a blink and keep its state.
- **Errors with Answers.** Every error has a code, and every code has a page with its fix.
- **Docs in the Package.** The docs ship with the version you run, for you and your AI.
- **Real-Browser Tests.** Each test gets a fresh app and a real browser, steps wait for what actually happened, and AI models can be faked.
- **Inspect Mode.** Point at anything on a page to find the code that drew it.

## Measured against Next.js 16.4

Kept for reference, not for the website: on the same app, on the owner's Windows computer, Tent.js sent a third less script (91 kB against 139 kB), answered its first page in about 0.6 s against about 0.94 s for `next start`, and showed a save in the page in about 0.11 s against 0.12 s for `next dev`. The press of a form was slower in that early race (about 64 to 72 ms against 48 ms), and the race was not run again before the release.
