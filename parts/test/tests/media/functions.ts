import { action, anyone, change, file, files, query, table, text } from 'tentjs'

const open = anyone('a test hands photos in and shows them')

// A photo that everyone may see is held by a row that everyone may read.
export const photos = table('photos', {
  columns: { title: text(), photo: file({ kinds: ['image/*'], maxSize: '1 MB' }) },
  access: { read: 'anyone', add: open },
})

export const addPhoto = change('addPhoto', {
  access: open,
  input: {
    title: text({ help: 'What the photo shows' }),
    photo: file({ kinds: ['image/*'], maxSize: '1 MB', label: 'The photo' }),
  },
  run: ({ input, db }) => db.photos.add({ title: input.title, photo: input.photo }),
})

export const allPhotos = query('allPhotos', {
  access: open,
  run: ({ db }) => db.photos.all(),
})

// A draft is read by its owner alone, and the system adds it: a page shows its photo through a query with full
// access, so the page is drawn with a picture that a visitor may not download.
export const drafts = table('drafts', {
  columns: { title: text(), photo: file({ kinds: ['image/*'], maxSize: '1 MB' }) },
  access: { read: 'owner' },
})

const poster =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAOklEQVR42u3PQQkAAAgEsItjJjMZ2gw+hcEKLDX9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEbhbBn36ILpbTtgAAAABJRU5ErkJggg=='

export const putDraft = action('putDraft', {
  access: open,
  output: text(),
  run: async () =>
    files.put(Uint8Array.from(atob(poster), (one) => one.charCodeAt(0)), { name: 'draft.png', kind: 'image/png' }),
})

export const addDraft = change('addDraft', {
  access: open,
  system: 'a test adds a draft that nobody may read',
  input: { photo: file({ kinds: ['image/*'], maxSize: '1 MB' }) },
  run: ({ input, db }) => db.system.drafts.add({ title: 'A draft', photo: input.photo }),
})

export const allDrafts = query('allDrafts', {
  access: open,
  system: 'a test shows the drafts to everyone, though nobody may download their photos',
  run: ({ db }) => db.system.drafts.all(),
})
