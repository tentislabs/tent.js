export const list = [
  { name: 'frame', load: () => import('./frame.ts') },
  { name: 'identify', load: () => import('./identify.ts') },
  { name: 'key', load: () => import('./key.ts') },
  { name: 'session', load: () => import('./session.ts') },
  { name: 'token', load: () => import('./token.ts') },
]
