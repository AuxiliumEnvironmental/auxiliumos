# Security Guardrails

- RLS required on client-data tables.
- No service-role keys in frontend code.
- No production secrets in AI chats.
- No production write access for agents during prep.
- Client-visible documents require release workflow.
- Removed users lose access.
