# `project`

The project: the one definition that names the app and holds what belongs to the whole of it. It is always plain, but for `identify`, `onRequest` and `build.vite`, which are code.

## Example

```ts
export const shop = project('shop', {
})
```

Its name is the name of a definition as any other: no table, function or other definition of the project has it too (`code.T1004`). So the project of an app whose table is `bots` is named `botsApp`, with `title: 'Bots'`.

## Options

| Option | Means |
|---|---|
| `option.project.title` | The name of the app as people read it. |
| `option.project.languages` | The languages of the app. |
| `option.project.zone` | The time zone for schedules and for the day of a moment. |
| `option.project.currency` | What `format="currency"` shows money in. |
| `option.project.icon` | The picture a browser shows for the site. |
| `option.project.head` | Lines of the head of every page. |
| `option.project.html` | Attributes of the `<html>` element of every page. |
| `option.project.state` | State that every screen and every component shares. |
| `option.project.signInPath` | Where a visitor is sent when a screen needs a signed-in user. |
| `option.project.identify` | The builder's own way of telling who is calling. |
| `option.project.onRequest` | A function that every request of the app is handed first. |
| `option.project.uploads` | Who may upload a file. |
| `option.project.images` | What the image door answers. |
| `option.project.cookies` | How the engine sets its cookies. |
| `option.project.cli` | The app's own command line. |
| `option.project.mcp` | What the app states for the MCP door. |
| `option.project.python` | The Python of the project, and what its lock is made with. |
| `option.project.describeTo` | Who may read what the app offers to programs. |
| `option.project.api` | What the app states for the API. |
| `option.project.roots` | Folders outside the project that its files may be named from. |
| `option.project.trailingSlash` | What becomes of a slash at the end of an address. |
| `option.project.settings` | Typed values that are set apart for test and for live. |
| `option.project.mail` | How the app sends mail. |
| `option.project.limits` | The limits of the app, each a default that the project changes. |
| `option.project.redirects` | Addresses that send a visitor on to another. |
| `option.project.hosts` | The hosts that a page may load pictures, sound and video from, and connect to. |
| `option.project.unlock` | The ways out of the content policy of a page, each of which opens one thing. |
| `option.project.privateHosts` | Local or private addresses that the guarded fetch may reach. |
| `option.project.hold` | Runs the app's actions, and every package they import, in a room of their own. |
| `option.project.countBy` | For whom the engine counts what the app does. |
| `option.project.workers` | The kinds of worker that heavy work may name. |
| `option.project.backups` | When backups of the data are taken, and how many are kept. |
| `option.project.files` | Where the bytes of the app's files lie. |
| `option.project.history` | What the history of the project leaves out. |
| `option.project.publish` | What a new version must pass before it goes live. |
| `option.project.release` | How a new version reaches the visitors: all at once, or gradually. |
| `option.project.cache` | What the engine tells a cache that stands outside it. |
| `option.project.trace` | Which traces of the app are kept, and where they are sent out. |
| `option.project.vitals` | How much of the speed real visitors see is measured. |
| `option.project.removed` | The tables that were removed on purpose. |
| `option.project.build` | The escape for changing the builder. |
| `option.project.was` | The old name of the project, where it was renamed. |

## Returns

A record that carries its options, which backend code reads: `shop.options.title`.

## See also

`topic.words`
