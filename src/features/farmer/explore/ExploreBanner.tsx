import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { farmerExploreConfig } from './farmerExploreConfig'

const AUTOPLAY_INTERVAL = 5000
const SWIPE_THRESHOLD = 48

export default function ExploreBanner() {
  const slides = farmerExploreConfig.banners
  const [activeIndex, setActiveIndex] = useState(0)
  const pointerStartX = useRef<number | null>(null)

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length)
    }, AUTOPLAY_INTERVAL)
    return () => window.clearInterval(timer)
  }, [slides.length])

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    pointerStartX.current = event.clientX
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (pointerStartX.current === null) return
    const distance = event.clientX - pointerStartX.current
    pointerStartX.current = null
    if (Math.abs(distance) < SWIPE_THRESHOLD) return
    setActiveIndex((current) => (current + (distance < 0 ? 1 : -1) + slides.length) % slides.length)
  }

  return <section className="fx-carousel" aria-label="KHETIGO promotions" aria-roledescription="carousel">
    <div className="fx-carousel-window" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStartX.current = null }}>
      <div className="fx-carousel-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
        {slides.map((slide, index) => {
          const SlideIcon = slide.icon
          return <article className={`fx-promo-slide fx-promo-${slide.theme}`} key={slide.theme} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`}>
            <div className="fx-promo-copy">
              <span className="fx-promo-eyebrow">{slide.eyebrow}</span>
              <h2>{slide.title}</h2>
              <p>{slide.detail}</p>
              <Link to={slide.href}>{slide.action}<ArrowRight size={16} /></Link>
            </div>
            <div className="fx-promo-art" aria-hidden="true"><span className="fx-promo-orbit" /><span className="fx-promo-disc"><SlideIcon size={70} strokeWidth={1.25} /></span><span className="fx-promo-spark fx-promo-spark-one" /><span className="fx-promo-spark fx-promo-spark-two" /></div>
          </article>
        })}
      </div>
    </div>
    <div className="fx-carousel-dots" role="group" aria-label="Choose a promotion">
      {slides.map((slide, index) => <button key={slide.theme} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show promotion ${index + 1}: ${slide.title}`} aria-pressed={index === activeIndex}><span /></button>)}
    </div>
  </section>
}
