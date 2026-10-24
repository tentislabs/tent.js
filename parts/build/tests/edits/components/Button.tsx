import { component } from 'tentjs/ui'

export const Button = component('Button', {
  view: ({ children }) => (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', background: '#2f5bea', color: '#ffffff' }}>
      {children}
    </div>
  ),
})
