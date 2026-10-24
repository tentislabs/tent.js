# Fonts

A font is a file of the project's assets, named in a style file with `@font-face`, and a `head` line that preloads it, so the text does not change its face once the page has loaded. The style file names the asset by its path from the style file, as any file it names by `url()`; the build writes in its place the address of the asset under its fingerprint, the very file that `asset('inter.woff2')` names, so the preload and the face are one download:

```css
/* screens/app.css */
@font-face {
  font-family: "Inter";
  src: url(../assets/inter.woff2) format("woff2");
  font-display: swap;
}
```

```ts
head: [{ link: { rel: 'preload', href: asset('inter.woff2'), as: 'font', type: 'font/woff2', crossorigin: 'anonymous' } }],
```

A package of fonts, as those of Fontsource, is imported as a style file, `import '@fontsource-variable/inter'`: each font that its style file names is written into the bundle under its fingerprint, and the style file names it there. The variable package, `@fontsource-variable/inter`, names its family `"Inter Variable"`. A package of fixed weights, `@fontsource/inter`, is imported as one style file for each weight, and its family is the plain name, `"Inter"`:

```ts
import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
```

```css
font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
```
