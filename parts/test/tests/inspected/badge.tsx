import { component, text } from 'tentjs/ui'

export const Badge = component('Badge', {
  props: { label: text() },
  view: ({ label }) => (
    <div id="badge" data-at="badge" style={{ background: '#fde68a' }}>
      <span id="badgeText" data-at="badgeText">
        {label}
      </span>
    </div>
  ),
})
