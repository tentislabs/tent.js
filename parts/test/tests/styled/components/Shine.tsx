import { shine, title } from 'fancy'
import { component } from 'tentjs/ui'

// A component drawn on the server alone that draws with a package whose own code imports the package's style file.
export const Shine = component('Shine', {
  browser: false,
  view: () => (
    <b className={shine()} id="shine">
      {title}
    </b>
  ),
})
