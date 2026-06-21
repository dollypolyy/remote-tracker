import { useState, useRef, useCallback } from 'react'

interface UseVoiceOptions {
  onResult: (text: string) => void
}

export function useVoice({ onResult }: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(
    () => !!(window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
  )
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const interimRef = useRef('')

  const start = useCallback(() => {
    if (!isSupported || isListening) return

    const SpeechRecognitionCtor =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition

    const rec = new SpeechRecognitionCtor()
    rec.lang = 'ru-RU'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          final += t
        } else {
          interim = t
        }
      }
      interimRef.current = interim
      if (final) {
        onResult(final)
      }
    }

    rec.onend = () => {
      setIsListening(false)
    }

    rec.onerror = () => {
      setIsListening(false)
    }

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
