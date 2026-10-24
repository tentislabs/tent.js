/** A signed-in person, as code is handed one. */
export interface User {
  id: string
  roles: string[]
}

/** On whose behalf a call runs. */
export interface Caller {
  kind: 'user' | 'key' | 'mcp' | 'system' | 'nobody'
  user?: User
  key?: { id: string; scopes: string[]; roles: string[]; rights?: string[] }
  visitor?: string
  grant?: { id: string; client: string; scopes: string[]; for: 'mcp' | 'app' }
  // Of the kind `system`: a starter of the engine's own, as `fill:<table>.<column>`, which a column keeps as `system:<id>`.
  starter?: string
}
