# The seed and tent dev

This page fills the data of the app with its seed, runs it with `tent dev`, and says what each person sees.

## The seed

`seed.ts` fills the data of development and of tests, with full access: here one person of the staff and two orders. Its arrow may wait, so a password is hashed in it.

```ts
// seed.ts
import { passwords, seed } from 'tentjs'

export default seed(async ({ db }) => {
  db.users.add({ email: 'sam@example.com', name: 'Sam', password: await passwords.hash('a long secret'), roles: ['staff'] })
  db.orders.add({ title: 'A shelf', total: 120 })
  db.orders.add({ title: 'Two chairs', total: 80 })
})
```

## tent dev

```sh
tent dev
```

It builds the project, opens it on `http://localhost:3000` with the seed in its data, and draws each save again in the open page; a mistake shows over the page with its fix. `tent dev --fresh` empties the data and applies the seed again.

## What each person sees

- **A stranger** who opens `/` is sent to `/sign-in?back=%2F`, the screen at `signInPath`, and comes back to `/` once signed in.
- **Sam**, signed in with the role `staff`, sees the open orders, and each is a link to its own screen.
- **A signed-in person without the role** is shown the screen that is not found, with 404, so they learn nothing of the screen. A project draws its own with `for: 'notFound'`.

## See also

- `topic.signIn`
- `topic.words`
- `topic.screens`
- `topic.plans`
- `topic.look`
- `topic.otherLanguages`
- `topic.leaving`
- `tag.Link`
- `tag.Form`
- `word.seed`
- `command.new`
- `command.dev`
- `command.check`
