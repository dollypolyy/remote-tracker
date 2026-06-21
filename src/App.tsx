import { useState, useCallback } from 'react'
import { Layout, type TabId } from './components/Layout'
import { HomeTab } from './tabs/HomeTab'
import { MapTab } from './tabs/MapTab'
import { PeopleTab } from './tabs/PeopleTab'
import { HypothesesTab } from './tabs/HypothesesTab'
import { DiaryTab } from './tabs/DiaryTab'
import { useCollection } from './hooks/useStorage'
import { todayStr } from './storage'

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [statsKey, setStatsKey] = useState(0)

  const { items: ways } = useCollection('ways')
  const { items: people } = useCollection('people')
  const { items: hypotheses } = useCollection('hypotheses')

  const handleDataChange = useCallback(() => {
    setStatsKey((k) => k + 1)
  }, [])

  const today = todayStr()
  const stats = {
    totalWays: ways.length,
    todayWays: ways.filter((w) => w.createdAt?.slice(0, 10) === today).length,
    shortlist: ways.filter((w) => w.energy === '↑').length,
    activePeople: people.filter(
      (p) => p.outreachStatus !== 'архив' && p.outreachStatus !== 'не писала' && p.outreachStatus !== ''
    ).length,
    activeHypotheses: hypotheses.filter((h) => !h.decision || h.decision === 'развивать').length,
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab} onDataChange={handleDataChange}>
      {tab === 'home' && (
        <HomeTab
          key={statsKey}
          {...stats}
          onNavigate={setTab}
          onDataChange={handleDataChange}
        />
      )}
      {tab === 'map' && <MapTab key={statsKey} />}
      {tab === 'people' && <PeopleTab key={statsKey} />}
      {tab === 'hypotheses' && <HypothesesTab key={statsKey} />}
      {tab === 'diary' && <DiaryTab key={statsKey} {...stats} />}
    </Layout>
  )
}
