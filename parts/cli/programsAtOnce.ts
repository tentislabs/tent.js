// The memory there is for programs on this computer, and how many test programs run at once: of the framework's run
// and of `tent test` alike.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { availableParallelism, freemem } from 'node:os'

/** The number of a line of `vm_stat` or of `/proc/meminfo` that begins with its name, or 0 where it has none. */
function numberOf(text: string, name: string): number {
  const found = new RegExp(`^${name}:\\s*(\\d+)`, 'm').exec(text)
  return found ? Number(found[1]) : 0
}

/**
 * Takes a system and what it tells of its memory: the text of `vm_stat` on macOS, of `/proc/meminfo` on Linux, and
 * the free memory as the runtime reads it. Answers the bytes there are for programs to take: on macOS the free,
 * inactive, speculative and purgeable pages by the size of a page, since what the system holds as cache it gives
 * back; on Linux `MemAvailable`; elsewhere the free memory, which on Windows leaves nothing of that kind out.
 */
export function memoryThere(
  system: NodeJS.Platform,
  told: { vmStat?: string; meminfo?: string; free: number },
): number {
  if (system === 'darwin' && told.vmStat !== undefined) {
    const page = Number(/page size of (\d+) bytes/.exec(told.vmStat)?.[1] ?? 4096)
    const pages = ['Pages free', 'Pages inactive', 'Pages speculative', 'Pages purgeable'].map((name) =>
      numberOf(told.vmStat ?? '', name),
    )
    return pages.reduce((sum, one) => sum + one, 0) * page
  }
  if (system === 'linux' && told.meminfo !== undefined) return numberOf(told.meminfo, 'MemAvailable') * 1024
  return told.free
}

/** The bytes there are for programs to take on this computer now, read as `memoryThere` reads them. */
export function memoryNow(): number {
  const free = freemem()
  try {
    if (process.platform === 'darwin')
      return memoryThere('darwin', { vmStat: execFileSync('vm_stat', { encoding: 'utf8' }), free })
    if (process.platform === 'linux')
      return memoryThere('linux', { meminfo: readFileSync('/proc/meminfo', 'utf8'), free })
  } catch {
    // A system that does not tell it so is read by what the runtime tells.
  }
  return free
}

/**
 * Takes the processor's cores, the bytes there are, and the most a test program takes. Answers how many test
 * programs run at once: the least of the cores less one and as many as the memory holds, and one at the least.
 */
export const concurrencyOf = (o: { cores: number; free: number; peak: number }): number =>
  Math.max(1, Math.min(o.cores - 1, Math.floor(o.free / o.peak)))

/**
 * The cores of this computer's processor that this program may use: those its affinity and its system's limits leave
 * it, as a machine of the runs or a container gives fewer than the processor holds.
 */
export const coresHere = (): number => availableParallelism()
