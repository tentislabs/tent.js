import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import type { Socket } from 'node:net'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'

/** What `engine.program()` answers: what this program itself used, counted from its start. */
export interface ProgramUsed {
  id: string
  since: number
  upMs: number
  cpus: number
  memoryLimit?: number
  cpuMs: number
  cpuMsGiven: number
  memoryByteSeconds: number
  memoryPeak: number
  bytesIn: number
  bytesOut: number
  diskBytes: number
  children: { cpuMs: number; memoryByteSeconds: number; memoryPeak: number }
}

// An id made anew at each start, and the moment of that start: a number that began again is not read as a fall.
const id = randomBytes(8).toString('hex')
const since = Date.now()
const began = performance.now()

// What the connections that closed read and wrote, and those that stand open, which are read as they stand.
let closedIn = 0
let closedOut = 0
const open = new Set<Socket>()

// The processor time that this program booked to its apps.
let given = 0
// What the programs that this one started reported of themselves: their processor time and their memory.
const children = { cpuMs: 0, memoryByteSeconds: 0, memoryPeak: 0 }
// The memory that each program this one started said it held last, and when: it stands until it says again.
const childMemory = new WeakMap<object, { bytes: number; at: number }>()

// The memory this program held, measured every minute, and when it was measured last.
let memorySeconds = 0
let measuredAt = performance.now()
let held = process.memoryUsage.rss()
let measuring: NodeJS.Timeout | undefined

// What the data folders took on the disk at the last measure, and when it was taken.
let disk = 0
let diskAt: number | undefined

/** Counts what one connection of the program reads and writes, every connection, those of no app among them. */
export function socketSeen(socket: Socket): void {
  open.add(socket)
  socket.once('close', () => {
    open.delete(socket)
    closedIn += socket.bytesRead
    closedOut += socket.bytesWritten
  })
}

/** Adds processor time that this program measured and booked to an app. */
export function cpuGiven(ms: number): void {
  if (Number.isFinite(ms) && ms > 0) given += ms
}

/**
 * Adds what a program that this one started reported of itself: processor time, and, where it said it, the memory
 * it held then, which counts over time from that report to its next. `of` is that program; one that ended reports
 * a memory of 0.
 */
export function childUsed(cpuMs: number, memory?: number, of: object = children): void {
  if (Number.isFinite(cpuMs) && cpuMs > 0) children.cpuMs += cpuMs
  if (memory === undefined || !Number.isFinite(memory)) return
  const now = performance.now()
  const before = childMemory.get(of)
  if (before) children.memoryByteSeconds += (before.bytes * (now - before.at)) / 1000
  childMemory.set(of, { bytes: memory, at: now })
  children.memoryPeak = Math.max(children.memoryPeak, memory)
}

/** Adds the memory that stood since the last measure, by the size of that measure. */
function measureMemory(): void {
  const now = performance.now()
  memorySeconds += (held * (now - measuredAt)) / 1000
  measuredAt = now
  held = process.memoryUsage.rss()
}

/** Measures the memory of the program every `countEvery` of its engine, from its first engine on. */
export function keepMeasuring(every: number): void {
  if (measuring) return
  measuring = setInterval(measureMemory, every)
  measuring.unref()
}

/** How many bytes a folder holds on the disk, everything in it. */
function folderBytes(folder: string): number {
  if (!existsSync(folder)) return 0
  let size = 0
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true }))
    if (entry.isFile()) {
      try {
        size += statSync(join(entry.parentPath, entry.name)).size
      } catch {
        // A file that went while the folder was read takes nothing.
      }
    }
  return size
}

/**
 * Answers what this program used, for whoever runs it: its processor time and what of it was booked to its apps,
 * its memory, the bytes of all its connections, and what the data folders of its apps take on the disk, measured
 * every `levelEvery` of its engine, an hour where it is not given.
 */
export function programUsed(folders: () => string[], levelEvery = 3_600_000): ProgramUsed {
  measureMemory()
  const now = performance.now()
  if (diskAt === undefined || now - diskAt >= levelEvery) {
    disk = folders().reduce((all, folder) => all + folderBytes(folder), 0)
    diskAt = now
  }
  const used = process.cpuUsage()
  const limit = process.constrainedMemory()
  let bytesIn = closedIn
  let bytesOut = closedOut
  for (const socket of open) {
    bytesIn += socket.bytesRead
    bytesOut += socket.bytesWritten
  }
  return {
    id,
    since,
    upMs: now - began,
    cpus: availableParallelism(),
    ...(limit > 0 ? { memoryLimit: limit } : {}),
    cpuMs: (used.user + used.system) / 1000,
    cpuMsGiven: given,
    memoryByteSeconds: memorySeconds,
    memoryPeak: process.resourceUsage().maxRSS * 1024,
    bytesIn,
    bytesOut,
    diskBytes: disk,
    children: { ...children },
  }
}
