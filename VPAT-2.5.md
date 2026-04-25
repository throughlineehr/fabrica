# Fabrica — VPAT 2.5 (WCAG 2.1 Level AA)

**Product:** Fabrica Viable System Model Visualization
**Version:** 0.2.1
**Date:** 2026-04-25
**Contact:** thirdcreed@gmail.com
**Notes:** This VPAT covers the web application interface. The 3D canvas view is supplemented by a fully accessible DOM-based Explorer tree. v0.2.0 (2026-04-23) covered the processor/signal subsystem added in v0.2 (Switchboard, ProcessorPage, ProcessorLibraryModal, SignalFeed, CableTerminal, TerminalDetail, Checkbox). v0.2.1 (2026-04-25) reflects two follow-up fixes from `AUDIT-2026-04-25.md`: RoomShell back-button label-in-name alignment (2.5.3) and SignalFeed locale-aware time formatting (3.1.2).

---

## Conformance Level Key

| Term | Definition |
|------|-----------|
| Supports | Fully meets the criterion |
| Partially Supports | Meets in some areas, gaps in others |
| Does Not Support | Does not meet the criterion |
| Not Applicable | Criterion does not apply |

---

## WCAG 2.1 Level A

| Criterion | Conformance | Remarks |
|-----------|-------------|---------|
| **1.1.1 Non-text Content** | Supports | All icons use aria-hidden with text alternatives. System color indicators paired with text labels. 3D canvas has aria-label and describedby. New (v0.2): SignalFeed icons paired with sr-only type labels; TerminalDot aria-label includes wall direction when visual arrow is rendered for color disambiguation; CableTerminal SVG cable and hollow dot marked aria-hidden, button label carries the meaning. |
| **1.2.1 Audio-only / Video-only** | Not Applicable | No audio or video content. |
| **1.2.2 Captions** | Not Applicable | No audio or video content. |
| **1.2.3 Audio Description** | Not Applicable | No audio or video content. |
| **1.3.1 Info and Relationships** | Supports | Semantic HTML: headings (h1-h3), tree (role=tree, treeitem), menu (role=menu, menuitem), switch (role=switch), toolbar (role=toolbar). ARIA expanded/selected/checked states. New (v0.2): Switchboard uses role=grid with aria-rowcount/aria-colcount and aria-rowindex/aria-colindex on cells; empty padding rows marked aria-hidden + role=presentation. TerminalDetail connections use <ul>/<li> with aria-label. RoomShell heading hierarchy corrected to h2/h3 for sub-pages. |
| **1.3.2 Meaningful Sequence** | Supports | DOM order matches visual order. Explorer tree mirrors 3D hierarchy. |
| **1.3.3 Sensory Characteristics** | Supports | Instructions do not rely solely on shape, size, or location. Keyboard shortcuts documented in text. |
| **1.4.1 Use of Color** | Supports | System colors always paired with text labels (S1-S5). Color-blind mode adds patterns. Shapes differ (diamond, circle, triangle). New (v0.2): Terminal-dot state (on/off) conveyed by fill-vs-outline + aria-pressed + (when color-ambiguous) a direction arrow inside the dot. Signal type conveyed by icon + sr-only type label, not color alone. |
| **1.4.2 Audio Control** | Not Applicable | No audio content. |
| **2.1.1 Keyboard** | Supports | All functionality available via keyboard. Explorer tree: arrow keys, Enter, Escape, Home, End. Filter bar: arrow keys, Space. Tab panels: letter shortcuts with keycap indicators. New (v0.2): Switchboard rows are tabIndex=0 with Enter/Space to open the processor, ArrowUp/Down to navigate between rows, Home/End to jump, Delete/Backspace to remove. Processor ops go through the agent API — AI agent parity with human UI. CableTerminal now uses <button> elements instead of anchors-as-buttons. |
| **2.1.2 No Keyboard Trap** | Supports | Escape closes any panel. Tab moves between regions. No traps identified. New (v0.2): ProcessorLibraryModal implements a proper focus trap — Tab and Shift+Tab wrap within the dialog's focusable elements; focus is restored to the opener on close. |
| **2.1.4 Character Key Shortcuts** | Supports | Single-key shortcuts (E, S, T, F) only activate when no text input is focused. Can be closed with Escape. |
| **2.2.1 Timing Adjustable** | Not Applicable | No time limits. |
| **2.2.2 Pause, Stop, Hide** | Supports | Epilepsy mode disables all animation. prefers-reduced-motion respected. Camera lerp cancellable via user input. |
| **2.3.1 Three Flashes** | Supports | Epilepsy mode eliminates all flashing. Default mode: hover dimming is gradual, no flashing. |
| **2.4.1 Bypass Blocks** | Supports | Skip-to-content link provided. Visible on focus. |
| **2.4.2 Page Titled** | Supports | Page title is "Fabrica". |
| **2.4.3 Focus Order** | Supports | Focus order follows visual order. Tree navigation follows DOM order. |
| **2.4.4 Link Purpose** | Supports | All interactive elements have descriptive labels. No ambiguous "click here" text. |
| **2.5.1 Pointer Gestures** | Supports | No multipoint or path-based gestures required. All actions available via single click/tap. |
| **2.5.2 Pointer Cancellation** | Supports | Actions fire on click (up event), not mousedown. |
| **2.5.3 Label in Name** | Supports | Visible labels match accessible names. v0.2.1 fix: RoomShell back button visible text now matches its `aria-label` (was "esc" / "Back"; now "← Back" / "Back"). |
| **2.5.4 Motion Actuation** | Not Applicable | No motion-triggered features. |
| **3.1.1 Language of Page** | Supports | html lang attribute set dynamically on language change. 9 languages supported. |
| **3.2.1 On Focus** | Supports | No context changes on focus. |
| **3.2.2 On Input** | Supports | Filter checkboxes provide immediate visual feedback. No unexpected context changes. |
| **3.3.1 Error Identification** | Partially Supports | Form inputs are minimal (settings toggles, filter checkboxes). No error states currently needed. Stub toggle for screen reader mode labeled as not implemented. |
| **3.3.2 Labels or Instructions** | Supports | All form inputs have programmatic labels. Sliders have aria-valuetext. |
| **4.1.1 Parsing** | Supports | Valid React JSX output. No duplicate IDs (UUIDs used). |
| **4.1.2 Name, Role, Value** | Supports | Toggles: role=switch, aria-checked. Tree: role=tree/treeitem, aria-expanded/selected. Menu: role=menu/menuitem. Slider: aria-valuenow/min/max/text. Language buttons: aria-current. |

---

## WCAG 2.1 Level AA

| Criterion | Conformance | Remarks |
|-----------|-------------|---------|
| **1.3.4 Orientation** | Supports | No orientation restrictions. Works in both portrait and landscape. |
| **1.3.5 Identify Input Purpose** | Not Applicable | No personal data input fields. |
| **1.4.3 Contrast (Minimum)** | Supports | All text colors documented with contrast ratios in styles.js. Minimum: muted text 4.5:1 (#767676 on white). All verified against WCAG checker. v0.2 fixes: SignalFeed hops-arrow color moved from #b5b5b5 (2.1:1) to color.muted (4.5:1). |
| **1.4.4 Resize Text** | Partially Supports | Font visibility slider scales text up to 140%. Browser zoom tested informally. Minimum font size: 12px. Needs formal 200% zoom verification. |
| **1.4.5 Images of Text** | Supports | No images of text. All text is real text. |
| **1.4.10 Reflow** | Partially Supports | Layout uses flexible positioning. Needs formal 400% at 1280px testing. |
| **1.4.11 Non-text Contrast** | Supports | UI boundaries: border color #8a8a8a (3.5:1). Focus ring: #2563eb (5.2:1). System shape strokes all ≥3:1. v0.2 fix: Checkbox unchecked border now stays at full opacity (was being dimmed with opacity: 0.35 giving effective ~1.9:1); opacity applies only to fill when checked and to disabled state. |
| **1.4.12 Text Spacing** | Supports | Line heights ≥1.5 on all body text. No overflow:hidden on text containers. Custom spacing overrides not blocked. |
| **1.4.13 Content on Hover/Focus** | Supports | Hover shows detail panel (dismissible, persistent while hovered). No content covers other content permanently. |
| **2.4.5 Multiple Ways** | Supports | Two parallel navigation paths: 3D canvas (mouse) and Explorer tree (keyboard). Both provide full access to all nodes. |
| **2.4.6 Headings and Labels** | Supports | Descriptive headings (h1-h3) in detail panel, system page, and settings. Labels describe purpose. |
| **2.4.7 Focus Visible** | Supports | Global :focus-visible outline (2px solid #2563eb, 2px offset). Keyboard focus ring on 3D nodes (blue rectangle/circle). Explorer tree: blue left border on selected. |
| **3.1.2 Language of Parts** | Partially Supports | 10 languages supported (en, ar, es, fr, hi, id, it, ja, ru, zh). html lang updates on change. RTL direction supported for Arabic (within text containers). Core nav keys (back/close/navigate) translated across all locales. v0.2.1 fix: SignalFeed time format now passes the active locale to `toLocaleTimeString`. **Outstanding (`I18N-TRANSLATION-PLAN.md`):** ~50 processor/signal UI keys per non-English locale ship as English stubs and require a speaker pass. The system gracefully falls back to English; the user-facing surface for those keys is currently English in 9 locales. |
| **3.2.3 Consistent Navigation** | Supports | Navigation elements (tab bar, filter, HUD) in consistent positions across all views. |
| **3.2.4 Consistent Identification** | Supports | Same icons and labels used for same functions throughout (Keycap component, system color indicators). |
| **3.3.3 Error Suggestion** | Not Applicable | No user input that could produce errors. |
| **3.3.4 Error Prevention** | Not Applicable | No legal, financial, or data-deletion actions. |
| **4.1.3 Status Messages** | Supports | Live region (role=status, aria-live=polite) announces: view changes, node additions, navigation state. Screen reader receives all state updates without focus change. New (v0.2): every processor mutation (add/remove/filter-update/config-update) goes through the agent API which announces through the same live region. SignalFeed itself uses role=log aria-live=polite for streaming signal content. |

---

## Additional Accessibility Features (Beyond WCAG AA)

| Feature | Description |
|---------|-------------|
| Epilepsy / Reduced Motion | OS prefers-reduced-motion respected as default. In-app toggle overrides. Disables all animation, camera lerp, transition crossfades. |
| Color-blind Mode | Pattern fills on 3D shapes (diagonal, crosshatch, horizontal, dots, vertical). Distinct patterns per system. Filter bar swatches also show patterns. |
| Dyslexia Font | Lexend font toggle. Applied via useA11yType hook to all text. |
| Font Visibility | 0-100% slider scales font size (up to 40% larger) and weight (up to +200). |
| Internationalization | 10 languages: English, Spanish, French, Italian, Arabic (RTL), Japanese, Russian, Chinese, Hindi, Indonesian. Core UI strings translated. |
| Screen Reader Announcements | Live region announces: focus/pane/system view changes, node additions, navigation returns, processor add/remove/filter changes. Canvas instructions read on focus. |
| Parallel DOM View | Explorer tree provides full keyboard-navigable DOM equivalent of the 3D canvas. All nodes, systems, and actions accessible. |
| Skip Link | Skip-to-content link visible on Tab focus, bypasses 3D canvas. |
| CQRS Command Surface | Every human-triggerable mutation (tree, processors, settings) flows through a single agent API. AI agent parity with human UI means screen-reader users have identical capability to mouse users via voice commands. |

---

## Testing Status

| Test | Status | Notes |
|------|--------|-------|
| Keyboard navigation | Passed | Full tree traversal, panel switching, filter control, system selection |
| Focus indicators | Passed | :focus-visible on all interactive elements, 3D focus ring on nodes |
| Color contrast | Passed | All text ≥4.5:1, all UI ≥3:1, documented in styles.js |
| Screen reader (VoiceOver) | In Progress | Initial testing done, live region announcements working |
| Browser zoom 200% | Pending | Informal testing OK, formal verification needed |
| Browser zoom 400% at 1280px | Pending | Not yet tested |
| NVDA (Windows) | Pending | Not yet tested |
| JAWS (Windows) | Pending | Not yet tested |

---

## Known Limitations

1. **3D canvas is not directly keyboard-navigable.** The canvas uses role=application with mouse interaction. All equivalent functionality is available through the Explorer tree panel.
2. **Screen reader mode toggle is a stub.** The toggle exists in settings but is not yet functional. Core screen reader support (live regions, ARIA) works without it.
3. **200% and 400% zoom testing** is informal. Formal verification with documented screenshots is pending.
4. **Some hover states use imperative style changes** (onMouseEnter/onMouseLeave) rather than CSS pseudo-classes. Functionally equivalent but harder to override with user stylesheets.
5. **Terminal dots / Checkbox are 20×20 px** — above AA minimum of 24×24 *when the honored 8 px gap between dots is considered as separation*. Not AAA's 44×44. Enlarging further requires a density trade-off the design hasn't committed to yet.
6. **Non-English translation backfill for new processor/signal UI keys.** Core nav translated across 10 locales; processor-specific keys (e.g. systemPage.selectTerminal, systemPage.openProcessor, systemPage.noSignalsYet) fall back to English when the active locale doesn't provide them. Tracked in DEBT.md.
7. **SignalFeed announcement rate** is bounded by `aria-live=polite` queuing but is not debounced. A fast-emitting heartbeat can cause queue backlog on some screen readers. Upcoming work will debounce announcements.

---

*This VPAT was prepared based on internal testing against WCAG 2.1 Level AA criteria. For questions or to report accessibility issues, contact thirdcreed@gmail.com.*
