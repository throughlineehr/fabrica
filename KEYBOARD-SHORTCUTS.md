# Fabrica — Keyboard Shortcuts

Single reference for every hotkey in the app. Matches what's in
`useTreeKeyboard.js`, `Switchboard.jsx`, and the App-level handlers.
WCAG 2.1.1 (Keyboard) compliance: every action available by mouse is
available by keyboard.

---

## Global

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Focus next / previous interactive element |
| `Escape` | Step back: close panel → cancel clipboard → exit pane → exit focus → overview |
| `S` | Open Settings panel (when no input is focused) |
| `E` | Open Explorer panel |
| `T` | Open Tools panel |
| `F` | Open Filter panel |

Single-key shortcuts only fire when no text input is focused.

---

## 3D canvas

| Key | Action |
|---|---|
| Mouse drag | Orbit camera (when not in focus/pane mode) |
| Mouse wheel | Zoom |
| Double-click node | Drill: overview → focus → pane → system page |
| Double-click empty | Step back |
| Right-click node | Context menu (rename / add / duplicate / splice / delete) |

The 3D canvas is supplemented by the Explorer tree (press `E`) for
keyboard-only operation.

---

## Explorer tree

`useTreeKeyboard.js`. Active when the Explorer panel is focused.

### Navigation
| Key | Action |
|---|---|
| `↓` / `↑` | Move focus to next / previous visible node |
| `→` | Expand node, or step into first child if expanded |
| `←` | Collapse node, or step to parent if collapsed |
| `Home` | First node |
| `End` | Last node |
| `Enter` / `Space` | Activate (focus 3D node, open system page, etc.) |
| `Escape` | Cancel clipboard → step back |

### Actions
| Key | Action |
|---|---|
| `F2` | Inline rename |
| `Delete` / `Backspace` | Delete (with inline confirmation: press again or `Enter` to confirm, `Escape` to cancel) |
| `Cmd/Ctrl + X` | Cut node to clipboard |
| `Cmd/Ctrl + C` | Copy node to clipboard |
| `Cmd/Ctrl + V` | Paste from clipboard |

### Paste-slot toggle
While a clipboard is set:

| Key | Action |
|---|---|
| `↓` / `↑` | Alternate between "drop INTO highlighted node" and "drop AFTER (drop-line below)" |

---

## System rooms (Switchboard)

`Switchboard.jsx`. Active when a row is focused.

| Key | Action |
|---|---|
| `Tab` to row | Focus row (scrolls into view) |
| `↓` / `↑` | Next / previous row |
| `Home` / `End` | First / last row |
| `Enter` / `Space` | Open processor detail page |
| `Delete` / `Backspace` | Remove processor (focus shifts to next row) |

---

## Modals

`ProcessorLibraryModal.jsx`. While the modal is open, focus is trapped
within it.

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cycle through modal focusables (wraps at boundaries) |
| `Enter` | Activate selected processor (close modal, add to room) |
| `Escape` | Close modal, restore focus to opener |

---

## Filter panel

| Key | Action |
|---|---|
| `↓` / `↑` / `←` / `→` | Move focus between system checkboxes |
| `Space` | Toggle |

---

## AI Agent panel

| Key | Action |
|---|---|
| `Enter` | Submit message |
| `Shift+Enter` | Newline |

(Voice input/output: clickable mic toggle, no shortcut.)

---

## Wiring (styleguide demo)

`src/components/wiring/WiringDemo.jsx`. Reference for the rack-back
view per `INTERNAL-WIRING-DESIGN.md`.

| Key | Action |
|---|---|
| `Tab` to jack | Focus a jack |
| `Enter` on connected jack | Detach cable, start patching from the other end |
| `Enter` on unconnected jack | Start patching from this jack |
| `Tab` / `Shift+Tab` during patch | Move ghost cable between eligible targets in DOM order |
| `↓` / `↑` / `→` / `←` during patch | Same as Tab / Shift+Tab (spatial alternative) |
| `Enter` during patch | Commit cable to current target |
| `Escape` during patch | Cancel |
| Click cable midspan | Select cable |
| `Delete` / `Backspace` (with cable selected) | Remove |

---

## Conventions

- **Capture-phase listeners** are used for global handlers so they
  don't fight with embedded controls (verified in
  `useTreeKeyboard.js`).
- **Single-letter shortcuts** are gated on `document.activeElement`
  not being an `<input>` / `<textarea>` (so typing in a field
  doesn't open panels).
- **Escape priority chain** is: text-input cancel → modal close →
  clipboard cancel → patch cancel → pane back → focus back →
  overview. First match wins; never traverse multiple steps from one
  press.
- **Live-region announcements** on every navigation action so
  screen-reader users hear context changes without a focus event.

---

*Source files: `src/hooks/useTreeKeyboard.js`, `src/App.jsx`,
`src/components/room/Switchboard.jsx`,
`src/components/room/ProcessorLibraryModal.jsx`,
`src/components/wiring/WiringDemo.jsx`.*
