import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, Trash2, Plus, X } from 'lucide-react'
import { color, sizes } from '../../styles'
import { useA11yType } from '../../hooks/useA11yType'
import { commands } from '../../connection'
import { Checkbox } from '../Checkbox'

export function InvitePanel({ rooms = [] }) {
  const t = useA11yType()

  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create form state
  const [showForm, setShowForm] = useState(false)
  const [selectedRooms, setSelectedRooms] = useState([])
  const [creating, setCreating] = useState(false)

  // Copy state
  const [copiedToken, setCopiedToken] = useState(null)

  // Load invites on mount
  const loadInvites = useCallback(async () => {
    setLoading(true)
    const result = await commands.listInvites()
    if (result.ok) {
      setInvites(result.invites || [])
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  const handleCreate = async () => {
    setCreating(true)
    const result = await commands.createInvite(selectedRooms)
    if (result.ok) {
      setShowForm(false)
      setSelectedRooms([])
      loadInvites()
    } else {
      setError(result.error)
    }
    setCreating(false)
  }

  const handleRevoke = async (token) => {
    const result = await commands.revokeInvite(token)
    if (result.ok) {
      loadInvites()
    } else {
      setError(result.error)
    }
  }

  const copyInviteLink = async (token) => {
    const url = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    }
  }

  const toggleRoom = (room) => {
    setSelectedRooms(prev =>
      prev.includes(room)
        ? prev.filter(r => r !== room)
        : [...prev, room]
    )
  }

  const pendingInvites = invites.filter(inv => !inv.redeemedAt)
  const usedInvites = invites.filter(inv => inv.redeemedAt)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={t.label}>Invites</span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              ...t.mono,
              fontSize: 11,
              padding: '4px 8px',
              background: 'none',
              border: `1px solid ${color.border}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={12} strokeWidth={1.5} />
            New
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ ...t.mono, fontSize: 11, color: color.s2.stroke, margin: 0 }}>
          {error}
        </p>
      )}

      {/* Create form */}
      {showForm && (
        <div style={{
          padding: 12,
          background: color.surface,
          border: `1px solid ${color.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Assign rooms
            </span>
            <button
              onClick={() => { setShowForm(false); setSelectedRooms([]) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              aria-label="Cancel"
            >
              <X size={14} strokeWidth={1.5} color={color.muted} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rooms.length === 0 ? (
              <span style={{ ...t.mono, fontSize: 11, color: color.muted }}>No rooms available</span>
            ) : (
              rooms.map(room => (
                <Checkbox
                  key={room}
                  label={room}
                  checked={selectedRooms.includes(room)}
                  onChange={() => toggleRoom(room)}
                />
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={() => { setShowForm(false); setSelectedRooms([]) }}
              disabled={creating}
              style={{
                ...t.mono,
                fontSize: 11,
                padding: '6px 12px',
                background: 'none',
                border: `1px solid ${color.border}`,
                color: color.muted,
                cursor: creating ? 'wait' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                ...t.mono,
                fontSize: 11,
                padding: '6px 12px',
                background: color.primary,
                border: `1px solid ${color.primary}`,
                color: color.white,
                cursor: creating ? 'wait' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <span style={{ ...t.mono, fontSize: 11, color: color.muted }}>Loading...</span>
      )}

      {/* Pending invites */}
      {!loading && pendingInvites.length > 0 && (
        <div>
          <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending ({pendingInvites.length})
          </span>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pendingInvites.map(inv => (
              <InviteRow
                key={inv.token}
                invite={inv}
                copied={copiedToken === inv.token}
                onCopy={() => copyInviteLink(inv.token)}
                onRevoke={() => handleRevoke(inv.token)}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Used invites */}
      {!loading && usedInvites.length > 0 && (
        <div>
          <span style={{ ...t.mono, fontSize: 9, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Used ({usedInvites.length})
          </span>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {usedInvites.map(inv => (
              <InviteRow
                key={inv.token}
                invite={inv}
                used
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && invites.length === 0 && !showForm && (
        <span style={{ ...t.mono, fontSize: 11, color: color.muted }}>
          No invites yet. Create one to invite users.
        </span>
      )}
    </div>
  )
}

function InviteRow({ invite, copied, onCopy, onRevoke, used, t }) {
  const tokenPreview = invite.token.slice(0, 8) + '...'
  const roomsPreview = invite.rooms?.length > 0
    ? invite.rooms.slice(0, 2).join(', ') + (invite.rooms.length > 2 ? '...' : '')
    : 'No rooms'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 8px',
      background: color.white,
      border: `1px solid ${color.borderLight}`,
      opacity: used ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...t.mono, fontSize: 11, color: color.primary }}>
          {tokenPreview}
        </div>
        <div style={{ ...t.mono, fontSize: 10, color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {roomsPreview}
        </div>
      </div>

      {!used && (
        <>
          <button
            onClick={onCopy}
            title="Copy invite link"
            aria-label={copied ? 'Copied' : 'Copy invite link'}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: copied ? color.s1.fill : color.muted,
            }}
          >
            {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
          </button>
          <button
            onClick={onRevoke}
            title="Revoke invite"
            aria-label="Revoke invite"
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: color.s2.stroke,
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </>
      )}

      {used && (
        <span style={{ ...t.mono, fontSize: 10, color: color.muted }}>
          Used
        </span>
      )}
    </div>
  )
}
