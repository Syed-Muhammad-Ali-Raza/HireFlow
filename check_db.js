import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

global.WebSocket = class {};

const envPath = path.resolve('.env.local');
let supabaseUrl = '';
let supabaseServiceKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
        supabaseUrl = value;
      } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
        supabaseServiceKey = value;
      }
    }
  }
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { error: pError } = await supabase.from('profiles').select('id').limit(1);
  const { error: cError } = await supabase.from('companies').select('id').limit(1);
  console.log("profiles:", pError ? pError.message : "OK");
  console.log("companies:", cError ? cError.message : "OK");
}
check();
