import assert from 'node:assert/strict'
import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../../core/index.ts'
import type { Facts } from '../../core/internal.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'

/** The root of the repository. */
const root = join(import.meta.dirname, '..', '..', '..')

/** The folder of a project of the tests, as it lies beside them. */
export const lying = (name: string): string => join(import.meta.dirname, name)

/**
 * Takes the name of a project of the tests, and a name for the copy. Copies the project to a folder of its own
 * under `results/`, where a check may write the type list and what it keeps, and answers that folder.
 */
export function copyOf(name: string, as: string): string {
  const copy = join(root, 'results', 'check', as)
  rmSync(copy, { recursive: true, force: true })
  cpSync(lying(name), copy, { recursive: true })
  return copy
}

/**
 * Takes the name of a rule of the list, as `T2013/column`, and the facts of a running app where it reads them.
 * Holds the rule to its two projects: it is built, its passing project gives nothing, and its failing project gives
 * findings of its code and of no other. Answers the findings of the failing project and the folder of its copy.
 */
export async function heldToProjects(name: string, facts?: Facts): Promise<{ findings: Finding[]; folder: string }> {
  assert.ok(
    list.some((one) => one.name === name),
    `the rule ${name} is built`,
  )
  const checked = async (side: 'pass' | 'fail') => {
    const folder = copyOf(join(name, side), `${name.replace('/', '-')}-${side}`)
    return { findings: (await checkRules(folder, facts ? { facts } : {})).findings, folder }
  }
  assert.deepEqual((await checked('pass')).findings, [], `the passing project of ${name}`)
  const failing = await checked('fail')
  assert.ok(failing.findings.length > 0, `the failing project of ${name} is found`)
  assert.deepEqual(
    [...new Set(failing.findings.map((one) => one.code))],
    [name.split('/')[0]],
    `the failing project of ${name}`,
  )
  return failing
}

/** The line of a text that holds a piece of it, counted from 1, or 0 where none does. */
export const lineWith = (text: string, piece: string): number =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .findIndex((line) => line.includes(piece)) + 1
