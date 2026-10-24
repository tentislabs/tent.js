// A file of the project that is no definition file: `engine.ts` may import it.
export const scanned = (bytes: Uint8Array, info: { kind: string; name: string }, key: string): string =>
  `scanned ${info.name} (${info.kind}, ${bytes.length} bytes) with ${key}`
