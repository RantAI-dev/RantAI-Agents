import { useState, useEffect } from "react"
import { Pressable } from "react-native"
import { Mic, MicOff } from "lucide-react-native"
import * as SpeechRecognition from "expo-speech-recognition"

export interface VoiceButtonProps {
  onTranscript: (text: string) => void
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    const subResult = SpeechRecognition.ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: any) => {
        if (event?.results?.[0]?.transcript) {
          onTranscript(event.results[0].transcript)
        }
      },
    )
    const subEnd = SpeechRecognition.ExpoSpeechRecognitionModule.addListener(
      "end",
      () => {
        setRecording(false)
      },
    )
    return () => {
      subResult.remove()
      subEnd.remove()
    }
  }, [onTranscript])

  async function toggle() {
    if (recording) {
      await SpeechRecognition.ExpoSpeechRecognitionModule.stop()
      setRecording(false)
      return
    }
    const perm =
      await SpeechRecognition.ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!perm.granted) return
    await SpeechRecognition.ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    })
    setRecording(true)
  }

  return (
    <Pressable onPress={toggle} className="p-2 active:opacity-60">
      {recording ? (
        <MicOff size={22} color="#ef4444" />
      ) : (
        <Mic size={22} color="currentColor" />
      )}
    </Pressable>
  )
}
