export const list = [
  { name: 'alive', load: () => import('./alive.ts') },
  { name: 'at', load: () => import('./at.ts') },
  { name: 'runWatch', load: () => import('./runWatch.ts') },
  { name: 'thrown', load: () => import('./thrown.ts') },
  { name: 'unwatch', load: () => import('./unwatch.ts') },
  { name: 'watch', load: () => import('./watch.ts') },
]
