import { ui } from '../styles'
import { useA11yType } from '../hooks/useA11yType'

export function Keycap({ children, color: colorOverride }) {
  const t = useA11yType()
  const style = colorOverride
    ? { ...ui.keycap, ...t.keycap, color: colorOverride, borderColor: colorOverride }
    : { ...ui.keycap, ...t.keycap }
  return (
    <kbd style={style}>{children}</kbd>
  )
}
