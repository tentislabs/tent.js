import { asset, component, Image } from 'tentjs/ui'

export const Mark = component('Mark', {
  view: () => (
    <span>
      <Image src={asset('star.svg')} alt="" width={16} height={16} />
    </span>
  ),
})
