import { useVoice } from '../hooks/useVoice'
import styles from './VoiceButton.module.css'

interface Props {
  onAppend: (text: string) => void
  large?: boolean
}

export function VoiceButton({ onAppend, large }: Props) {
  const { isListening, isSupported, toggle } = useVoice({
    onResult: (t) => onAppend(t + ' '),
  })

  if (!isSupported) {
    return (
      <span className={styles.unsupported} title="Голосовой ввод недоступен">
        🎙️
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${styles.btn} ${large ? styles.large : ''} ${isListening ? styles.active : ''}`}
      aria-label={isListening ? 'Остановить запись' : 'Начать голосовой ввод'}
      title={isListening ? 'Остановить' : 'Говорить'}
    >
      🎙️
    </button>
  )
}
