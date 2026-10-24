// Holds what the linter has no rule for: what a comment may not say, and the one cast that is read from the code.
// Run: node scripts/comments.mjs [folder]      Ends with 1 when it finds something.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { heldFiles } from './held.mjs'

const folder = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')

const month =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const day = '\\d{1,2}(?:st|nd|rd|th)?'
const year = '\\d{4}'
const between = '(?:[\\s,.\\-/]+(?:of\\s+)?)'
// A day, a month by its name and a year stand in any order, with a space, a comma, a point or a hyphen between.
const orders = [
  [day, month, year],
  [month, day, year],
  [year, month, day],
  [year, day, month],
  [day, year, month],
  [month, year, day],
]
const date = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b|${orders.map((order) => `\\b${order.join(between)}\\b`).join('|')}`,
  'i',
)

// What a comment may not hold, each with the words that name it in a finding.
const rules = [
  ['a date', date],
  ['the words of a "to do"', /\bto[ \t-]?do\b|\bfixme\b|\bxxx\b/i],
  ['the label of a build step', /\bstep \d+[a-z]\b/i],
  // The label alone keeps its capital: code gives the same letters, written small, to many things of its own.
  ['the label of a trial', /\b(?:[Tt][Rr][Ii][Aa][Ll] [Tt]\d+|T\d{1,2})\b/],
  ['the label of a decision', /\bdecision [a-z]?\d+\b/i],
  ['the label of a review', new RegExp(`\\breview (?:#?\\d|${month}\\.? \\d)`, 'i')],
  ['the file name of a build document', /\b\d\d-[a-z0-9-]+\.md\b/],
]
// A script that reads the build documents may name in a comment what its work is about.
const aboutTheDocuments = [
  'the label of a build step',
  'the label of a trial',
  'the label of a decision',
  'the file name of a build document',
]
const readsTheDocuments = /^docs\/[^/]+\.mjs$/
const switchesOff = /^(?:biome-ignore|@ts-ignore|@ts-expect-error|@ts-nocheck)/
const wrapper = /^parts\/[^/]+\/borrowed\//

// A cast may stand in round brackets, which the tree keeps as a node of their own.
const bare = (node) => (node?.type === 'ParenthesizedExpression' ? bare(node.expression) : node)

/** Walks the tree of a file, and answers the place of each cast that goes through `unknown`. */
function casts(node, found = []) {
  if (Array.isArray(node)) for (const one of node) casts(one, found)
  else if (node && typeof node === 'object') {
    const inner = node.type === 'TSAsExpression' ? bare(node.expression) : undefined
    if (inner?.type === 'TSAsExpression' && inner.typeAnnotation.type === 'TSUnknownKeyword') found.push(node.start)
    for (const value of Object.values(node)) casts(value, found)
  }
  return found
}

const found = []
const files = heldFiles(folder)
for (const file of files) {
  const text = readFileSync(join(folder, file), 'utf8')
  const lineOf = (place) => text.slice(0, place).split('\n').length
  const { program, comments, errors } = parseSync(file, text)
  // What the reader could not read whole may hide a comment or a cast, so the file is not let pass.
  for (const error of errors) found.push(`${file}:1  the reader of source cannot read the file: ${error.message}`)
  for (const comment of comments) {
    for (const [k, line] of comment.value.split('\n').entries()) {
      const at = `${file}:${lineOf(comment.start) + k}`
      const words = line.replace(/^[\s*/]+/, '').trim()
      if (switchesOff.test(words) && !wrapper.test(file))
        found.push(`${at}  a line that switches a check off, outside a wrapper: ${words}`)
      for (const [name, rule] of rules) {
        if (readsTheDocuments.test(file) && aboutTheDocuments.includes(name)) continue
        // A date may stand in an address, and nowhere else.
        const read = rule === date ? line.replace(/https?:\/\/\S+/g, '') : line
        const match = rule.exec(read)
        if (match) found.push(`${at}  ${name} in a comment: ${match[0]}`)
      }
    }
  }
  if (wrapper.test(file)) continue
  for (const place of casts(program)) found.push(`${file}:${lineOf(place)}  a cast through unknown`)
}

if (found.length) {
  console.log(`${found.join('\n')}\n\n${found.length} found in ${files.length} files.`)
  process.exit(1)
}
console.log(`${files.length} files. Nothing found.`)
