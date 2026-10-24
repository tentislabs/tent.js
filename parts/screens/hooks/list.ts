export const list = [
  { name: 'useAgent', load: () => import('./useAgent.ts') },
  { name: 'useCall', load: () => import('./useCall.ts') },
  { name: 'useField', load: () => import('./useField.ts') },
  { name: 'useGoTo', load: () => import('./useGoTo.ts') },
  { name: 'useMicrophone', load: () => import('./useMicrophone.ts') },
  { name: 'useNonce', load: () => import('./useNonce.ts') },
  { name: 'useParams', load: () => import('./useParams.ts') },
  { name: 'useQuery', load: () => import('./useQuery.ts') },
  { name: 'useRun', load: () => import('./useRun.ts') },
  { name: 'useSettings', load: () => import('./useSettings.ts') },
  { name: 'useTranslations', load: () => import('./useTranslations.ts') },
  { name: 'useUser', load: () => import('./useUser.ts') },
]
