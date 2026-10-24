import { readFileSync } from 'node:fs'

/**
 * The place of `memory.events` of the group that this program runs in, by `/proc/self/cgroup`: its line of the
 * unified groups, `0::<path>`, names it, which is `/` inside a container and the group of the service elsewhere.
 */
function eventsOfGroup(): string | undefined {
  const line = /^0::(\/.*)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'))
  if (!line) return undefined
  const path = line[1] === '/' ? '' : line[1]
  return `/sys/fs/cgroup${path}/memory.events`
}

/**
 * The count of programs that the system ended for want of memory in the group of this program, where the system
 * says it: on Linux, `oom_kill` of the group's `memory.events`. Elsewhere nothing, and no cause is named.
 */
export function memoryKills(): number | undefined {
  if (process.platform !== 'linux') return undefined
  try {
    const place = eventsOfGroup()
    if (place === undefined) return undefined
    const found = /^oom_kill (\d+)$/m.exec(readFileSync(place, 'utf8'))
    return found ? Number(found[1]) : undefined
  } catch {
    return undefined
  }
}
