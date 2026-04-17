import { useEffect } from "react"
import { View } from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from "react-native-reanimated"

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3)
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 400 }), -1, true),
    )
  }, [delay, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      className="w-2 h-2 rounded-full bg-foreground/60"
      style={style}
    />
  )
}

export function TypingIndicator() {
  return (
    <View className="flex-row gap-1.5 px-4 py-3">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  )
}
