import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and parse .env.local manually
const envPath = path.resolve(__dirname, '../../../../../.env.local');
console.log("Reading environment from:", envPath);

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
      // Remove surrounding quotes if any
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
} catch (e) {
  console.error("Failed to read .env.local file:", e.message);
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTables() {
  console.log("Checking Supabase connection...");
  console.log("URL:", supabaseUrl);
  
  // Try to query profiles
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);
    
  if (pError) {
    console.error("Error querying 'profiles':");
    console.error(JSON.stringify(pError, null, 2));
  } else {
    console.log("Successfully queried 'profiles'. Data:", profiles);
  }

  // Try to query companies
  const { data: companies, error: cError } = await supabase
    .from('companies')
    .select('*')
    .limit(1);

  if (cError) {
    console.error("Error querying 'companies':");
    console.error(JSON.stringify(cError, null, 2));
  } else {
    console.log("Successfully queried 'companies'. Data:", companies);
  }
}

checkTables();
