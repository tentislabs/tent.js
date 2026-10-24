export const list = [
  { name: 'access/key', load: () => import('./access/key.ts') },
  { name: 'access/role', load: () => import('./access/role.ts') },
  { name: 'build', load: () => import('./build.ts') },
  { name: 'new', load: () => import('./new.ts') },
]
