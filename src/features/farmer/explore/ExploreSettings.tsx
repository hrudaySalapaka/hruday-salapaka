import { useEffect, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { farmerExploreConfig } from './farmerExploreConfig'
const KEY = 'khetigo.farmer.explore.sections'
export type ExploreSections = typeof farmerExploreConfig.sections
export default function ExploreSettings({ onChange }: { onChange: (sections: ExploreSections) => void }) {
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState<ExploreSections>(farmerExploreConfig.sections)
  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (saved) { const parsed = { ...farmerExploreConfig.sections, ...JSON.parse(saved) } as ExploreSections; setSections(parsed); onChange(parsed) } } catch { /* Ignore invalid local preferences. */ } }, [onChange])
  function toggle(key: keyof ExploreSections) { const next = { ...sections, [key]: !sections[key] }; setSections(next); onChange(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  return <div className="fx-settings"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><Globe2 size={17} /> Customize explore</button>{open && <div className="fx-settings-panel"><strong>Visible sections</strong>{(Object.keys(sections) as (keyof ExploreSections)[]).map((key) => <label key={key}><input type="checkbox" checked={sections[key]} onChange={() => toggle(key)} />{key[0].toUpperCase() + key.slice(1)}</label>)}</div>}</div>
}
