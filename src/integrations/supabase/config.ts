// Resolved Supabase connection values for the publishable (non-secret) client.
//
// Both values are safe to keep in source: the publishable key is designed for
// browser use and already ships inside the client bundle, so access is enforced
// by row-level security rather than by hiding the string. Committing them means
// a missing or misnamed host environment variable can no longer take the whole
// site down with a 500.
//
// Environment variables still win when present, so a different Supabase project
// can be pointed at without a code change.
//
// The service-role key is NOT here -- that one is a real secret and stays in
// client.server.ts reading from the environment only.
const FALLBACK_URL = 'https://hcpnhwbwlohuysoapvqq.supabase.co';
const FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_zay65Oy3Ggr9bNOS6svxWg_cRwH1MU8';

// process is absent in the browser bundle, so guard before touching it.
function fromNodeEnv(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

export const SUPABASE_URL: string =
  import.meta.env['VITE_SUPABASE_URL'] || fromNodeEnv('SUPABASE_URL') || FALLBACK_URL;

export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
  fromNodeEnv('SUPABASE_PUBLISHABLE_KEY') ||
  FALLBACK_PUBLISHABLE_KEY;
