import type { Finding as Found } from '../../core/index.ts'
import type { ImpactLine, Impact } from './face.ts'

/** What a target answers of a publish that the impact holds as its parts. */
interface Asked {
  hard: boolean
  opens: boolean
  behind?: number
  findings?: Found[]
  old?: { table: string; column: string; old: number; perDay?: Record<string, number> }[]
}

/**
 * Takes the impact of a change and what the target answered of the publish. Answers the impact as the one report of
 * the publish: what `try` says of the switch and of the files of tenants behind it is part of "data", and the runs
 * that wait on older versions and the values the change makes old are part of "work under way".
 */
export function reportOf(impact: Impact, asked: Asked): Impact {
  const data: ImpactLine[] = [
    ...(asked.hard ? [{ name: 'switch', kind: 'version', file: '', change: 'a hard switch' }] : []),
    ...(asked.opens ? [{ name: 'engine.ts', kind: 'file', file: 'engine.ts', change: 'opens the app again' }] : []),
    ...(asked.behind
      ? [{ name: 'tenants', kind: 'files', file: '', change: `${asked.behind} files of tenants behind the layout` }]
      : []),
  ]
  const work: ImpactLine[] = [
    ...(asked.findings ?? []).map((one) => ({
      name: String(one.where?.definition ?? one.code),
      kind: 'run',
      file: String(one.where?.file ?? ''),
      change: one.message,
    })),
    ...(asked.old ?? []).map((one) => ({
      name: `${one.table}.${one.column}`,
      kind: 'column',
      file: '',
      change: `${one.old} ${one.old === 1 ? 'value becomes' : 'values become'} old; its by states ${one.perDay === undefined ? 'no perDay' : `perDay ${JSON.stringify(one.perDay)}`}`,
    })),
  ]
  return { ...impact, data: [...data, ...impact.data], work: [...impact.work, ...work] }
}
