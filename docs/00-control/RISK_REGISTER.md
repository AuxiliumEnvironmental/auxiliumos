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