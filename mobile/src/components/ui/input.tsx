import { forwardRef } from "react"
import { TextInput, type TextInputProps } from "react-native"
import { cn } from "@/lib/cn"

export const Input = forwardRef<any, TextInputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#9ca3af"
      className={cn(
        "h-11 rounded-lg border border-border bg-muted px-3 text-foreground",
        className,
      )}
      {...rest}
    />
  )
})
