import { project, secret } from 'tentjs'

export const churny = project('churny', {
  title: 'Churny',
  roots: ['../shared'],
  python: {
    version: '3.15',
    index: [{ url: 'https://packages.example.com/simple', user: secret('INDEX_USER'), password: secret('INDEX_PASSWORD') }],
    build: ['sdistonly'],
  },
})
