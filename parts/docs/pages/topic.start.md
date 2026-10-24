# Installation

This page walks one app from nothing to a running screen: how `tent` is run, a table, a query, a screen with its data, a link, a form, a sign-in, the seed and `tent dev`. Every file below is whole, and the app it makes runs as it is written.

## Running tent

`tent` comes with the package `tentjs` of npm, which brings the Node.js it runs on:

```sh
npm install -g tentjs
```

Each command of these docs is then `tent <command>`. A project names its own `tentjs` in its `package.json`, and `tent` builds and runs a project with the version it names. A program of your own that imports the framework, as `topic.engine` shows one, finds it in the `tentjs` that the project holds.

## A new project

```sh
tent new my-app
cd my-app
```

`npm create tent my-app` makes the same project with nothing installed first, by `tent new` of the newest `tentjs`. `tent new` writes a bare project: `tent.ts`, `package.json`, `AGENTS.md`, one screen at `/` and the query it reads. The files below take their place. A definition is a top-level `export const` made by a word of `tentjs`; `tent check` after every change reports every mistake at once, each with its fix.

## The project and its people

```ts
// tent.ts
import { project } from 'tentjs'

export const myApp = project('myApp', {
  title: 'My App',
  signInPath: '/sign-in',
})
```

The engine reads `id` and `roles` of each row of `users`; the rest is the project's own. The password is stored as its hash, in a column that no rule lets anyone read.

```ts
// tables/users.ts
import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: {
    email: text({ unique: true, personal: true }),
    name: text({ optional: true, personal: true }),
    password: text({ optional: true, private: true }),
    roles: list(text()),
  },
  access: { read: 'owner' },
})
```
