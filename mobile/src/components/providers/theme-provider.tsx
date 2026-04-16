import { useColorScheme, View } from "react-native"
import { vars } from "nativewind"
import { tokens } from "@/styles/tokens"

const lightVars = vars({
  "--color-background": tokens.colors.background.light,
  "--color-foreground": tokens.colors.foreground.light,
  "--color-primary": tokens.colors.primary.light,
  "--color-muted": tokens.colors.muted.light,
  "--color-border": tokens.colors.border.light,
  "--color-danger": tokens.colors.danger.light,
})

const darkVars = vars({
  "--color-background": tokens.colors.background.dark,
  "--color-foreground": tokens.colors.foreground.dark,
  "--color-primary": tokens.colors.primary.dark,
  "--color-muted": tokens.colors.muted.dark,
  "--color-border": tokens.colors.border.dark,
  "--color-danger": tokens.colors.danger.dark,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme() ?? "light"
  return (
    <View style={scheme === "dark" ? darkVars : lightVars} className="flex-1">
      {children}
    </View>
  )
}
