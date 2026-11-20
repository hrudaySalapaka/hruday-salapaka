import { Apple, Boxes, Flower2, Leaf, Wheat } from 'lucide-react'
import { Link } from 'react-router-dom'

const categories = [
  { label: 'Farm Products', query: '', icon: Boxes },
  { label: 'Grain', query: 'grain|grains|rice|wheat|maize|corn|millet|barley|oat|pulse|lentil', icon: Wheat },
  { label: 'Fruits & Vegetables', query: 'fruit|vegetable|apple|mango|banana|tomato|potato|onion|citrus|berry', icon: Apple },
  { label: 'Seeds', query: 'seed|seeds', icon: Flower2 },
  { label: 'Fertilizers', query: 'fertilizer|fertiliser|manure|compost|soil nutrition', icon: Leaf },
]

export default function ExploreCategories({ onPick }: { onPick: (query: string) => void }) {
  return <section className="fx-section"><div className="fx-section-heading"><div><span className="fx-kicker">BROWSE BY</span><h2>Shop categories</h2></div></div><div className="fx-categories">{categories.map(({ label, query, icon: Icon }) => <Link key={label} to={query ? `/farmer/explore?category=${encodeURIComponent(query)}` : '/farmer/explore'} onClick={() => onPick(query)}><span><Icon size={22} /></span><b>{label}</b></Link>)}</div></section>
}
