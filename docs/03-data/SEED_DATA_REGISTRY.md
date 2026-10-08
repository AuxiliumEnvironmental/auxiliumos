> Current observation 2026-10-08: supabase/seed/foundation_demo_seed.sql exists with synthetic deterministic data. Any older future-only/no-file statements below are historical. Database execution and live environment contents are unverified.

# Seed Data Registry

Document seed records and test data here.

---

# Foundation Slice Future Seed Data Plan

Added: 2026-07-06  
Source issue: #66 — Supabase schema design packet for foundation slice

Status:

Planned only. No seed files created.

Seed data must remain fake/demo only.

Future fake seed records may include:

| Seed concept | Example value | Purpose |
|---|---|---|
| Demo account | Demo Property Group | Fake account for development/testing. |
| Demo facility | North Wing Facility | Fake facility for facility-linked workflows. |
| Demo request | Water Intrusion Demo | Fake incident/request for app/testing. |
| Demo document | Document Placeholder 001 | Fake document metadata. |
| Demo internal user | Auxilium Admin Demo | Fake internal actor. |
| Demo client user | Client Viewer Demo | Fake client viewer. |
| Demo audit event | Request Submitted | Future audit test placeholder. |
| Demo audit event | Document Released | Future audit test placeholder. |

Disallowed seed data:

- Real client names
- Real addresses
- Real project names
- Real documents
- Real contacts
- PHI
- Passwords
- API keys
- Service-role keys
- Any secret


---

# Foundation Migration Control Packet Seed Rules

Added: 2026-07-12  
Source issue: #74 — Foundation migration control packet

Seed data status:

Future-only.

No seed file is created by this packet.

Future seed data must be fake/demo only.

Allowed future examples:

- Demo Property Group
- North Wing Facility
- Water Intrusion Demo
- Document Placeholder 001
- Auxilium Admin Demo
- Client Viewer Demo
- Request Submitted placeholder event
- Document Released placeholder event

Disallowed:

- Real client names
- Real addresses
- Real contacts
- Real documents
- Real project names
- PHI
- Passwords
- API keys
- Service-role keys
- Any secret
