import { checkInto } from './checked.ts'
import { isStored } from './record.ts'
import { isRequired } from './required.ts'
import type { Type } from './type.ts'
import { shapeOf } from './types/ref.ts'

/**
 * What the browser checks of one field of an input before a form sends it, made once from the field's type: whether
 * it must be given, and the type the door holds it to, as plain values, with its limits that the words of a failed
 * check name.
 */
export interface FieldCheck {
  required: boolean
  type: Type
}

const isType = (value: unknown): value is Type => isStored(value) && typeof value.kind === 'string'

/**
 * A type as plain values, which a stub holds: a shape that is kept under a name stands in its place, but one that
 * holds itself, which stays named. What is no value of a type, as code, is left out.
 */
function plainOf(value: unknown, named: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((one) => plainOf(one, named))
  if (!isStored(value)) return typeof value === 'function' ? undefined : value
  if (value.kind === 'ref' && typeof value.name === 'string' && !named.has(value.name)) {
    let shape: Type | undefined
    try {
      shape = shapeOf(value.name)
    } catch {
      shape = undefined
    }
    if (shape) {
      const { kind: _, name: __, ...over } = value
      return plainOf({ ...shape, ...over }, new Set([...named, value.name]))
    }
  }
  const plain: Record<string, unknown> = {}
  for (const [key, one] of Object.entries(value)) {
    const made = plainOf(one, named)
    if (made !== undefined) plain[key] = made
  }
  return plain
}

/**
 * Takes the types of the input of a function. Answers the check of each of its fields, by its name: plain values,
 * which a stub holds, made once so that a send reads no type.
 */
export function checksOf(input: Record<string, unknown>): Record<string, FieldCheck> {
  const checks: Record<string, FieldCheck> = {}
  for (const [name, type] of Object.entries(input)) {
    const plain = plainOf(type, new Set())
    if (isType(plain)) checks[name] = { required: isRequired(plain), type: plain }
  }
  return checks
}

/**
 * Takes the checks of a form's function and what it sends. Answers, by the dotted name of each field that fails, the
 * check it fails: the door's own check, carried out in the browser on the plain types of the checks, as a help to
 * the person. A type that the browser cannot follow, as a shape that holds itself, is left to the door.
 */
export function checkedBy(checks: Record<string, FieldCheck>, values: Record<string, unknown>): Record<string, string> {
  const failed: Record<string, string> = {}
  for (const [name, check] of Object.entries(checks)) {
    let found: ReturnType<typeof checkInto>
    try {
      found = checkInto(check.type, values[name])
    } catch {
      continue
    }
    for (const one of found)
      for (const [path, what] of Object.entries(Object(one.fields))) {
        const field = path ? `${name}.${path}` : name
        if (!Object.hasOwn(failed, field)) failed[field] = String(what)
      }
  }
  return failed
}
