import { answerOf } from './answerOf.ts'
import type { Description } from './description.ts'
import { apiNameOf, listedAsGet, offeredToApi } from './openApi.ts'
import { isStored } from './record.ts'
import { isRequired } from './required.ts'

/** A text as HTML writes it: each character that means something there is written as its name. */
const asText = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** A type in a few words: its kind, and the kind of its entries for a list. */
function kindOf(type: unknown): string {
  if (!isStored(type)) return 'json'
  if (type.kind === 'list') return `list of ${kindOf(type.of)}`
  if (type.kind === 'choice' && Array.isArray(type.values)) return `one of ${type.values.map(String).join(', ')}`
  return String(type.kind)
}

/** The rows of the fields of an input: name, type, whether it is needed, and its label and help. */
function fieldsOf(input: unknown): string {
  const fields = isStored(input) ? Object.entries(input).sort(([a], [b]) => (a < b ? -1 : 1)) : []
  if (!fields.length) return '<p>No input.</p>'
  const rows = fields.map(([name, type]) => {
    const record = isStored(type) ? type : {}
    const words = [record.label, record.help].filter((one) => typeof one === 'string').join(': ')
    const needed = isRequired(type) ? 'needed' : 'optional'
    return `<tr><td><code>${asText(name)}</code></td><td>${asText(kindOf(type))}</td><td>${needed}</td><td>${asText(words)}</td></tr>`
  })
  return `<table><tr><th>Field</th><th>Type</th><th></th><th>Means</th></tr>${rows.join('')}</table>`
}

/**
 * Takes a description. Answers the docs page of its API, as plain HTML with no script: each offered function with
 * its `about`, its address, its fields with their `label` and `help`, and its answer. Every text that the
 * description holds is written as text.
 */
export function apiDocsOf(description: Description): string {
  const title = typeof description.project.title === 'string' ? description.project.title : description.app.name
  const parts = offeredToApi(description).map((one) => {
    const name = apiNameOf(description, one.name)
    const method = listedAsGet(one) ? 'GET' : 'POST'
    const about = typeof one.record.about === 'string' ? `<p>${asText(one.record.about)}</p>` : ''
    const deprecated =
      typeof one.record.deprecated === 'string' ? `<p>Goes away on ${asText(one.record.deprecated)}.</p>` : ''
    const answer = answerOf(description, one.name)
    return [
      `<section id="${asText(name)}"><h2>${asText(name)}</h2>${about}${deprecated}`,
      `<p><code>${method} /api/${asText(name)}</code></p>`,
      fieldsOf(one.record.input),
      `<p>Answers: ${answer ? asText(kindOf(answer)) : 'nothing'}.</p></section>`,
    ].join('')
  })
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${asText(title)}: the API</title>`,
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem}',
    'table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.25rem .5rem;text-align:left}</style>',
    `</head><body><h1>${asText(title)}: the API</h1>`,
    '<p>Each call is sent with a key, as <code>Authorization: Bearer &lt;key&gt;</code>.</p>',
    ...parts,
    '</body></html>\n',
  ].join('')
}
