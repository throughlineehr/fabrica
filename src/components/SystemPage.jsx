import { useEffect } from 'react'
import { RoomShell } from './room/RoomShell'
import { TerminalDetail } from './room/TerminalDetail'
import { Switchboard } from './room/Switchboard'

export function SystemPage({
  nodeId, nodeName, node, tree, systemKey,
  processors,
  onAddProcessor, onRemoveProcessor, onUpdateProcessor, onOpenProcessor,
  onBack, onNavigate,
}) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onBack()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onBack])

  return (
    <RoomShell systemKey={systemKey} nodeId={nodeId} nodeName={nodeName} node={node} tree={tree} onBack={onBack} onNavigate={onNavigate}>
      {({ activeTerminal, terminals, connections, onNavigate: nav, sysColor }) => {
        const selected = activeTerminal
          ? terminals.find(t => t.id === activeTerminal)
          : null

        if (selected) {
          return <TerminalDetail terminal={selected} connections={connections[selected.id]} onNavigate={nav} />
        }

        return (
          <Switchboard
            systemKey={systemKey}
            sysColor={sysColor}
            terminals={terminals}
            processors={processors}
            onAddProcessor={onAddProcessor}
            onRemoveProcessor={onRemoveProcessor}
            onUpdateProcessor={onUpdateProcessor}
            onOpenProcessor={onOpenProcessor}
          />
        )
      }}
    </RoomShell>
  )
}
