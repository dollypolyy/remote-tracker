import styles from './Layout.module.css'
import { ExportImport } from './ExportImport'

export type TabId = 'home' | 'map' | 'people' | 'hypotheses' | 'diary'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: 'главная', icon: '🏠' },
  { id: 'map', label: 'способы', icon: '🗺' },
  { id: 'people', label: 'люди', icon: '👥' },
  { id: 'hypotheses', label: 'гипотезы', icon: '💡' },
  { id: 'diary', label: 'итог дня', icon: '✨' },
]

interface Props {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onDataChange: () => void
  children: React.ReactNode
}

export function Layout({ activeTab, onTabChange, onDataChange, children }: Props) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerStripes} aria-hidden="true" />
        <div className={styles.headerInner}>
          <h1 className={styles.logo}>remote tracker</h1>
          <ExportImport onImport={onDataChange} />
        </div>
      </header>

      <nav className={styles.tabBar} role="tablist" aria-label="Разделы">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
