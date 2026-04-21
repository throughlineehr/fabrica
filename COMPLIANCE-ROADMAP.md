# Fabrica — Compliance & Security Roadmap

## Goal

Make Fabrica deployable and procurable by any organization worldwide — federal, state/local, EU, defense, enterprise — out of the box. No compliance surprises, no scrambling after a buyer asks.

---

## 1. Accessibility (WCAG 2.1 AA / Section 508)

### Current Status: ~95% Complete

**Done:**
- VPAT 2.5 document (VPAT-2.5.md)
- All WCAG 2.1 AA criteria evaluated
- Parallel DOM Explorer tree as 3D canvas alternative
- Color-blind patterns, epilepsy mode, dyslexia font, font scaling
- 9 languages with RTL support
- Screen reader live regions, ARIA roles/states throughout
- Skip-to-content link, semantic headings, keyboard navigation
- All text ≥12px, all contrast ≥4.5:1 text / ≥3:1 UI
- Focus indicators on every interactive element

**Remaining:**
- [ ] **200% browser zoom test** — manual, document with screenshots
- [ ] **400% at 1280px reflow test** — manual, document with screenshots
- [ ] **NVDA testing (Windows)** — free screen reader, critical for federal buyers
- [ ] **JAWS testing (Windows)** — commercial, gold standard for federal
- [ ] **Convert VPAT to official ITI HTML template** — buyers expect the standard format
- [ ] **Add remediation plan section** with target dates for any gaps
- [ ] **3D Accessibility Strategy document** — dedicated explanation of the canvas/Explorer architectural decision

### Stretch (WCAG AAA partial)
- [ ] 2.3.3 Animation from Interactions (cheap — epilepsy mode covers it)
- [ ] 2.4.8 Location (breadcrumbs already implemented)
- [ ] 2.5.5 Target Size 44px (most elements already at 44px)

---

## 2. EU Compliance

### GDPR (General Data Protection Regulation)

**Required if any EU users or data subjects:**

- [ ] **Right to deletion** — user requests data deletion, system must comply within 30 days
  - Architecture note: our flat entity store makes this straightforward — delete user's org data
- [ ] **Right to data portability** — export user's data in machine-readable format (JSON, CSV)
  - Already planned: JSON export of the model
- [ ] **Consent management** — explicit opt-in before collecting personal data
  - Need: consent banner/flow for cookies, analytics, data processing
- [ ] **Data Processing Agreement (DPA)** — template for enterprise/gov customers
- [ ] **Privacy Policy** — public, plain-language, covers what data is collected and why
- [ ] **Data breach notification** — process to notify authorities within 72 hours
- [ ] **Data Protection Impact Assessment (DPIA)** — for high-risk processing
- [ ] **Cookie policy** — if any cookies beyond essential session cookies
- [ ] **Right to rectification** — users can correct their data
- [ ] **Lawful basis documentation** — document why each piece of data is collected

### EN 301 549 (European Accessibility Standard)

- Largely overlaps with WCAG 2.1 AA — our VPAT covers most of this
- [ ] **EN 301 549 specific VPAT edition** — the ITI template has an EU column, fill it in
- [ ] **Accessibility statement** — public page declaring conformance level (required in many EU countries)

### eIDAS (EU Digital Identity)

- [ ] **Support EU digital identity** when it becomes mandatory for public sector tools
- Not immediate but worth tracking

---

## 3. Security

### SOC 2 Type II

**Required by most enterprise and government buyers:**

- [ ] **Access Controls** — role-based access (already in scaling plan: viewer, operator, manager, admin, owner)
- [ ] **Encryption at rest** — database encryption (AES-256)
- [ ] **Encryption in transit** — TLS 1.3 everywhere
- [ ] **Audit logging** — every command (addNode, removeNode, etc.) logged with user ID, timestamp, IP
  - Architecture note: command pattern already in place, just needs persistence
- [ ] **Incident response plan** — documented process for security incidents
- [ ] **Vendor risk management** — document all third-party dependencies and their security posture
- [ ] **Annual penetration testing** — by a qualified third party, documented
- [ ] **Background checks** — for team members with access to production data
- [ ] **Business continuity plan** — disaster recovery, backup strategy
- [ ] **Change management process** — documented process for deploying changes

### FedRAMP (US Federal Cloud)

**Required for US federal agency cloud deployments:**

- [ ] **FedRAMP authorization** — Li-SaaS, Low, Moderate, or High depending on data sensitivity
  - Most VSM use cases: Moderate
  - This is a 6-18 month process with a 3PAO (third-party assessment organization)
- [ ] **Continuous monitoring** — monthly vulnerability scans, annual assessments
- [ ] **Plan of Action & Milestones (POA&M)** — track and remediate findings
- [ ] **System Security Plan (SSP)** — comprehensive document describing security controls
- [ ] **All NIST 800-53 controls** — FedRAMP is built on this framework

### FISMA (Federal Information Security)

- Overlaps heavily with FedRAMP
- [ ] **NIST 800-53 control mapping** — document which controls are met and how
- [ ] **Authority to Operate (ATO)** — agency-specific, but FedRAMP provides a baseline

### StateRAMP (US State/Local)

- Lighter than FedRAMP, same concept for state government
- [ ] **StateRAMP authorization** — faster path than FedRAMP for state/local buyers

---

## 4. Authentication & Identity

- [ ] **SSO via SAML 2.0** — most government IdPs use SAML
- [ ] **SSO via OIDC** — modern alternative, Azure AD and Okta support both
- [ ] **MFA enforcement** — configurable per org, mandatory for admin roles
- [ ] **No standalone passwords** — all auth through IdP, no local password storage
- [ ] **Session management** — configurable timeout, secure session tokens
- [ ] **CAC/PIV card support** — for DoD environments, smart card authentication
- [ ] **Certificate-based auth** — for air-gapped environments

---

## 5. Data Sovereignty & Residency

- [ ] **Configurable data residency** — admin chooses region (US, EU, specific country)
- [ ] **No cross-border data transfer without consent** — GDPR requirement
- [ ] **Air-gapped deployment option** — on-premise installation with no internet dependency
  - This alone eliminates 90% of competitors for defense/intel buyers
- [ ] **Data classification metadata** — nodes can carry classification levels (UNCLASSIFIED, CUI, SECRET)
  - Restricts visibility per user clearance level
  - Integrates with our permission system

---

## 6. Export & Interoperability

- [ ] **JSON export** of the full model (already using flat entity store — natural fit)
- [ ] **CSV export** of node list with hierarchy
- [ ] **SVG export** of the 3D view (static snapshot)
- [ ] **PDF export** of detail views and full model reports
- [ ] **API access** — RESTful API for integration with other tools
- [ ] **Webhook support** — notify external systems of model changes
- [ ] **Open format** — no proprietary data format. JSON + documented schema.
- [ ] **Import from existing tools** — CSV/JSON import to bootstrap a model

---

## 7. Audit & Accountability

- [ ] **Comprehensive audit log** — every mutation, login, permission change
- [ ] **Audit log export** — CSV/JSON for compliance reporting
- [ ] **Immutable audit trail** — logs cannot be modified or deleted
- [ ] **User activity reports** — "show me everything user X did in the last 90 days"
- [ ] **Admin dashboard** — org-wide view of activity, anomalies, usage
- [ ] **Retention policies** — configurable log retention periods per regulation

---

## 8. Deployment Options

| Mode | Description | Target Buyer |
|------|-------------|--------------|
| **SaaS (multi-tenant)** | Hosted, managed, auto-updated | Enterprise, state/local gov |
| **Single-tenant cloud** | Dedicated instance per org | Federal agencies, healthcare |
| **On-premise** | Installed in org's own infrastructure | Defense, intel, air-gapped |
| **Hybrid** | Cloud management, local data | Regulated industries |

Each mode must meet the same security baseline. The architecture (flat entity store, command pattern, WebSocket protocol) supports all four.

---

## 9. Certifications Priority Order

| Priority | Certification | Why | Timeline |
|----------|--------------|-----|----------|
| 1 | **VPAT 2.5 (complete)** | Gate for any accessibility-aware buyer | Now (95% done) |
| 2 | **SOC 2 Type I** | Proves security controls exist | 3-6 months |
| 3 | **SOC 2 Type II** | Proves controls work over time | 6-12 months |
| 4 | **StateRAMP** | State/local government market | 6-12 months |
| 5 | **FedRAMP (Li-SaaS or Low)** | Federal market entry | 12-18 months |
| 6 | **GDPR compliance** | EU market entry | 3-6 months (mostly policy) |
| 7 | **FedRAMP Moderate** | Broader federal (including DoD) | 18-24 months |
| 8 | **ISO 27001** | International enterprise standard | 12-18 months |

---

## 10. What We Can Do Now (In Code)

These architectural decisions cost nothing now but save months later:

1. **Audit logging on every command** — `addNode`, `removeNode` already exist as pure functions. Wrap them to log `{ command, userId, timestamp, payload }` before executing. This becomes the audit trail.

2. **Never store passwords** — plan for SSO-only from day one. The user model has an `orgId` and `role`, not a password hash.

3. **UUID everything** — already done. No sequential IDs that leak information.

4. **Command pattern is the wire protocol** — already done. Commands can be replayed, audited, and transmitted.

5. **Flat entity store** — already done. Makes data deletion (GDPR), export (portability), and classification metadata (defense) straightforward.

6. **Role-based access** — already planned in scaling doc. Implement as middleware on the command layer.

7. **Export capability** — JSON model export is trivial from our current data structure. Add SVG/PDF later.

8. **Classification metadata on entities** — add an optional `classification` field to the entity store. Filter visibility by user clearance. Costs one field now, enables defense market later.

---

*This roadmap is a living document. Update as certifications are achieved and new markets are targeted.*
