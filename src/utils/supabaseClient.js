// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export function getSupabaseCredentials() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  return {
    url: envUrl || '',
    key: envKey || '',
    source: envUrl ? 'env' : 'none',
  };
}

export function initializeSupabase(url, key) {
  if (!url || !key) {
    supabaseInstance = null;
    return null;
  }

  try {
    supabaseInstance = createClient(url, key);
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    supabaseInstance = null;
    return null;
  }
}

export function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getSupabaseCredentials();
  if (url && key) {
    return initializeSupabase(url, key);
  }

  return null;
}
