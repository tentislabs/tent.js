import { project } from 'tentjs'

// An action may take far less time than the fetch of a part is waited for: the wait is no part of its time.
export const parted = project('parted', {
  backups: { every: false },
  limits: { actionTime: '400 ms', fetchTime: '10 seconds' },
})
