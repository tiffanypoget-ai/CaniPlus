// src/lib/supabase.js
// Configuration client Supabase (URL + anon key publique)
// Dashboard : https://supabase.com/dashboard/project/oncbeqnznrqummxmqxbx/settings/api

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
