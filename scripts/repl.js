#!/usr/bin/env node
/* global process */
// scripts/repl.js — A terminal REPL over Fabrica's domain model.
//
//   npm run repl
//
// Proof that the model is completely decoupled from the React UI:
// this file imports straight out of src/ and drives the same
// createAgentAPI surface the web app uses — no bus shim, no mock
// layer, nothing special. The domain (tree, signals, agent) runs
// unchanged in Node.
//
// Commands (type `help` inside the REPL for the latest list):
//   tree | list | yaml | validate
//   add mgmt|op <parentId>
//   rename|rm|splice|detach <id>
//   move <id> <newParentId>
//   dup <id> [<parentId>]
//   proc library | proc list <node> <sys>
//   proc add <defId> <node> <sys>
//   proc rm <node> <sys> <instanceId>
//   proc filter <node> <sys> <instanceId> types=a,b tags=x,y inputTerminals=t
//   tail <node> <sys>    — subscribe to a room channel
//   untail               — cancel all tails
//   state | help | exit

import readline from 'node:readline'
import { createModel } from '../src/tree/model.js'
import { buildRenderTree } from '../src/tree/index.js'
import { createBus, roomChannel, eventsChannel } from '../src/signals/bus.js'
import { computeRoomSubscriptions } from '../src/signals/topology.js'
import { wireTopology } from '../src/signals/wiring.js'
import { createAgentAPI } from '../src/agent/commands.js'
import { PROCESSOR_LIBRARY, getProcessorDef } from '../src/signals/library.js'

// ─── State ────────────────────────────────────────────────────────────────
let model = createModel('management')
let processors = {}
const navState = {}

// ─── Bus + topology (rewires on every tree change) ───────────────────────
const bus = createBus()
let unwire = null
function rewireTopology() {
  unwire?.()
  unwire = wireTopology(bus, computeRoomSubscriptions(buildRenderTree(model)))
}
rewireTopology()

// ─── Processor runtime (mirror of App.jsx's useEffect) ────────────────────
let running = []
function syncProcessorRuntime() {
  running.forEach(h => h.stop())
  running = []
  for (const [key, list] of Object.entries(processors)) {
    const [nodeId, systemKey] = key.split(':')
    for (const inst of list) {
      const def = getProcessorDef(inst.defId)
      if (!def) continue
      const handle = def.create(
        { ...(def.defaultConfig || {}), ...(inst.config || {}) },
        { bus, instanceId: inst.id, roomNodeId: nodeId, roomSystemKey: systemKey, filters: inst.filters },
      )
      handle.start()
      running.push(handle)
    }
  }
}

// ─── Agent API ────────────────────────────────────────────────────────────
const api = createAgentAPI({
  getModel: () => model,
  setModel: (next) => {
    model = typeof next === 'function' ? next(model) : next
    rewireTopology()
  },
  getProcessors: () => processors,
  setProcessors: (next) => {
    processors = typeof next === 'function' ? next(processors) : next
    syncProcessorRuntime()
  },
  getNavState: () => navState,
  navigate: {
    overview: () => {}, focus: () => {}, detail: () => {},
    openSystem: () => {}, openProcessor: () => {}, back: () => {},
  },
  panels: { open: () => {}, close: () => {} },
  filters: { set: () => {} },
  announce: (msg) => print(dim(`▸ ${msg}`)),
})

// ─── Tree rendering ──────────────────────────────────────────────────────
const GLYPH = { management: '◆', operation: '○' }
function renderTree() {
  const tree = buildRenderTree(model)
  const lines = []
  function walk(node, prefix, isLast, isRoot) {
    const connector = isRoot ? '' : (isLast ? '└── ' : '├── ')
    const g = GLYPH[node.type] || '?'
    const name = node.name || italic('(unnamed)')
    lines.push(`${prefix}${connector}${g} ${name} ${dim(`[${shortId(node.id)}]`)}`)
    const childPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '))
    ;(node.children || []).forEach((child, i, arr) => {
      walk(child, childPrefix, i === arr.length - 1, false)
    })
  }
  walk(tree, '', true, true)
  return lines.join('\n')
}

// ─── Id helpers (support short ids) ──────────────────────────────────────
function shortId(id) { return id.slice(0, 8) }
function resolveId(maybeShort) {
  if (!maybeShort) return null
  const all = Object.keys(model.entities)
  if (all.includes(maybeShort)) return maybeShort
  const matches = all.filter(id => id.startsWith(maybeShort))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) { print(red(`Ambiguous id prefix "${maybeShort}" matches ${matches.length}`)); return null }
  print(red(`No node id matching "${maybeShort}"`))
  return null
}

// ─── ANSI helpers ────────────────────────────────────────────────────────
const dim    = (s) => `\x1b[2m${s}\x1b[0m`
const italic = (s) => `\x1b[3m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const green  = (s) => `\x1b[32m${s}\x1b[0m`
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`

// ─── I/O ─────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: cyan('fabrica> ') })
function print(msg) {
  // Clear current prompt line, print, redraw prompt.
  process.stdout.write(`\r\x1b[K${msg}\n`)
  rl.prompt(true)
}

// ─── Commands ────────────────────────────────────────────────────────────
const tails = []  // [{ channel, unsub }]

function parseKV(args) {
  // e.g. "types=metric,alert tags=urgent" → { types: ['metric','alert'], tags: ['urgent'] }
  const out = {}
  for (const a of args) {
    const [k, v] = a.split('=')
    if (!k || v === undefined) continue
    out[k] = v === '' || v === 'null' ? null : v.split(',').map(s => s.trim()).filter(Boolean)
  }
  return out
}

function handleCommand(line) {
  const parts = line.trim().split(/\s+/)
  const cmd = parts[0]
  const args = parts.slice(1)
  if (!cmd) return

  switch (cmd) {
    case 'help':
      print(HELP_TEXT); return

    case 'tree':
      print(renderTree()); return

    case 'list': {
      const { nodes, rootId } = api.listNodes()
      const lines = nodes.map(n => {
        const root = n.fullId === model.rootId ? cyan(' (root)') : ''
        return `${n.id}  ${n.type.padEnd(10)} ${n.name || italic('(unnamed)')}${root}`
      })
      print(lines.join('\n') + `\n${dim(`rootId = ${rootId}`)}`)
      return
    }

    case 'yaml':
      print(api.read().yaml); return

    case 'validate': {
      const r = api.validate()
      print(r.valid ? green('valid') : red(`${r.issues.length} issue(s): ${JSON.stringify(r.issues)}`))
      return
    }

    case 'state':
      print(JSON.stringify(api.getState(), null, 2)); return

    case 'add': {
      const [type, parentShort] = args
      const parentId = parentShort ? resolveId(parentShort) : model.rootId
      if (!parentId) return
      const r = type === 'mgmt' || type === 'management'
        ? api.addManagement(parentId)
        : type === 'op' || type === 'operation'
          ? api.addOperation(parentId)
          : { ok: false, error: 'Usage: add mgmt|op [parentId]' }
      print(r.ok ? green(`added ${shortId(r.nodeId)}`) : red(r.error))
      return
    }

    case 'rename': {
      const id = resolveId(args[0])
      if (!id) return
      const name = args.slice(1).join(' ')
      const r = api.renameNode(id, name)
      print(r.ok ? green('renamed') : red(r.error))
      return
    }

    case 'rm':
    case 'remove': {
      const id = resolveId(args[0]); if (!id) return
      const r = api.removeNode(id); print(r.ok ? green('removed') : red(r.error)); return
    }

    case 'move': {
      const id = resolveId(args[0]); const parentId = resolveId(args[1])
      if (!id || !parentId) return
      const r = api.moveNode(id, parentId); print(r.ok ? green('moved') : red(r.error)); return
    }

    case 'splice': {
      const id = resolveId(args[0]); if (!id) return
      const r = api.spliceNode(id); print(r.ok ? green('spliced') : red(r.error)); return
    }

    case 'detach': {
      const id = resolveId(args[0]); if (!id) return
      const r = api.detachNode(id); print(r.ok ? green('detached') : red(r.error)); return
    }

    case 'dup': {
      const id = resolveId(args[0]); if (!id) return
      const parentId = args[1] ? resolveId(args[1]) : model.parents[id]
      if (!parentId) return print(red('no parent — provide target parent id'))
      const r = api.duplicateSubtree(id, parentId); print(r.ok ? green('duplicated') : red(r.error)); return
    }

    case 'proc': {
      const [sub, ...rest] = args
      if (sub === 'library' || sub === 'lib') {
        print(PROCESSOR_LIBRARY.map(d =>
          `  ${cyan(d.id.padEnd(12))} ${dim(`in=${d.hasInputs} out=${d.hasOutputs}`)}  ${d.description}`,
        ).join('\n'))
      } else if (sub === 'list') {
        const [ns, sys] = rest; const nodeId = resolveId(ns)
        if (!nodeId || !sys) return print(red('Usage: proc list <node> <sys>'))
        const { processors: list } = api.listProcessors(nodeId, sys)
        print(list.length === 0 ? dim('(empty)') : list.map(p =>
          `  ${p.id}  ${cyan(p.defId.padEnd(10))}  filters=${JSON.stringify(p.filters)}  config=${JSON.stringify(p.config)}`,
        ).join('\n'))
      } else if (sub === 'add') {
        const [defId, ns, sys] = rest; const nodeId = resolveId(ns)
        if (!nodeId || !sys || !defId) return print(red('Usage: proc add <defId> <node> <sys>'))
        const r = api.addProcessor(nodeId, sys, defId)
        print(r.ok ? green(`added ${shortId(r.instanceId)}`) : red(r.error))
      } else if (sub === 'rm') {
        const [ns, sys, instId] = rest; const nodeId = resolveId(ns)
        if (!nodeId || !sys || !instId) return print(red('Usage: proc rm <node> <sys> <instanceId>'))
        const all = (processors[`${nodeId}:${sys}`] || []).map(p => p.id)
        const full = all.find(id => id === instId || id.startsWith(instId))
        if (!full) return print(red('Unknown instance id'))
        const r = api.removeProcessor(nodeId, sys, full); print(r.ok ? green('removed') : red(r.error))
      } else if (sub === 'filter') {
        const [ns, sys, instId, ...kvs] = rest; const nodeId = resolveId(ns)
        if (!nodeId || !sys || !instId) return print(red('Usage: proc filter <node> <sys> <instanceId> k=v k=v ...'))
        const all = (processors[`${nodeId}:${sys}`] || []).map(p => p.id)
        const full = all.find(id => id === instId || id.startsWith(instId))
        if (!full) return print(red('Unknown instance id'))
        const patch = parseKV(kvs)
        const r = api.updateProcessorFilters(nodeId, sys, full, patch)
        print(r.ok ? green('filters updated') : red(r.error))
      } else {
        print(red('Usage: proc library | list <node> <sys> | add <def> <node> <sys> | rm <node> <sys> <instId> | filter ...'))
      }
      return
    }

    case 'tail': {
      const [ns, sys] = args; const nodeId = resolveId(ns)
      if (!nodeId || !sys) return print(red('Usage: tail <node> <sys>'))
      const ch = roomChannel(nodeId, sys)
      const unsub = bus.subscribe(ch, (sig) => {
        const hops = sig.hops?.map(h => h.split(':').map((p, i) => i === 0 ? p.slice(0, 5) : p).join(':')).join(' → ')
        print(dim(`[${new Date(sig.timestamp).toISOString().slice(11, 19)}]`) +
              ` ${cyan(sig.type)} ${JSON.stringify(sig.content)} ${dim(`hops: ${hops}`)}`)
      })
      tails.push({ channel: ch, unsub })
      print(green(`tailing ${ch}`))
      return
    }

    case 'tail-events': {
      const [instId] = args
      const full = Object.values(processors).flat().find(p => p.id === instId || p.id.startsWith(instId))
      if (!full) return print(red('Unknown instance id'))
      const ch = eventsChannel(full.id)
      const unsub = bus.subscribe(ch, (sig) => {
        print(dim(`[ev ${shortId(full.id)}]`) + ` ${cyan(sig.type)} ${JSON.stringify(sig.content)}`)
      })
      tails.push({ channel: ch, unsub })
      print(green(`tailing ${ch}`))
      return
    }

    case 'untail':
      tails.splice(0).forEach(t => t.unsub())
      print(green('all tails cancelled')); return

    case 'exit':
    case 'quit':
      running.forEach(h => h.stop()); unwire?.(); rl.close(); return

    default:
      print(red(`Unknown command: ${cmd}. Type ${cyan('help')} for a list.`))
  }
}

const HELP_TEXT = `
${cyan('Fabrica REPL')} — terminal view over the same domain model the web app uses.

${dim('Tree:')}
  tree                         render the tree
  list                         list all nodes (short ids + type + name)
  yaml                         export model as YAML
  validate                     check model for publish readiness
  state                        show agent's nav state

  add mgmt [parentId]          add management child (default: root)
  add op <parentId>            add operation child
  rename <id> <name...>        set node name
  rm <id>                      cascade delete
  move <id> <parentId>         reparent
  splice <id>                  remove + promote children
  detach <id>                  disconnect (orphan)
  dup <id> [parentId]          duplicate subtree

${dim('Processors:')}
  proc library                 list processor defs (heartbeat, tracer, logger)
  proc list <id> <sys>         processors in a room, e.g. proc list a3f2c s3
  proc add <def> <id> <sys>    e.g. proc add heartbeat a3f2c s3
  proc rm <id> <sys> <iid>     remove processor
  proc filter <id> <sys> <iid> key=val key=val ...
        keys: types, tags, inputTerminals, outputTerminals
        values: comma-separated, or 'null' to clear
        e.g. proc filter a3f2c s3 hb-1 types=metric,alert

${dim('Signals:')}
  tail <id> <sys>              subscribe & print signals on a room channel
  tail-events <iid>            subscribe to a processor's own events channel
  untail                       cancel all subscriptions

${dim('Other:')}
  help                         this text
  exit | quit                  leave REPL

Short ids (first ≥4 chars) work anywhere a node / instance id is expected.
`

// ─── Boot ────────────────────────────────────────────────────────────────
print(cyan('Fabrica REPL. Type "help" for commands.'))
rl.prompt()
rl.on('line', (line) => {
  try { handleCommand(line) } catch (e) { print(red(`ERR: ${e.message}\n${e.stack}`)) }
})
rl.on('close', () => {
  running.forEach(h => h.stop())
  unwire?.()
  process.exit(0)
})
