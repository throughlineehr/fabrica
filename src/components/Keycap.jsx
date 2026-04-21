import { ui } from '../styles'
import { useA11yType } from '../hooks/useA11yType'

export function Keycap({ children }) {
  const t = useA11yType()
  return (
    <kbd style={{ ...ui.keycap, ...t.keycap }}>{children}</kbd>
  )
}
