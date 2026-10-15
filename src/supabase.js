import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://crupfenknpraznzxibgl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_qJaLA6sj7qzc_f4TdUD2Og_IMYLpfoH';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

