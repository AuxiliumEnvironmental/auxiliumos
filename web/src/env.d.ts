/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ALLOW_LOCAL_TEST_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
