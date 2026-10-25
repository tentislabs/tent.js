import { anyone, table, text } from 'tentjs'

export const features = table('features', {
  columns: {
    name: text({ min: 1, max: 80 }),
    summary: text({ min: 1, max: 200 }),
    body: text({ lines: 'many', max: 20000 }),
    picture: text({ max: 120 }),
    video: text({ optional: true, max: 300, pattern: '^https://www\\.youtube-nocookie\\.com/embed/[A-Za-z0-9_-]+$' }),
  },
  access: { read: anyone('the features are what the site shows every visitor') },
})
