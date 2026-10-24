import { project } from 'tentjs'

export const fakedUnits = project('fakedUnits', {
  title: 'Faked units',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
