import { anyone, project } from 'tentjs'

export const uploaded = project('uploaded', {
  title: 'Files that are sent in parts, straight to a store, and shared by a signed address for a time',
  uploads: anyone('a test uploads as nobody'),
  backups: { every: false },
})
