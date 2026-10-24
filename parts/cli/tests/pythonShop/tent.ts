import { project } from 'tentjs'

export const pyshop = project('pyshop', { title: 'Py shop', python: { version: '3.15', build: ['sdistonly'] } })
