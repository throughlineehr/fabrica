# Fabrica — i18n Translation Plan

Tracking the translation parity gap. Not urgent — recorded so it's
ready to act on when speakers are available. Last surveyed
2026-04-25.

The i18n *system* is solid: 10 locales registered, fallback works,
RTL handled, font/dyslexia/font-visibility compose correctly, no
runtime issues from missing keys. The gap is content: ~50 keys per
non-English locale that ship as English stubs because the v0.2
processor/signal UI didn't get a translation pass.

---

## What needs translating

### 1. Processor / signal subsystem keys (all 9 non-English locales)

Cluster: `systemPage.*`. Examples (full list lives in `src/i18n/en.js`):

```
systemPage.audit
systemPage.incoming
systemPage.outgoing
systemPage.inOut
systemPage.signalTypes
systemPage.subsystems
systemPage.processor
systemPage.processors
systemPage.addProcessor
systemPage.processorLibrary
systemPage.noProcessors
systemPage.inputs
systemPage.outputs
systemPage.none
systemPage.anyChannel
systemPage.configurable
systemPage.filters
systemPage.filterTypes
systemPage.filterTags
systemPage.filterTerminals
systemPage.allTypes
systemPage.allTerminals
systemPage.save
systemPage.tabSwitchboard
systemPage.tabIO
systemPage.liveLog
systemPage.hops
systemPage.openProcessor
systemPage.removeProcessor
systemPage.selectTerminal
systemPage.selected
systemPage.algedonic
systemPage.switchboard
systemPage.dashboard
systemPage.terminals
systemPage.apps
systemPage.statePage
systemPage.logs
systemPage.metrics
systemPage.noSignalsYet
```

These exist in every locale file but the values are English copies.
A user switching to Spanish and entering a system room sees an
English wall.

### 2. `settings.colorBlindMode` (9 locales)

Only Russian has a real translation. All other non-English locales
have the literal "Color-blind patterns" string under the key.
Visible in Settings → Accessibility.

### 3. Russian: actual broken content (not just missing)

`src/i18n/ru.js` has issues beyond the gap above — distinct from the
"speaker pass" work:

- `agent.intro` partially in English mid-string
- `agent.cannotAddOperation` appears truncated
- `agent.cannotRemoveRoot` appears truncated
- `agent.wentBack` appears truncated

This is repair work, not new translation. Verify and complete.

### 4. Hardcoded English strings in code

Pre-existing debt (predates v0.2):

- `PLACEHOLDER_APPS` signal type names ("metric", "directive", etc.)
  are string literals in code, not keyed. Move to i18n keys before
  translating.

### 5. Out of scope

- `src/components/wiring/WiringDemo.jsx` — styleguide-only demo,
  English is fine. When the wiring feature is promoted into the
  real room UI per `INTERNAL-WIRING-DESIGN.md`, the strings move
  to i18n keys at that time.

---

## Speaker checklist (per language)

For each language, find at least one fluent speaker who can review
~50 short technical strings (4 hours of focused work, splittable).
Per-language notes for where to look:

### Spanish (es)
- [ ] Find Spanish speaker
- Strong candidate pool: the Chilean cybernetics community (Cybersyn
  legacy), Latin American cooperative networks. Caleb's prior
  Cybersyn-in-Chile visit may have produced contacts.
- Also: any Spanish-speaking VSM practitioners in your network.
- RTL: no.

### French (fr)
- [ ] Find French speaker
- Candidate pool: Quebecois or French organizational-cybernetics
  community, cooperative federations in France/Belgium/Switzerland.
- RTL: no.

### Italian (it)
- [ ] Find Italian speaker
- Candidate pool: Italian cooperative movement (Emilia-Romagna has
  a deep cooperative tradition), VSM practitioners in Italy.
- RTL: no.

### Japanese (ja)
- [ ] Find Japanese speaker
- Candidate pool: cybernetics academic community in Japan, anyone
  in your network with Japanese fluency. Technical translation in
  Japanese is sensitive to register (formal vs casual) — the rest
  of the locale uses formal/polite forms; new translations should
  match.
- RTL: no, but vertical-text aware fonts are not currently
  configured (out of scope for this pass).

### Arabic (ar)
- [ ] Find Arabic speaker
- Candidate pool: Arab cooperative networks, accessibility-focused
  Arabic translators (this work is partly an a11y deliverable).
- **RTL**: yes. Verify visual layout doesn't break with the new
  translations (some terms expand significantly in Arabic).

### Hindi (hi)
- [ ] Find Hindi speaker
- Candidate pool: Indian cooperative federations (SEWA, dairy
  cooperatives), labor organizations.
- RTL: no.

### Indonesian (id)
- [ ] Find Indonesian speaker
- Candidate pool: Indonesian cooperative movement (`koperasi`),
  worker-cooperative networks.
- RTL: no.

### Russian (ru)
- [ ] Find Russian speaker
- Candidate pool: Russian-speaking cybernetics academic community,
  cooperative federations.
- **Two jobs:** repair the truncated `agent.*` strings AND fill the
  missing `systemPage.*` keys. The repair part is small but blocks
  trust in the locale.
- RTL: no.

### Chinese (zh)
- [ ] Find Chinese speaker
- Candidate pool: Mainland or Taiwan cooperative networks, Chinese
  organizational-cybernetics community.
- Decide simplified vs traditional (`zh.js` currently appears
  Simplified — verify).
- RTL: no.

---

## Process for each language

1. [ ] **Speaker found.** Recorded in this doc above.
2. [ ] **Tooling.** Send the speaker `src/i18n/en.js` and
   `src/i18n/<lang>.js`. They can edit the second file directly,
   replacing English values with translations. No build tools
   required.
3. [ ] **Context provided.** Brief them: Fabrica is a viable system
   model visualization. The strings they're translating are UI
   labels for a system-administration interface for organizational
   management. Tone: technical but not sterile. Match the existing
   translated strings' register.
4. [ ] **Receive translation.**
5. [ ] **Review.** Spot-check obviously-wrong items (e.g., the
   colorBlindMode string should be a noun phrase, not a sentence).
   For Arabic: visually verify in-app that the layout doesn't
   break.
6. [ ] **Commit.** Each language as its own commit.
   `i18n: complete <lang> translation pass`.
7. [ ] **Update DEBT.md** to remove the language from the gap list.
8. [ ] **Update VPAT-2.5.md** §3.1.2 once all 9 are done.

---

## Decision: when

Listed in `DEBT.md` under "WCAG 2.1 Level AA → Open." Not blocking
plateau-0 ship. Move it forward when:

- A real non-English-speaking user trips on it (most likely signal)
- Plateau 1 (multi-org server) approaches — translation parity
  becomes a procurement-readiness item
- A speaker volunteers (if you find someone, take it)

Otherwise, the system shows English fallback gracefully and the
keys are in place for any locale to be filled when its turn comes.
