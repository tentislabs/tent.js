# Tailwind CSS and component libraries

This page says how Tailwind CSS and a library of components come in.

## Tailwind CSS

Tailwind CSS comes in by its own plugin for Vite, as its documents give it for Vite: the plugin in the project's `vite.config.ts`, and `@import "tailwindcss"` in a style file that a screen imports. The build of the screens is handed the plugins of that file, in development and for release, so a class added in a save is in the page that save shows.

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
```

```css
/* screens/app.css */
@import "tailwindcss";
```

Tailwind reads every file of the project for its classes: the build hands Vite the folder of the project, and Tailwind starts from there, as its own documents say, leaving out only what `.gitignore` names, `node_modules/`, style files, lock files and files that hold no text. So a word of any other file that is the name of one of its classes, as `grow` or `ring` in the code of a shader or in a test, is written into the style file as a class. `@source not` beside the import leaves a file or a folder out, by its path from the style file or a pattern of paths; `@source` names one more place to read, as a package whose classes a view writes:

```css
/* screens/app.css */
@import "tailwindcss";
@source not "../lib/shader*";
@source not "../tests";
```

A link that is current carries `aria-current="page"`, which Tailwind CSS names as `aria-[current=page]:` and a style file as `[aria-current="page"]`.

## A library of components

A view writes the components of any library, as Mantine, MUI, Radix or daisyUI. A library that writes its styles while it draws, as MUI by Emotion and Mantine, is handed the nonce of the page by `hook.useNonce`: the content policy lets its style tags in by the nonce, and never opens every style tag. `unlock: { styleTags: true }` of the project is the way out for a library that takes no nonce. An attribute of `<html>` that a library's styles read before the page comes alive is set by `option.project.html`. `topic.screens.browser` shows Mantine.
