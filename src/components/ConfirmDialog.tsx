import styles from './ConfirmDialog.module.css'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.box}>
        <p className={styles.msg}>{message}</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onCancel}>отмена</button>
          <button className={styles.confirm} onClick={onConfirm}>удалить</button>
        </div>
      </div>
    </div>
  )
}
