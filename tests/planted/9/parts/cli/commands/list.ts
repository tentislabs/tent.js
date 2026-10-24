export const list = [
  { name: 'Zed', load: () => import('./Zed.ts') },
  { name: 'access/key', load: () => import('./access/key.ts') },
  { name: 'access/role', load: () => import('./access/role.ts') },
  { name: 'build', load: () => import('./build.ts') },
  { name: 'new', load: () => import('./new.ts') },
]
