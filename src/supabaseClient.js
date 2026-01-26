import { createClient } from '@supabase/supabase-js'

const sanitize = (v) => (typeof v === 'string' ? v.trim().replace(/^`|`$/g, '') : v)

const SUPABASE_DB_URL =
  sanitize(import.meta.env.VITE_SUPABASE_DB_URL) ||
  sanitize(import.meta.env.VITE_SUPABASE_URL) ||
  'https://defyvntymvoshsomvsrr.supabase.co'
const SUPABASE_DB_KEY =
  sanitize(import.meta.env.VITE_SUPABASE_DB_ANON_KEY) ||
  sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  'sb_publishable_RODVtgw_EwpNK-4wMriUag_yjFsgIMW'

const SUPABASE_STORAGE_URL = sanitize(import.meta.env.VITE_SUPABASE_STORAGE_URL)
const SUPABASE_STORAGE_KEY = sanitize(import.meta.env.VITE_SUPABASE_STORAGE_ANON_KEY)

if (!SUPABASE_STORAGE_URL || !SUPABASE_STORAGE_KEY) {
  console.error('Supabase Storage ENV missing', {
    SUPABASE_STORAGE_URL,
    SUPABASE_STORAGE_KEY: !!SUPABASE_STORAGE_KEY,
  })
}

export const supabaseDb = createClient(SUPABASE_DB_URL, SUPABASE_DB_KEY)
export const HAS_STORAGE_ENV = !!(SUPABASE_STORAGE_URL && SUPABASE_STORAGE_KEY)
export const supabaseStorage = HAS_STORAGE_ENV
  ? createClient(SUPABASE_STORAGE_URL, SUPABASE_STORAGE_KEY)
  : null
export const supabase = supabaseDb
export const STORAGE_BUCKET = sanitize(import.meta.env.VITE_SUPABASE_BUCKET) || 'patient-photos'
