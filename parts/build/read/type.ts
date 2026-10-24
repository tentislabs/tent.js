import {
  action,
  boolean,
  choice,
  date,
  day,
  file,
  json,
  link,
  list,
  number,
  object,
  project,
  text,
  vector,
} from '../../core/index.ts'
import type { Type } from '../../core/index.ts'
import { describe, isStored } from '../../core/internal.ts'
import type { Node } from '../tree.ts'
import { child, cooked, keyOf, kids, nameOf, unwrap } from '../tree.ts'
import type { Reach } from './reach.ts'
import { local, NotPlain, Refused } from './reach.ts'

/** The type words, each by its name. */
const typeWords: Record<string, (...values: never[]) => object> = {
  boolean,
  choice,
  date,
  day,
  file,
  json,
  link,
  list,
  number,
  object,
  text,
  vector,
}

/** Whether a name is a type word. */
export const isTypeWord = (name: string): boolean => Object.hasOwn(typeWords, name)

/** Whether a node is a call of a type word that the file imports. */
export function isTypeCall(node: Node, reach: Reach): boolean {
  const n = unwrap(node)
  const name = n.type === 'CallExpression' ? nameOf(child(n, 'callee')) : undefined
  if (name === undefined || local(reach, name)) return false
  const imported = reach.imports.get(name)
  return imported !== undefined && 'ours' in imported && isTypeWord(imported.ours)
}

function writtenInPlace(node: Node, reach: Reach): unknown {
  const n = unwrap(node)
  if (n.type === 'Literal' && n.regex === undefined) return n.value
  // A number below zero is a sign before a literal, and a text in backticks with no value in it is a literal too.
  if (n.type === 'UnaryExpression' && n.operator === '-') {
    const number = unwrap(child(n, 'argument'))
    if (number.type === 'Literal' && typeof number.value === 'number') return -number.value
  }
  if (n.type === 'TemplateLiteral' && !kids(n, 'expressions').length) return cooked(kids(n, 'quasis')[0])
  if (n.type === 'ArrayExpression') return kids(n, 'elements').map((entry) => writtenInPlace(entry, reach))
  if (n.type === 'ObjectExpression') {
    const entries = kids(n, 'properties').map((property) => {
      const key = property.type === 'Property' ? keyOf(property) : undefined
      if (key === undefined) throw new NotPlain('a type whose options are not written in place', property)
      return [key, writtenInPlace(child(property, 'value'), reach)]
    })
    return Object.fromEntries(entries)
  }
  if (isTypeCall(n, reach)) return typeRecord(n, reach)
  throw new NotPlain('a type whose options are not written in place', node)
}

// A type is made by calling the type word itself with what was read, as a file that is read has its definitions made.
function typeRecord(node: Node, reach: Reach): Type {
  const n = unwrap(node)
  const imported = reach.imports.get(nameOf(child(n, 'callee')) ?? '')
  const made = imported && 'ours' in imported ? typeWords[imported.ours] : undefined
  if (!made) throw new NotPlain('a type whose options are not written in place', node)
  return Reflect.apply(
    made,
    undefined,
    kids(n, 'arguments').map((one) => writtenInPlace(one, reach)),
  )
}

/**
 * Takes the call of a type word, as a body hands it to a word that takes a type. Answers the type as it is
 * stored. Throws `NotPlain` where its options are not written in place, and `Refused` with what the description
 * finds wrong in it.
 */
export function typeStored(node: Node, reach: Reach): unknown {
  // The description is the one that knows how a type is stored: the type is described as the input of a function.
  const made = describe({
    definitions: [
      { value: project('types', {}) },
      { value: action('typed', { access: 'nobody', input: { value: typeRecord(node, reach) }, run: async () => {} }) },
    ],
  })
  const wrong = made.findings[0]
  if (wrong) throw new Refused(wrong.code, wrong.message.replace(/^typed: /, ''), node)
  const input = made.description.functions.typed?.input
  return isStored(input) ? input.value : undefined
}
