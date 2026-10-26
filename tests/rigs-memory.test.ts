import assert from 'node:assert/strict'
import { test } from 'node:test'
import { concurrencyOf, memoryThere } from '../rig/memory.ts'

const gigabyte = 1024 ** 3

test('[54-3] the concurrency of a run is the least of the cores less one and the memory there is over the measured peak', () => {
  // Memory to spare: the cores bound it.
  assert.equal(concurrencyOf({ cores: 16, free: 64 * gigabyte, peak: 0.5 * gigabyte }), 15)
  // Little memory: it bounds it.
  assert.equal(concurrencyOf({ cores: 16, free: 3 * gigabyte, peak: 0.5 * gigabyte }), 6)
  // Less than one program's peak, or one core: one program at a time, never none.
  assert.equal(concurrencyOf({ cores: 16, free: 0.2 * gigabyte, peak: 0.5 * gigabyte }), 1)
  assert.equal(concurrencyOf({ cores: 1, free: 64 * gigabyte, peak: 0.5 * gigabyte }), 1)
})

test('[54-3] the memory there is: the free, inactive, speculative and purgeable pages of vm_stat on macOS, MemAvailable on Linux, and the free memory on Windows', () => {
  const vmStat = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               10000.',
    'Pages active:                            200000.',
    'Pages inactive:                           30000.',
    'Pages speculative:                         2000.',
    'Pages throttled:                              0.',
    'Pages wired down:                         90000.',
    'Pages purgeable:                           1000.',
    '"Translation faults":                 123456789.',
  ].join('\n')
  assert.equal(memoryThere('darwin', { vmStat, free: 1 }), (10000 + 30000 + 2000 + 1000) * 16384)
  const meminfo = [
    'MemTotal:       16314880 kB',
    'MemFree:          812344 kB',
    'MemAvailable:    9876543 kB',
    'Buffers:          234567 kB',
    'Cached:          8765432 kB',
  ].join('\n')
  assert.equal(memoryThere('linux', { meminfo, free: 1 }), 9876543 * 1024)
  assert.equal(memoryThere('win32', { free: 7 * gigabyte }), 7 * gigabyte)
})
