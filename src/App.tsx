import { useState } from 'react'
import { Home } from './screens/Home'
import { Diary } from './screens/Diary'
import { Stats } from './screens/Stats'
import nav from './nav.module.css'

type Tab = 'home' | 'diary' | 'stats'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <>
      {tab === 'home' && <Home />}
      {tab === 'diary' && <Diary onBack={() => setTab('home')} />}
      {tab === 'stats' && <Stats onBack={() => setTab('home')} />}

      <nav className={nav.nav}>
        <button
          className={`${nav.btn} ${tab === 'home' ? nav.active : ''}`}
          onClick={() => setTab('home')}
          aria-label="дом"
        >⌂</button>
        <button
          className={`${nav.btn} ${tab === 'stats' ? nav.active : ''}`}
          onClick={() => setTab('stats')}
          aria-label="статистика"
        >▤</button>
        <button
          className={`${nav.btn} ${tab === 'diary' ? nav.active : ''}`}
          onClick={() => setTab('diary')}
          aria-label="дневник"
        >✎</button>
      </nav>
    </>
  )
}
