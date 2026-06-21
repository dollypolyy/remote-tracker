import { useState, useRef, useCallback } from 'react'

interface UseVoiceOptions {
  onResult: (text: string) => void
}

export function useVoice({ onResult }: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() => {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  })
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const start = useCallback(() => {
    if (!isSupported || isListening) return

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = 'ru-RU'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript
        }
      }
      if (final) onResult(final)
    }

    rec.onend = () => setIsListening(false)
    rec.onerror = () => setIsListening(false)

    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }, [isSupported, isListening, onResult])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, toggle, stop }
}
