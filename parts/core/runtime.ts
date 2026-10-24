import { TentError } from './errors.ts'

/** What the engine puts into the slot: the one way by which a word of this part reaches the work behind it. */
export interface Runtime {
  call(definition: string, args: unknown[]): unknown
  handle(name: string): object
  start(flow: string, input: unknown): unknown
  emit(event: string, data: unknown): void
  draw(
    word: 'now' | 'random' | 'token' | 'zone' | 'mayWait' | 'valueSize',
    args: unknown[],
  ): { value: unknown } | undefined
}

let slot: Runtime | null = null

/** Takes the runtime that the words reach from now on, or `null` to empty the slot. */
export function setRuntime(runtime: Runtime | null): void {
  slot = runtime
}

/** Answers what stands in the slot, or `null` where it is empty. */
export const filled = (): Runtime | null => slot

/** Takes the name of what is being used. Answers the runtime. Throws T0010 where the slot is empty. */
export function runtime(used: string): Runtime {
  if (!slot) {
    throw new TentError('T0010', `${used} was used with no engine: nothing stands in the runtime slot.`, {
      fix: 'Run the code inside an engine, or hand a runtime to setRuntime in a test.',
    })
  }
  return slot
}
