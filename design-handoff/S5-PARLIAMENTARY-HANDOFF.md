# Design Handoff — S5 Parliamentary (Fabrica)

## What you're designing

The **single default module that populates the S5 room** in Fabrica when a user enters it for the first time. S5 is the identity/governance subsystem in a Viable System Model. This module is special-cased for S5 — it does not need to follow Fabrica's generic processor patterns as strictly as modules in other rooms. It is a monolith that internally handles motion filtering, the parliamentary meeting, applying approved policy diffs, and re-indexing the affected documents.

Two design surfaces:
1. **The rack panel** — the module's outward-facing face in the S5 room's Rack tab. Constrained by Fabrica's panel grid.
2. **The meeting interior** — the multi-user room that opens when a user enters the panel. Freed from the rack grid; designed on its own canvas.

## Project context

Fabrica visualizes an organization as a Viable System Model — a recursive tree of management units, navigable in 3D isometric. Drilling into any management unit reveals its five subsystems (S1–S5) as rooms. Each room has a **Switchboard** tab (a tabular list of installed processors) and a **Rack** tab (a Eurorack-style fixed-height surface where the same processors appear as patchable panels with jacks and cables). The cable topology connecting rooms is fixed by VSM rules; what populates each room is open.

---

## Visual references (existing styleguide)

The screenshots in this folder show the current Fabrica design system as it actually renders. Use them as the source of truth for type, color, fixture shapes, and rack chrome.

### `styleguide-top.png` — Typography
The full type scale: Hero / Title / H1–H3 / Body / Body Strong / Caption / Mono variants / Keycap / Label. Inter for UI; JetBrains Mono for technical/numeric. Every text token has its WCAG contrast ratio annotated.

### `colors-components.png` — System colors + UI components
- **System colors** in fill+stroke pairs: S5 purple, S4 blue, S3 cyan, S2 red, S1 green. These are the only colors that carry semantic meaning. Color is *always* paired with shape, position, or label — never meaning alone.
- **Checkbox**: square (NOT round). Hidden native input + visual square. State carried by fill + opacity. Compact-row mode (`M/E/N/A`) and a colored-fill variant per system.
- **Context menu**: grid card, left accent border, mono font, no rounded corners. Destructive items in red, separated.
- **Buttons**: five variants (underline / left-bar tab / bracketed / pill outline / arrow prefix). Hover treatment is structural (a border or rule appears), never a color shift.

### `cables.png` — Patch cable demo
Two demo panels and a wall terminal showing how cables work in the Rack tab. Cables are the *idea* of a cable — single solid stroke, one palette color, verlet-spring physics for sag and sway. Jacks are 2×2 cell sockets. A wall terminal is the boundary between this room and another room across a system cable; the cable color encodes the destination (red = S2-bound, green = S1-bound, etc.). Cables can carry signal-flow direction visually via the pulse animation that travels along them when signals fire.

### `rack-hires.png` — Processor panels in the rack
The seven core processors rendered from their declarative panel manifests: HEARTBEAT, TRACER, LOGGER, WEBSOCKET TRANSDUCER, DIGEST, TEST GENERATOR, TEST EXPLAINER. This is the visual reference for what *any* panel in Fabrica looks like. Note:
- Every panel is 360px tall, integer-HP wide.
- Title strip top: panel name + system-color dot left + accent-color dot right.
- Broadcast strip below: a broadcast toggle for processors with outputs.
- Body: fixture grid (knobs, jacks, LEDs, displays, buttons, labels).
- Foot strip: "FABRICA CORE" (or plugin author/version).
- Display readouts are amber-on-black, mono digits (just visible as the `42`, `23`, `3` LCDs in the Logger / WebSocket / Digest panels).
- LEDs are filled circles, on/off bound to runtime state.
- Jacks are open circles with a colored ring matching their cable color.

**The visual coherence of the rack comes from the grid and fixture vocabulary, not from semantic similarity between panels.** Different processors look different in their layout but unmistakably belong to the same surface — like an actual Eurorack.

---

## Visual language summary

**Swiss modernism. No decoration. No rounded corners on menus. No emoji.**

**Typography.** Inter for UI, JetBrains Mono for technical/numeric, Lexend optional for dyslexia mode. Type tokens defined in `styles.js`; designer should match scale exactly.

**Palette (these are the only colors):**
- Text on white: `#1a1a1a` primary, `#666` secondary, `#767676` muted (all clear WCAG AA)
- Borders: `#8a8a8a` for required boundaries
- Surface: `#fff` / `#fafafa` recessed / `#f5f5f5` panel header bands
- System colors (fill/stroke pairs): S5 purple `#B933AD/#6B2C91`, S4 blue `#0039A6/#001E5C`, S3 cyan `#0891b2/#155e75`, S2 red `#EE352E/#8A1A14`, S1 green `#00933C/#00521F`
- Cable accents: audit yellow `#FCCC0A` with `#422006` ring, algedonic red `#e03030/#a01010`
- Display readouts (instrument-LCD chrome): bg `#1a1a1a`, text amber `#ffb000` — 9.7:1 AAA
- Focus ring: `#2563eb`

**Accessibility is a hard constraint.** WCAG 2.1 AA is the floor; AAA is the goal for text and readouts. Color never carries meaning alone — always paired with shape, label, or position. Three a11y modes must be respected:
- *Epilepsy mode*: no dimming, instant transitions
- *Font-visibility slider*: scales text size and font weight up
- *Dyslexia mode*: Lexend font swap

**Icons.** lucide-react, 16px, 1.5 stroke weight. Don't introduce other icon sets.

---

## Panel grid (non-negotiable for the rack-panel surface)

- **Panel height: 360px**, fixed for all panels in a rack.
- **Title strip: top 28px** — Fabrica draws this. Centered plugin name, system-color dot left, accent-color dot right. Double-click opens the meeting interior.
- **Broadcast strip: 24px** below title — Fabrica draws this. Toggle for broadcasting outputs to all room terminals.
- **Body: 312px tall** = **13 rows × 24px**. You design this region.
- **Foot strip: bottom 16px** — Fabrica draws this. Author/version.
- **Width: 1 HP = 24px**. Integer HP only. Min 4 HP, max 24 HP.
- **Cells: 24×24px square.** Fixture positions are integer cell coordinates within the body grid.

**Fixture vocabulary** (compose from these; do not invent new types unless absolutely necessary, and flag if you do):

| Fixture | Cell footprint | What it does |
|---|---|---|
| `knob` | 2×2 typical (sm/md/lg) | Circular config control, drag-to-rotate |
| `jack` | 2×2 | Patchable socket (input or output) |
| `toggle` | 2×1 or 3×1 | Segmented two-state switch |
| `slider` | 1×N or N×1 | Horizontal or vertical bar with handle |
| `button` | 2×1 or 3×1 | Momentary action |
| `led` | 1×1 | Indicator, bound to runtime boolean |
| `display` | 3–8 wide × 1 tall | Amber-on-black LCD readout, 18px mono digits |
| `label` | flexible | Static caption (xs/sm/md sizes) |
| `divider` | 1×N or N×1 | Thin rule |
| `dropdown` | 3×1 typical | Selector |
| `textInput` | 4–8 wide × 1 tall | Single-line string entry |

If you need a multi-line list, scrollable transcript, or richer composite widget on the *panel* surface (not the drill-in), call out an "escape hatch" — a custom React component. Allowed for special-cases like this one; should be justified.

---

## What this module *does* (the four responsibilities, internal)

**1. Receives and filters motions.** Incoming signals to the S5 room are tag-filtered: only signals carrying `tags: ['motion']` enter the docket. A **motion** is a signal that proposes a change to a document the organization owns (charter, policy, rule). It carries: title, body, mover, priority, target document ID, and the *diff* of what it wants to change.

**2. Runs the parliamentary meeting.** A multi-user chat (and video where possible) bound by **Rusty's Rules of Order** (a simplified Robert's Rules). The state machine:

```
anyMotions → anySeconds → discussion → voting → passed | failed
                                    ↘ amendmentPending → amendmentDiscussion → amendmentVoting → discussion
                                    ↘ tabled | withdrawn | motionDies
```

Supporting entities the module owns internally:
- **Docket** — prioritized queue of pending motions
- **Board** — members with vote rights
- **Meeting** — active session containing motions in flight
- **Motion** — state + text + proposer + seconder + votes + transcript

The full session is transcribed signal-by-signal: every utterance, motion, second, amendment, and vote becomes a signal on a transcript channel, and is finalized as an artifact when the meeting adjourns. Participants can be humans, AI agents, or both.

**3. Applies passed motions.** When a motion passes, the module applies the diff to the target document and emits a `document-updated` signal.

**4. Re-indexes the changed document** so future motions and retrievals can find it.

**Outcomes:**
- *Passed* → diff applied, document re-indexed, approval signal emitted
- *Tabled* → motion routed to another S5 in the recursion (parent or sibling), history preserved
- *Rejected* → rejection signal, history retained for related future motions

---

## Cable topology (informs the panel's jacks)

The S5 room has external cable terminals at the walls; the panel's jacks connect through them. Per Fabrica's room rules:
- **Top wall**: purple in/out to/from parent S5 (escalation)
- **Bottom wall**: purple in/out to/from child S5s (delegation)
- **Sides**: orange in/out to/from S4 (intelligence — most motions enter here)
- **Algedonic receiver** — emergency channel from any level

So the panel needs at least:
- Motion input jack (orange or purple, depending on source)
- Approval output jack (purple/orange, depending on what's downstream)
- Transcript output jack (for whoever wants to listen in)
- Algedonic input jack (red — emergency interrupts)

---

## The panel as a dashboard

**Critical concept: the rack panel is not the meeting itself.** It's the control surface and status board *for* the meeting. The meeting lives behind a drill-in (double-click the title strip, just like every other processor in Fabrica today).

What the panel should communicate at a glance:
- Whether a meeting is currently in session
- The current state in the Rusty's Rules state machine
- Current motion (title, mover) if there is one
- Docket depth (how many pending motions)
- Quorum status
- Transcript activity (an LED that blinks on each utterance)
- Last passed/rejected/tabled outcome
- Algedonic alert status (if the emergency channel is hot)
- Indexing health (is the librarian function up, errored, lagged?)
- A clear, dominant "Enter Meeting" affordance

Estimated panel width: **12–16 HP** (288–384 px). Big enough to read state at a glance, small enough to share the rack with other modules.

---

## The meeting interior (drill-in)

This is the second design surface, and it's freed from the panel grid. It's a full-screen multi-user room with its own layout. Required affordances:

- **Docket panel** (left or top): list of pending motions, with priority order, mover, and a one-line summary. Click to bring a motion to the floor.
- **Floor / discussion area** (center): the current motion's full text, the proposed diff (visualized as additions/removals), and the running transcript of who said what.
- **Participants strip** (somewhere visible): avatars/names of attendees, who's chair, who's voting, who's spectating, who's an AI agent vs. human.
- **Rusty's Rules buttons** (action bar): Motion / Second / Amend / Table / Call the Question / Vote / Adjourn. Disabled-state behavior must reflect the state machine (you can't second your own motion, can't call the question before discussion, etc.).
- **Voting view**: when in `voting` state, the buttons collapse to Yes / No / Abstain. Live tally visible to chair; hidden from voters until close (or fully visible — design choice).
- **Transcript view**: chronological signal-by-signal log, with utterance, motion events, and state transitions all visible. Searchable.
- **Outcome state**: when a meeting finishes, show the final tally, the diff that was applied (or rejected), and a link to the resulting document update.

The meeting can host video — but design with audio-only and text-only as first-class fallbacks. Accessibility floor is "fully usable with screen reader and keyboard only."

---

## Open questions you can take a position on

1. **What replaces "Identity" as the S5 verb / module name?** The current term is flagged as not yet right. The panel's title strip displays this name. Candidates worth considering: "Governance," "Parliament," "Council," "Charter," "Policy." Brief rationale appreciated.
2. **Position assignment** (chair, voters): set inside the panel (config + state), or surfaced as a separate small affordance? For v1, internal to the module is fine — but how does it look?
3. **Algedonic interrupt**: how does the panel indicate "emergency signal incoming, the in-flight meeting should pause"? Visual treatment in both rest and active states.
4. **Empty state**: a fresh S5 room with no motions in the docket and no meeting in session — what does the panel show that makes "this is where governance happens" legible?
5. **Quorum failure**: meeting can't proceed without enough voters present. How does the panel and the meeting interior communicate this?
6. **AI participants**: are they visually distinct from human participants in the meeting? In the transcript?

---

## Deliverables requested

1. **Rack panel** — the parliamentary module's panel surface. Variants:
   - Empty/idle (no docket, no meeting)
   - Docket-has-items, no meeting yet
   - Motion-on-floor (in discussion)
   - Voting
   - Algedonic alert (emergency interrupt visible)
   - Just-passed outcome
2. **Meeting interior** — full-screen drill-in. Variants:
   - Docket view (no motion currently on floor)
   - Motion-in-discussion (with diff visible)
   - Amendment open
   - Voting (live tally state)
   - Transcript scroll view
   - Post-adjournment outcome (final tally + applied diff)
3. **S5 room first-open state** — the Rack tab as a new user sees it, with the parliamentary module pre-placed and pre-wired to the appropriate cable terminals.
4. **Naming proposal** for the S5 verb to replace "Identity," with brief rationale.

Format: Figma file or annotated PNGs are both fine. For the panel, mark which fixtures from the catalog you used (and flag any custom components). For the meeting interior, indicate which states are designed and which inherit from earlier ones.
