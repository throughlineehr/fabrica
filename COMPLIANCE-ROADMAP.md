# Fabrica — Compliance, Security & Ethics Roadmap

## Goal

Make Fabrica deployable and procurable by organizations worldwide — civic government, healthcare, education, cooperatives, enterprise — out of the box. Built with integrity, accessible to all.

---

## 0. Ethical Use & Licensing

### Hippocratic License

Fabrica is licensed under the **Hippocratic License 3.0** (HL3). This license permits use of the software provided it is not used to:

- Facilitate violence or manufacture of weapons
- Conduct military operations or military intelligence
- Enable mass surveillance or tracking of individuals
- Violate human rights as defined by the UN Universal Declaration of Human Rights
- Cause environmental destruction

**Why:** Organizational cybernetics tools can optimize any organization. We choose to make this tool available only to organizations whose purpose aligns with human flourishing.

**Enforcement:**
- SaaS: Terms of service prohibit restricted uses; violations result in account termination
- On-premise: License terms are legally binding; restricted-use organizations are not granted a license
- The license is checked at the organizational level, not individual user level

### Prohibited Buyers
- Military organizations (any nation)
- Intelligence agencies (any nation)
- Weapons manufacturers and defense contractors
- Private military/security companies
- Organizations conducting mass surveillance

### Encouraged Buyers
- Hospitals and healthcare systems
- Schools and universities
- Cooperatives and worker-owned organizations
- Municipal and civic governments
- Non-profits and NGOs
- Social enterprises
- Any organization working to improve human welfare

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
- AI agent with voice input/output for universal access

**Remaining:**
- [ ] 200% browser zoom test
- [ ] 400% at 1280px reflow test
- [ ] NVDA testing (Windows)
- [ ] JAWS testing (Windows)
- [ ] Convert VPAT to official ITI HTML template

---

## 2. EU Compliance

### GDPR (General Data Protection Regulation)

- [ ] Right to deletion — delete user's org data within 30 days
- [ ] Right to data portability — JSON/CSV export
- [ ] Consent management — explicit opt-in for data processing
- [ ] Data Processing Agreement (DPA) template
- [ ] Privacy Policy — plain-language, public
- [ ] Data breach notification process (72 hours)
- [ ] Data Protection Impact Assessment (DPIA)
- [ ] Right to rectification

### EN 301 549 (European Accessibility Standard)

- [ ] EN 301 549 VPAT edition
- [ ] Public accessibility statement

---

## 3. Security

### SOC 2 Type II

- [ ] Role-based access controls
- [ ] Encryption at rest (AES-256) and in transit (TLS 1.3)
- [ ] Audit logging on every command
- [ ] Incident response plan
- [ ] Vendor risk management
- [ ] Annual penetration testing
- [ ] Business continuity plan
- [ ] Change management process

### StateRAMP (US State/Local)

- [ ] StateRAMP authorization for state/local government market

---

## 4. Authentication & Identity

- [ ] SSO via SAML 2.0
- [ ] SSO via OIDC (Azure AD, Okta)
- [ ] MFA enforcement — configurable per org
- [ ] No standalone passwords — all auth through IdP
- [ ] Session management — configurable timeout

---

## 5. Data Sovereignty & Residency

- [ ] Configurable data residency — admin chooses region (US, EU, specific country)
- [ ] No cross-border data transfer without consent (GDPR)
- [ ] On-premise deployment option — for organizations that need full data control
- [ ] Private network support — Ollama integration for AI without external API calls

---

## 6. Export & Interoperability

- [ ] JSON export of the full model
- [ ] CSV export of node list with hierarchy
- [ ] SVG export of the 3D view
- [ ] PDF export of detail views and reports
- [ ] RESTful API for integration
- [ ] Webhook support for change notifications
- [ ] Open format — no vendor lock-in
- [ ] Import from CSV/JSON

---

## 7. Audit & Accountability

- [ ] Comprehensive audit log — every mutation, login, permission change
- [ ] Audit log export — CSV/JSON
- [ ] Immutable audit trail
- [ ] User activity reports
- [ ] Admin dashboard
- [ ] Configurable retention policies

---

## 8. Deployment Options

| Mode | Description | Target |
|------|-------------|--------|
| **SaaS (multi-tenant)** | Hosted, managed, auto-updated | Enterprise, civic gov, healthcare |
| **Single-tenant cloud** | Dedicated instance per org | Organizations needing isolation |
| **On-premise** | Installed in org's own infrastructure | Privacy-focused orgs, healthcare |
| **Hybrid** | Cloud management, local data | Regulated industries |

---

## 9. Certifications Priority Order

| Priority | Certification | Why | Timeline |
|----------|--------------|-----|----------|
| 1 | **VPAT 2.5 (complete)** | Accessibility gate | Now |
| 2 | **Hippocratic License** | Ethical foundation | Now |
| 3 | **SOC 2 Type I** | Security baseline | 3-6 months |
| 4 | **GDPR compliance** | EU market | 3-6 months |
| 5 | **SOC 2 Type II** | Sustained security | 6-12 months |
| 6 | **StateRAMP** | Civic government market | 6-12 months |
| 7 | **ISO 27001** | International standard | 12-18 months |

---

## 10. What We Can Do Now (In Code)

1. **Audit logging on every command** — command pattern already in place
2. **Never store passwords** — SSO-only from day one
3. **UUID everything** — already done
4. **Command pattern is the wire protocol** — already done
5. **Flat entity store** — makes deletion, export, and portability straightforward
6. **Role-based access** — planned in scaling doc
7. **Export capability** — JSON model export trivial from current structure
8. **Hippocratic License file** — add LICENSE.md to the repository

---

*This roadmap is a living document. Update as certifications are achieved and markets are served.*
