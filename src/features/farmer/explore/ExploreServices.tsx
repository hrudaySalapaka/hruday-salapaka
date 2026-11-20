import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { farmerExploreConfig } from './farmerExploreConfig'
const services: readonly { title: string; detail: string; href: string; icon: string; disabled?: boolean }[] = farmerExploreConfig.services
export default function ExploreServices() {
  return <section className="fx-section" id="farmer-services"><div className="fx-section-heading"><div><span className="fx-kicker">MORE FOR YOUR FARM</span><h2>Farmer services</h2></div></div><div className="fx-services">{services.map((service) => <article key={service.title} className={service.disabled ? 'is-disabled' : ''}><span>{service.icon}</span><h3>{service.title}</h3><p>{service.detail}</p>{service.disabled ? <small>Coming soon</small> : <Link to={service.href} aria-label={`Open ${service.title}`}><ArrowRight size={16} /></Link>}</article>)}</div></section>
}
