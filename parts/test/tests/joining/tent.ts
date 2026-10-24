import { project } from 'tentjs'

// The project of one key started at every door. A call of an action is cut at two seconds, so that a run that
// waits an hour outlasts it and the caller is answered the run.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, actionTime: '2 seconds' },
  mcp: { names: {} },
})
