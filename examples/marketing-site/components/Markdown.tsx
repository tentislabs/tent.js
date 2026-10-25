import { marked } from 'marked'
import { component, text } from 'tentjs/ui'

// Drawn on the server alone, so the browser loads none of `marked`. The text is written by the shop, never by a visitor.
export const Markdown = component('Markdown', {
  browser: false,
  props: { text: text() },
  view: ({ text }) => (
    <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) }} />
  ),
})
