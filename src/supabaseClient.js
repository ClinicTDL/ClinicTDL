import { createClient } from '@supabase/supabase-js'

const SUPABASE_DB_URL =
  import.meta.env.VITE_SUPABASE_DB_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  'https://defyvntymvoshsomvsrr.supabase.co'
const SUPABASE_DB_KEY =
  import.meta.env.VITE_SUPABASE_DB_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_RODVtgw_EwpNK-4wMriUag_yjFsgIMW'

const SUPABASE_STORAGE_URL =
  import.meta.env.VITE_SUPABASE_STORAGE_URL || SUPABASE_DB_URL
const SUPABASE_STORAGE_KEY =
  import.meta.env.VITE_SUPABASE_STORAGE_ANON_KEY || SUPABASE_DB_KEY

export const supabaseDb = createClient(SUPABASE_DB_URL, SUPABASE_DB_KEY)
export const supabaseStorage = createClient(SUPABASE_STORAGE_URL, SUPABASE_STORAGE_KEY)
export const supabase = supabaseDb
export const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'patient-photos'
