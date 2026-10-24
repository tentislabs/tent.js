// What each name of React gives, whole: a module that is built against the page code imports React by these
// names, and is answered with what the page code itself holds, so that a page and a process hold React once.
import * as react from 'react'
import * as jsxDev from 'react/jsx-dev-runtime'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import * as client from 'react-dom/client'
import { messaging } from '../page/messaged.ts'
import { placing } from '../page/placed.ts'

/** The five names of React, each with everything that name gives. */
export const reactNames: Record<string, object> = {
  react,
  'react/jsx-runtime': { ...jsx, jsx: messaging(jsx.jsx), jsxs: messaging(jsx.jsxs) },
  // React of development is told the place of each tag of a module, which the page code keeps beside what it makes.
  // The small form of the page code holds none of it: only a development build writes the places of its tags.
  'react/jsx-dev-runtime':
    process.env.NODE_ENV !== 'production' && jsxDev.jsxDEV
      ? { ...jsxDev, jsxDEV: placing(messaging(jsxDev.jsxDEV)) }
      : jsxDev,
  'react-dom': dom,
  'react-dom/client': client,
}
