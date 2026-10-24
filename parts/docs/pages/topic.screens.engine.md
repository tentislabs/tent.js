# The engine's own pages

Where the project has no screen for it, the engine answers a browser with a page of its own: not found (404), an error (500), sign-in needed (401, where no screen stands at `signInPath`), too many requests (429), and a page out of date (409). Each is plain HTML with one style and no script, so it is drawn even where the app's own code does not load: in the middle of the window the number of the status large, its words under it, and one link, back to the start for a page that is not found and a sign-in that is needed, and "Try again" for the others; the system's font, light or dark as the device prefers. In development and in the mode `test` the code of the error stands under the words in a small pill, with its place and its words below it; on live data the status, the words and the link alone.

Its words are messages of the project, under `tent.notFound.title`, `tent.error.title`, `tent.signIn.title`, `tent.tooMany.title` and `tent.outOfDate.title`, and those of its link under `tent.page.start` and `tent.page.again`, in the language of the request:

```tsx
import { messages } from 'tentjs/ui'

export default messages('en', {
  tent: { notFound: { title: 'Nothing lives at this address.' } },
})
```

A screen of the project takes the place of a page: one that states `for: 'notFound'` or `for: 'error'`, and the screen at `signInPath`. For an address that is not found and for a failure, these pages are those of live data. In development and in the mode `test` the screens of the page code stand in their place, in the same look, which show a failure in full and in development follow the save that mends it; a sign-in that is needed is the page of the engine in every mode, where no screen stands at `signInPath`. A screen of your own takes the place of either.
