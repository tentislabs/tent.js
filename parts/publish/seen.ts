/** The name of the pointer that keeps where a target's branch stood at the last push or pull. */
export const seenAt = (address: string, branch: string): string =>
  `seen:${new URL(address).origin.toLowerCase()}:${branch}`
