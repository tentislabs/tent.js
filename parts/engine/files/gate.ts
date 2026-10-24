import { TentError } from '../../core/index.ts'
import type { FileName, Tx } from '../../data/index.ts'
import { NotReady } from '../../data/index.ts'
import { noteNotReady } from './attempt.ts'

/**
 * The tables whose rows move from one way to the other now, with what is kept once the move has ended. `again`: a
 * raw text that states no table wrote since the rows were added, so what was added may be old. `settled`: the move
 * takes its last write next, and such a text waits from now on.
 */
export interface Moving {
  tables: Set<string>
  done: Promise<void>
  again: boolean
  settled: boolean
}

// What a write of a table that moves is told to wait for: it names no file.
export const waitsForMove: FileName = { table: '', id: 'move' }

/** Tells whoever writes that the move is waited for. */
function wait(): never {
  noteNotReady(waitsForMove)
  throw new NotReady(waitsForMove)
}

/** A write as it is handed out while rows move: one that names a table which moves is told to wait. */
export function gated(tx: Tx, move: Moving): Tx {
  const hold = (table: string): void => {
    if (move.tables.has(table)) wait()
  }
  return {
    ...tx,
    add(table, values, caller) {
      hold(table)
      return tx.add(table, values, caller)
    },
    change(table, id, values, caller) {
      hold(table)
      return tx.change(table, id, values, caller)
    },
    remove(table, id, caller) {
      hold(table)
      tx.remove(table, id, caller)
    },
    sql(text, values, touches) {
      for (const table of touches ?? []) hold(table)
      if (touches?.length) return tx.sql(text, values, touches)
      // A text that states no table may write any. One that only reads is answered. One that writes is a write
      // of every table that moves: it is taken where the rows still stand, and the move adds its rows anew
      // before its last write. Once that write is next, nothing could carry it over any more, and it waits.
      try {
        return tx.sqlRead(text, values)
      } catch (error) {
        if (!(error instanceof TentError && error.code === 'T0012')) throw error
      }
      if (move.settled) wait()
      move.again = true
      return tx.sql(text, values, touches)
    },
  }
}
