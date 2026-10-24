import { anyone, project } from 'tentjs'

// A shop that runs as its own server and is moved to another: its notes keep a sealed secret and a file each. The
// steady load of a test comes from one address, so the counts of a minute are set far above it.
export const moved = project('moved', {
  uploads: anyone('a visitor sends the file of a note'),
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000, uploadsPerMinute: 1000 },
})
