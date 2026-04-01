import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hdoqrtblxprgnwoymsqg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhkb3FydGJseHByZ253b3ltc3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDgwMTEsImV4cCI6MjA5MDU4NDAxMX0.iLZgK9EP-XOfTiQ48LSArYCKUfhn0QOpxPswk24bb_w'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
