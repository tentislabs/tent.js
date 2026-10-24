import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * One line of work inside a pass: the `run` itself, or one entry of a `step.all` or a `step.first`. A branch is
 * parked when a step of it waits, and lost when its `step.first` went on without it or its run ended.
 */
export interface Branch {
  above?: Branch
  parked: boolean
  lost: boolean
  // The moment at which the last step that its code was answered ended: of a `step.first`, the earliest wins.
  ended: number
  // Settles when the branch is parked.
  rests: Promise<void>
  park(): void
}

const branches = new AsyncLocalStorage<Branch>()

/** Makes a branch, under the one it was made in. */
export function newBranch(above?: Branch): Branch {
  let settle = (): void => undefined
  const branch: Branch = {
    parked: false,
    lost: false,
    ended: 0,
    rests: new Promise<void>((resolve) => {
      settle = resolve
    }),
    park() {
      branch.parked = true
      settle()
    },
    ...(above ? { above } : {}),
  }
  return branch
}

/** Answers the branch that the code which is carried out belongs to: the root of its pass where it is in no other. */
export const branchNow = (root: Branch): Branch => branches.getStore() ?? root

/** Carries work out as part of a branch. */
export const inBranch = <T>(branch: Branch, work: () => T): T => branches.run(branch, work)

/** Whether a branch goes on: neither it nor a branch above it is parked or lost. */
export function goesOn(branch: Branch | undefined): boolean {
  for (let one = branch; one; one = one.above) if (one.parked || one.lost) return false
  return true
}

/** Notes that the code of a branch was answered a step that ended at a moment: so were the branches it stands in. */
export function noteEnded(branch: Branch, at: number | undefined): void {
  if (at === undefined) return
  for (let one: Branch | undefined = branch; one; one = one.above) one.ended = Math.max(one.ended, at)
}

/** A promise that never settles: what a step tool answers a branch that does not go on. */
export const never = <T>(): Promise<T> => new Promise<T>(() => undefined)

/** The works of a `step.all` or a `step.first`: a list of functions, or one arrow for each entry of a list. */
export function worksOf(
  list: unknown[],
  each?: (entry: never, i: number) => Promise<unknown>,
): (() => Promise<unknown>)[] {
  if (each) return list.map((entry, i) => async () => Reflect.apply(each, undefined, [entry, i]))
  return list.map((work) => async () => (typeof work === 'function' ? Reflect.apply(work, undefined, []) : work))
}

/** Starts each entry as a branch of its own. */
function started<T>(root: Branch, works: (() => Promise<T>)[]): { branch: Branch; ended: Promise<T> }[] {
  const above = branchNow(root)
  return works.map((work) => {
    const branch = newBranch(above)
    // An entry that throws before its first wait has ended with that error, as one that throws after it.
    const ended = inBranch(branch, () => new Promise<T>((resolve) => resolve(work())))
    return { branch, ended }
  })
}

/**
 * Carries the entries out side by side and waits for all. Where one of them waits, the branch they were made in
 * is parked once every other one has ended or waits too. Where one fails, the others are lost.
 */
export async function allOf<T>(root: Branch, works: (() => Promise<T>)[]): Promise<T[]> {
  const above = branchNow(root)
  const entries = started(root, works)
  const lose = (): void => {
    for (const { branch } of entries) branch.lost = true
  }
  let answers: ({ value: T } | undefined)[]
  try {
    // An entry that is parked answers nothing here, and one that ended answers its value.
    answers = await Promise.all(
      entries.map(({ branch, ended }) =>
        Promise.race([ended.then((value) => ({ value })), branch.rests.then(() => undefined)]),
      ),
    )
  } catch (error) {
    lose()
    throw error
  }
  const values: T[] = []
  for (const answer of answers) {
    if (!answer) {
      above.park()
      return never()
    }
    values.push(answer.value)
  }
  return values
}

/**
 * Carries the entries out side by side and goes on with the first that ends: the others are lost, and stop at
 * their next step. Of the entries that have ended when the runtime next turns, the one whose last step ended
 * earliest wins: so on a later pass, where the saved steps answer every entry at once, the same entry wins as on
 * the pass where it finished first. Where every entry waits, the branch they were made in is parked.
 */
export function firstOf<T>(root: Branch, works: (() => Promise<T>)[]): Promise<T> {
  const above = branchNow(root)
  const entries = started(root, works)
  let parked = 0
  return new Promise<T>((resolve, reject) => {
    const settled: { branch: Branch; at: number; order: number; end: () => void }[] = []
    const decide = (): void => {
      const [winner] = settled.sort((a, b) => a.at - b.at || a.order - b.order)
      for (const { branch } of entries) if (branch !== winner.branch) branch.lost = true
      winner.end()
    }
    const settle = (branch: Branch, order: number, end: () => void): void => {
      if (!settled.length) setImmediate(decide)
      settled.push({ branch, at: branch.ended, order, end })
    }
    for (const [order, { branch, ended }] of entries.entries()) {
      ended.then(
        (value) => settle(branch, order, () => resolve(value)),
        (error) => settle(branch, order, () => reject(error)),
      )
      void branch.rests.then(() => {
        parked += 1
        if (parked === entries.length) above.park()
      })
    }
  })
}
