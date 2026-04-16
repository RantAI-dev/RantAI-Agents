import { forwardRef } from "react"
import { Pressable, Text, type PressableProps } from "react-native"
import { cn } from "@/lib/cn"

type Variant = "default" | "outline" | "ghost" | "destructive"
type Size = "sm" | "md" | "lg"

interface ButtonProps extends PressableProps {
  variant?: Variant
  size?: Size
  children: React.ReactNode
}

const variantClass: Record<Variant, string> = {
  default: "bg-primary",
  outline: "bg-transparent border border-border",
  ghost: "bg-transparent",
  destructive: "bg-danger",
}

const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3",
  md: "h-11 px-4",
  lg: "h-12 px-6",
}

export const Button = forwardRef<any, ButtonProps>(function Button(
  { variant = "default", size = "md", className, children, ...rest },
  ref,
) {
  const isFilled = variant === "default" || variant === "destructive"
  return (
    <Pressable
      ref={ref}
      className={cn(
        "items-center justify-center rounded-lg active:opacity-80",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      <Text className={cn("font-medium", isFilled ? "text-white" : "text-foreground")}>
        {children}
      </Text>
    </Pressable>
  )
})
