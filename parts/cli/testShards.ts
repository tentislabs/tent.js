import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { fieldsOf, isTestFailure, isFinding } from './answerShapes.ts'
import type { Failure } from './testFailed.ts'

/** What a run of `tent test` reports: its value and its findings, as `--json` prints them. */
export interface Report {
  value: {
    passed: number
    failed: number
    // The tests whose result stood on nothing that changed, which were not run: never counted as passed.
    replayed: number
    notRun?: { test: string; why: string }[]
    files: string[]
    failures: Failure[]
  }
  findings: Finding[]
}

/** Whether what a file holds is a report of a run of the tests, as a run with `--shard` keeps it. */
function isReport(read: unknown): read is Report {
  const value = fieldsOf(fieldsOf(read).value)
  const findings = fieldsOf(read).findings
  const notRun = value.notRun
  return (
    typeof value.passed === 'number' &&
    typeof value.failed === 'number' &&
    typeof value.replayed === 'number' &&
    Array.isArray(value.failures) &&
    value.failures.every(isTestFailure) &&
    Array.isArray(value.files) &&
    value.files.every((one) => typeof one === 'string') &&
    Array.isArray(findings) &&
    findings.every(isFinding) &&
    (notRun === undefined ||
      (Array.isArray(notRun) &&
        notRun.every((one) => typeof fieldsOf(one).test === 'string' && typeof fieldsOf(one).why === 'string')))
  )
}

/**
 * Takes the test files of a project in the order of their names, and a share as `--shard` writes it, `<n>/<of>`.
 * Answers the files of that share: the files split by their names into `of` runs one after another, as even as they
 * go, and the `n`th of them. Throws T0002 for a share of no form, or one past the last.
 */
export function shareOf(files: string[], written: string): string[] {
  const found = /^(\d+)\/(\d+)$/.exec(written)
  const [n, of] = found ? [Number(found[1]), Number(found[2])] : [0, 0]
  if (!found || n < 1 || of < 1 || n > of)
    throw new TentError('T0002', `${JSON.stringify(written)} is no share of the tests.`, {
      fix: 'Name a share as `--shard 2/4`: the second of four.',
      fields: { shard: 'pattern' },
    })
  return files.slice(Math.floor(((n - 1) * files.length) / of), Math.floor((n * files.length) / of))
}

/** Where a run keeps its report in the folder of the project, which a machine of a share hands on. */
const reportOf = (project: string): string => join(project, 'results', 'tests', 'report.json')

/** Keeps the report of a run in the folder of the project. */
export function keepReport(project: string, report: Report): void {
  mkdirSync(join(project, 'results', 'tests'), { recursive: true })
  writeFileSync(reportOf(project), `${JSON.stringify(report, null, 2)}\n`)
}

/**
 * `tent test --join <folders>`: takes the folders of the reports of the shares of one suite, each holding the
 * `report.json` of a run, or the folder of a project that holds one in `results/tests/`. Answers the one report of
 * them all, as one run gives it: what passed, failed and was replayed added up, each counted apart, and the files and
 * findings of each, in the order of the folders. Throws T0001 for a folder that holds no report.
 */
export function joined(folders: string[]): Report {
  const all: Report = { value: { passed: 0, failed: 0, replayed: 0, files: [], failures: [] }, findings: [] }
  const notRun: { test: string; why: string }[] = []
  for (const folder of folders) {
    const file = [join(folder, 'report.json'), reportOf(folder)].find(existsSync)
    if (!file)
      throw new TentError('T0001', `${folder} holds no report of a run of the tests.`, {
        fix: 'Name the folder that a run with `--shard` kept its `results/tests/report.json` in.',
      })
    const read: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isReport(read))
      throw new TentError('T0001', `${file} is no report of a run of the tests.`, {
        fix: 'Name the folder that a run with `--shard` kept its `results/tests/report.json` in.',
      })
    const one = read
    all.value.passed += one.value.passed
    all.value.failed += one.value.failed
    all.value.replayed += one.value.replayed
    all.value.files.push(...one.value.files)
    all.value.failures.push(...one.value.failures)
    notRun.push(...(one.value.notRun ?? []))
    all.findings.push(...one.findings)
  }
  all.value.files.sort()
  return notRun.length ? { ...all, value: { ...all.value, notRun } } : all
}
