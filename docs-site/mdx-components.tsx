import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import { Screenshot } from './components/screenshot'

const docsComponents = getDocsMDXComponents()

export function useMDXComponents(components?: Record<string, React.ComponentType>) {
  return {
    ...docsComponents,
    Screenshot,
    ...components,
  }
}
