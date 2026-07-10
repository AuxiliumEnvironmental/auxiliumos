# Risk Register

Track product, security, legal, scope, document, and operational risks here.

## Schema Implementation Risks — Added 2026-07-08

Source issue: #68 — Schema implementation readiness gate for foundation slice

| Risk ID | Risk | Category | Severity | Mitigation | Status |
|---|---|---|---|---|---|
| R-SCHEMA-001 | Schema migrations may encode unresolved role authority. | Permission | High | Resolve minimum role authority before migration issue. | Open |
| R-SCHEMA-002 | Account membership model may be wrong if implemented before founder review. | Security / Data model | High | Record minimum account membership decision before migration issue. | Open |
| R-SCHEMA-003 | Document metadata may expose draft/internal documents later if grant model is wrong. | Document release | High | Resolve document grant and release authority before document implementation. | Open |
| R-SCHEMA-004 | Audit visibility may be overexposed if not defined before RLS. | Security / Audit | Medium | Keep audit visibility internal-only until approved. | Open |
| R-SCHEMA-005 | PHI-capable fields may appear if healthcare assumptions are not controlled. | Client data / PHI | High | Preserve no-PHI rule in every schema issue. | Open |


## Minimum Schema Decision Risks — Added 2026-07-10

Source issue: #72 — Minimum schema blocker decisions for foundation slice

| Risk ID | Risk | Category | Severity | Mitigation | Status |
|---|---|---|---|---|---|
| R-SCHEMA-006 | Dev-only decisions may be mistaken for production decisions. | Governance | High | Label all decisions as dev-schema planning only and not production-approved. | Open |
| R-SCHEMA-007 | Minimal static roles may drift from final role authority. | Permission | Medium | Preserve final role authority as founder-review-required. | Open |
| R-SCHEMA-008 | Deferring explicit document grants may require document access redesign later. | Document release | Medium | Treat document access as stricter than account membership and defer final grant model. | Open |
| R-SCHEMA-009 | RLS helper design deferral may affect future migration structure. | Security | Medium | Do not create helper functions until RLS issue. | Open |
| R-SCHEMA-010 | Storage deferral may require document metadata changes later. | Document storage | Medium | Keep storage out of first migration planning and document the deferral. | Open |