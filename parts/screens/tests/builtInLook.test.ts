import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageLook } from '../../core/internal.ts'
import { screen } from '../index.ts'
import { described, drawingOf, drawn, unescaped } from './drawn.ts'

const shown = screen('shown', { path: '/shown', access: 'anyone', view: () => null })

/** The style that an element of a drawing carries, by its tag, as a browser reads the attribute. */
const styled = (drawing: string, tag: string): string =>
  unescaped(new RegExp(`<${tag} style="([^"]*)"`).exec(drawing)?.[1] ?? '')

test('[43-7] [31-4] the built-in screen of an address that is not found has the one look of the pages of the engine: in the middle of the window, the status large, its words under it and a link to the start, and in the mode test the code in a pill', async () => {
  const made = await drawn(described([shown]), 'tent.notFound', {
    page: { status: 404, error: { code: 'T0001', name: 'not-found', message: 'No screen answers /nothing.' } },
  })
  const drawing = drawingOf(made.html)
  assert.equal(styled(drawing, 'main'), pageLook.window)
  assert.equal(styled(drawing, 'h1'), pageLook.status)
  assert.equal(styled(drawing, 'h2'), pageLook.words)
  assert.match(drawing, /<h1 [^>]*>404<\/h1><h2 [^>]*>This page could not be found\.<\/h2>/)
  assert.match(drawing, /<span style="[^"]*">T0001<\/span>/)
  // A refusal tells its code alone, the same for every address that is not found.
  assert.doesNotMatch(drawing, /<pre|nothing/)
  assert.match(drawing, /<a style="[^"]*" href="\/">Back to the start<\/a>/)
  assert.equal(styled(drawing, 'span'), pageLook.code)
  assert.equal(styled(drawing, 'a'), pageLook.link)
})

test('[43-7] [31-4] the built-in error screen shows its status and "Try again", in development the place and the words of the error, and on live data the status, the words and the link alone', async () => {
  const error = {
    code: 'T0009',
    name: 'internal',
    message: 'the drawer of secrets is stuck',
    where: { file: 'screens/desk.tsx', line: 12 },
  }
  const told = drawingOf(
    (
      await drawn(described([shown]), 'tent.error', {
        page: { status: 500, mode: 'development', path: '/shown', error },
      })
    ).html,
  )
  assert.match(told, /<h1 [^>]*>500<\/h1><h2 [^>]*>Something went wrong\.<\/h2>/)
  assert.match(told, />T0009<\/span>/)
  assert.match(told, /<pre [^>]*>screens\/desk\.tsx:12\nthe drawer of secrets is stuck<\/pre>/)
  assert.match(told, /<a [^>]*href="\/shown">Try again<\/a>/)
  const live = drawingOf(
    (
      await drawn(described([shown]), 'tent.error', {
        page: {
          status: 500,
          mode: 'live',
          error: { code: 'T0009', name: 'internal', message: 'Something went wrong.' },
        },
      })
    ).html,
  )
  assert.match(live, /<h1 [^>]*>500<\/h1><h2 [^>]*>Something went wrong\.<\/h2><a [^>]*>Try again<\/a><\/div><\/main>/)
  assert.doesNotMatch(live, /T0009|<pre|<span/)
})
