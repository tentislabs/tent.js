# Light and dark

A screen follows the device by CSS: `@media (prefers-color-scheme: dark)`, or `color-scheme: light dark` with `light-dark()`. `tent shot --dark` asks the page for the dark setting of the device.

Where a visitor chooses, the choice is a state kept in the device (`option.screen.state`), which the first HTML already knows, and a small script of the project's own, named by a `head` line, writes it on `<html>` before the first paint, as `next-themes` does, so the page never shows the other set first:

```ts
// tent.ts
state: { dark: { type: boolean(), in: 'device' } },
head: [{ script: { src: asset('mode.js') } }],
```

```js
// assets/mode.js
const kept = document.cookie.split('; ').find((one) => /^(__Host-)?tent_state\.shop=/.test(one))
const states = kept ? JSON.parse(atob(kept.slice(kept.indexOf('=') + 1).replace(/-/g, '+').replace(/_/g, '/'))) : {}
document.documentElement.dataset.mode = states.dark ? 'dark' : 'light'
```

The states kept in the device stand in one cookie, `tent_state.<the app's name>`, and over https `__Host-tent_state.<the app's name>`, as the JSON of those that are not at their default, in base64url. The style file then names `[data-mode="dark"]`, and a view reads `state.dark` and changes it with `set`. The framework adds no piece for it.
