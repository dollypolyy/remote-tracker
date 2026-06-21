import { useRef } from 'react'
import { storage } from '../storage'
import styles from './ExportImport.module.css'

interface Props {
  onImport: () => void
}

export function ExportImport({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    const data = await storage.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `remote-tracker-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        await storage.importAll(data)
        onImport()
      } catch {
        alert('Не удалось прочитать файл.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.btn} onClick={handleExport}>↓ экспорт</button>
      <button className={styles.btn} onClick={() => inputRef.current?.click()}>↑ импорт</button>
      <input ref={inputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
    </div>
  )
}
