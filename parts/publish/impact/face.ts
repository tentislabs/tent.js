/** One finding of an impact: the definition by its name and its file, what kind it is, and what changed in words. */
export interface ImpactLine {
  name: string
  kind: string
  file: string
  change: string
  // How many functions and screens depend on it, and how many callers used it in the last 30 days, by the log.
  reaches?: number
  callers?: number
}

/** One thing that a changed definition reaches, with what reaches on from it. */
export interface Reached {
  name: string
  kind: string
  // The doors it is offered to, and whether a page of it is kept in the cache as public.
  offered?: string[]
  cached?: true
  under: Reached[]
}

/** What a change reaches before it lands, the weightiest part first, as `tent impact --json` prints it. */
export interface Impact {
  against: string
  rights: ImpactLine[]
  breaks: ImpactLine[]
  data: ImpactLine[]
  work: ImpactLine[]
  reaches: { name: string; tree: Reached[] }[]
  tests: { name: string; tests: string[] }[]
  untested: string[]
  out: ImpactLine[]
}

/**
 * What a running app tells of itself that the description does not: the callers of each function in the last 30
 * days, the rows of each table and the files of each tenant table, the rows that `lasts` would remove at its
 * first pass, the runs that stand at each step, and what each test touched in its last run.
 */
export interface ImpactFacts {
  callers?: Record<string, number>
  rows?: Record<string, number>
  files?: Record<string, number>
  kept?: Record<string, number>
  runs?: { flow: string; step: string; count: number }[]
  touched?: Record<string, string[]>
}
