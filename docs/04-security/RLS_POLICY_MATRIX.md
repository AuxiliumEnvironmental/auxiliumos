# RLS Policy Matrix

## Tenant Ownership Rule
Every client-owned operational table must include account_id or have a clear path to account ownership through a required parent record.

## No Public Client Data Rule
No table containing client, project, facility, document, invoice, agreement, or communication data may be publicly readable.

## Tests Required
Every RLS policy needs positive and negative tests.
