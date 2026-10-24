import { member } from '../handle.ts'

/**
 * What a person allowed a program: which program, by its name as the person was shown it, what for, when it was
 * given and last used, and when a renewal token of it was last used a second time.
 */
interface Grant {
  id: string
  client: string
  name: string
  scopes: string[]
  for: 'mcp' | 'app'
  createdAt: Date
  usedAt: Date
  reusedAt?: Date
}

/** The handle of what people allowed programs: the caller's own, and any with full access. It answers at once. */
interface Grants {
  list(user?: string): Grant[]
  end(id: string): void
}

export const grants: Grants = {
  list: member('grants', 'list'),
  end: member('grants', 'end'),
}
