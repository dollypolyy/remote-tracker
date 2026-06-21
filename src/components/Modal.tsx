import { useEffect, useRef } from 'react'
import styles from './Modal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => prev?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
