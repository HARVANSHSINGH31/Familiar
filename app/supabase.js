import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://udlbvxyqapdvnbvwlnfp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0rXZPVdmX--B1P9ncuobXg_YQwgmeyn';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});