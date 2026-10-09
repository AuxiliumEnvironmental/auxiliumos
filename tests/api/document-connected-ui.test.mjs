// A distinct noncacheable profile. Every UI action reaches actual Supabase.
process.env.AUXILIUMOS_TEST_DOCUMENT_BROWSER = 'true';
await import('./document-versions.test.mjs');
