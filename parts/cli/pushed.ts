import type { Description } from '../core/internal.ts'
import type { History } from '../history/index.ts'
import { impactOf, push } from '../publish/index.ts'
import { serverFetch, targetOf } from './targets.ts'

/**
 * Marks the head of the branch that `now` follows with what the check finds of its files, where it holds no word
 * of it yet: with what a session found of the files as they stand, or else by the check of the command itself.
 */
async function headChecked(
  history: History,
  folder: string,
  found?: { checked?: boolean; description?: Description },
): Promise<void> {
  const head = history.pointer(history.pointer('on') ?? 'main') ?? history.pointer('now')
  if (head === undefined || history.read(head)?.checked !== undefined) return
  if (found?.checked !== undefined && head === history.pointer('now')) {
    history.mark(head, found)
    return
  }
  const { checkProject } = await import('../check/index.ts')
  const checked = await checkProject(folder)
  const passed = !checked.findings.some((one) => one.level === 'error')
  history.mark(head, {
    checked: passed,
    ...(passed ? { description: (await (await import('../build/index.ts')).describeProject(folder)).description } : {}),
  })
}

/**
 * `tent push`: the head is checked where it holds no word of it, and the points the target lacks are sent. Answers
 * how many points and blobs were sent, the target by its name, and where its branch stands now.
 */
export async function pushed(
  history: History,
  folder: string,
  args: object,
  found?: { checked?: boolean; description?: Description },
): Promise<object> {
  const target = targetOf(Reflect.get(args, 'to'))
  await headChecked(history, folder, found)
  const branch = history.pointer('on') ?? 'main'
  // What the push lands on the server's branch, against the branch as this computer last saw it there.
  const describedAt = (point: string | undefined): Description | undefined => {
    const print = point === undefined ? undefined : history.read(point)?.description
    const bytes = print === undefined ? undefined : history.blob(print)
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined
  }
  const seen = describedAt(history.pointer(`seen:${new URL(target.address).origin.toLowerCase()}:${branch}`))
  const head = describedAt(history.pointer(branch) ?? history.pointer('now'))
  const impact = seen && head ? impactOf({ against: `the server's ${branch}`, live: seen, next: head }) : undefined
  const sent = await push({
    history,
    to: target,
    fetch: serverFetch(Reflect.get(args, 'insecure')),
    ...(Reflect.get(args, 'unchecked') === true ? { unchecked: true } : {}),
  })
  return { ...sent, to: target.name, branch, ...(impact ? { impact } : {}) }
}
