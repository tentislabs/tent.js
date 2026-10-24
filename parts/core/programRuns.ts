/** Whether a program of that number runs on this computer. */
export function programRuns(pid: number): boolean {
  try {
    // The signal 0 ends nothing: the system only says whether it could be sent.
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Reflect.get(Object(error), 'code') === 'EPERM'
  }
}
