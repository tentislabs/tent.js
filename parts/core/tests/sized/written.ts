// A program of its own that has a body write a value out which is small in memory and very long once written.
// Run: node written.ts. It says `ready` once it is loaded, then one line of JSON: how each way of writing ended.
import { concat, join, TentError } from '../../index.ts'
import { valueOf } from '../../internal.ts'

// A list that holds a list twice, thirty times over: thirty-one lists in memory, and a thousand million entries
// once it is written out.
let nested: unknown[] = ['x']
for (let i = 0; i < 30; i++) nested = [nested, nested]
const names = { nested, record: { a: 1 } }

const ways: Record<string, () => unknown> = {
  'a text with a value': () => valueOf({ text: ['a', { name: ['nested'] }] }, { names }),
  'the sign + with a text': () => valueOf({ left: 'a', op: '+', right: { name: ['nested'] } }, { names }),
  'the sign + of two lists': () => valueOf({ left: { name: ['nested'] }, op: '+', right: { name: ['nested'] } }, { names }),
  join: () => Reflect.apply(join, undefined, [[nested, nested], '-']),
  concat: () => Reflect.apply(concat, undefined, ['a', nested]),
  'a place that is worked out': () => valueOf({ name: ['record', { name: ['nested'] }] }, { names }),
}

console.log('ready')
const ended: Record<string, { code?: string; ms: number }> = {}
for (const [name, way] of Object.entries(ways)) {
  const from = performance.now()
  let code: string | undefined
  try {
    way()
    code = 'nothing was thrown'
  } catch (error) {
    code = error instanceof TentError ? error.code : String(error)
  }
  ended[name] = { code, ms: Math.round(performance.now() - from) }
}
console.log(JSON.stringify(ended))
