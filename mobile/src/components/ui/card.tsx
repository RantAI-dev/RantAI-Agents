import { View, type ViewProps } from "react-native"
import { cn } from "@/lib/cn"

export function Card({ className, ...rest }: ViewProps) {
  return (
    <View
      className={cn("rounded-xl border border-border bg-background p-4", className)}
      {...rest}
    />
  )
}
