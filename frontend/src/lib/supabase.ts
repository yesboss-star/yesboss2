export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
}

export function getSupabaseUrl() {
  return supabaseConfig.url
}

export function getSupabaseAnonKey() {
  return supabaseConfig.anonKey
}

export function isSupabaseConfigured() {
  return !!(supabaseConfig.url && supabaseConfig.anonKey)
}