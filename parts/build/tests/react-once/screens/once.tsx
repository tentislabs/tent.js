import * as React from 'react'
import { screen } from 'tentjs/ui'
// Two packages that the test writes into `node_modules`: one imports `react` and `react-dom`, and one asks for
// `react` by `require`.
import { required } from 'asks-react'
import { Counted, hookOf } from 'has-react'

export const onceScreen = screen('onceScreen', {
  path: '/once',
  access: 'anyone',
  view: () => (
    <div>
      <span>{String(hookOf() === React.useState)}</span>
      <span>{String(required() === React.useState)}</span>
      <Counted />
    </div>
  ),
})
