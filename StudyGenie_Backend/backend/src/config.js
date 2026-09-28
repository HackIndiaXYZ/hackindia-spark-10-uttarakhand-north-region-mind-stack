import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const backendRoot = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key] || /YOUR_/i.test(process.env[key])) throw new Error(`[config] Set ${key} in backend/.env (copy .env.example first).`);
}

if (!/^https?:\/\//.test(process.env.SUPABASE_URL)) throw new Error('[config] SUPABASE_URL must be an HTTP(S) URL.');
if (process.env.SUPABASE_ANON_KEY.startsWith('sb_secret_') || (() => { try { return JSON.parse(Buffer.from(process.env.SUPABASE_ANON_KEY.split('.')[1], 'base64url')).role === 'service_role'; } catch { return false; } })()) throw new Error('[config] SUPABASE_ANON_KEY must be a public key, never an admin key.');
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('[config] PORT must be between 1 and 65535.');
export const config = {
  port,
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173')
    .split(',').map((x) => x.trim()).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  pythonBin: process.env.PYTHON_BIN || 'python',
  tmpDir: process.env.TMP_DIR || './tmp',
  autoGenerateNotes: String(process.env.AUTO_GENERATE_NOTES || 'true').toLowerCase() === 'true',
  cleanerKey: process.env.CLEANER_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
  cleanerModel: process.env.CLEANER_GEMINI_MODEL || process.env.GEMINI_MODEL || '',
  enableAiCleaner: String(process.env.ENABLE_AI_TRANSCRIPT_CLEANER || 'false').toLowerCase() === 'true',
};
