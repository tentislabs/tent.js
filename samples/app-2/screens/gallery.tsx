import { anyone, asset, Image, Link, read, screen, message } from 'tentjs/ui'
import { SiteFrame } from '../components/SiteFrame'
import { featureList } from '../functions/features'
import { featureScreen } from './feature'
import './gallery.css'

export const galleryScreen = screen('galleryScreen', {
  path: '/gallery',
  title: message('gallery.title'),
  access: anyone('the gallery is for every visitor'),
  layout: SiteFrame,
  seo: { description: message('gallery.description') },
  data: { features: read(featureList) },
  view: ({ features }) => {
    return (
      <main className="gallery">
        <h1>{message('gallery.title')}</h1>
        <p className="lead">{message('gallery.lead')}</p>
        {features.length === 0 && <p className="empty">{message('gallery.empty')}</p>}
        <ul className="row">
          {features.map((feature) => (
            <li key={feature.id}>
              <Link to={featureScreen} with={{ id: feature.id }}>
                <Image
                  src={asset(feature.picture)}
                  alt=""
                  sizes="(min-width: 900px) 40vw, 80vw"
                  style={{ viewTransitionName: `picture-${feature.id}` }}
                />
                <span className="name">{feature.name}</span>
                <span className="summary">{feature.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    )
  },
})
