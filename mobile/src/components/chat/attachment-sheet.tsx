import { View, Text, Pressable, Modal } from "react-native"
import { Camera, Image as ImageIcon, FileText } from "lucide-react-native"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"

export interface AttachmentSheetProps {
  visible: boolean
  onClose: () => void
  onPick: (uri: string, name: string, mimeType: string) => void
}

export function AttachmentSheet({ visible, onClose, onPick }: AttachmentSheetProps) {
  async function pickCamera() {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.fileName ?? "photo.jpg", a.mimeType ?? "image/jpeg")
    }
    onClose()
  }
  async function pickLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.fileName ?? "image.jpg", a.mimeType ?? "image/jpeg")
    }
    onClose()
  }
  async function pickDoc() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    })
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]
      onPick(a.uri, a.name, a.mimeType ?? "application/octet-stream")
    }
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        <View className="mt-auto bg-background rounded-t-2xl p-6 gap-4">
          <SheetButton icon={Camera} label="Take photo" onPress={pickCamera} />
          <SheetButton icon={ImageIcon} label="Choose from library" onPress={pickLibrary} />
          <SheetButton icon={FileText} label="Attach document" onPress={pickDoc} />
        </View>
      </Pressable>
    </Modal>
  )
}

function SheetButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: any
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 py-3 active:opacity-60"
    >
      <Icon size={24} color="currentColor" />
      <Text className="text-foreground text-base">{label}</Text>
    </Pressable>
  )
}
