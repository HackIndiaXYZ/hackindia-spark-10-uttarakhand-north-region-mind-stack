import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { config, backendRoot } from '../config.js';
const script = path.join(backendRoot, 'python/transcribe_youtube.py');
const children = new Set();
export function stopWorkers() { for (const child of children) child.kill(); }
export async function resolvePythonBin(value = config.pythonBin) {
  if (value && value !== 'python') {
    if (!value.includes('/') && !value.includes('\\')) return value;
    const resolved = path.resolve(backendRoot, value);
    try { await access(resolved); } catch { throw new Error('PYTHON_BIN does not exist. Create backend/.venv or correct backend/.env.'); }
    return resolved;
  }
  const candidate = path.join(backendRoot, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  try { await access(candidate); return candidate; } catch { return 'python'; }
}
export async function transcribeYouTube(url) {
  const tmpDir = path.resolve(backendRoot, config.tmpDir);
  await mkdir(tmpDir, { recursive: true });
  const python = await resolvePythonBin();
  const timeout = Number(process.env.WORKER_TIMEOUT_MS || 7200000);
  if (!Number.isFinite(timeout) || timeout < 1000) throw new Error('WORKER_TIMEOUT_MS must be at least 1000.');
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-u', script, '--url', url, '--tmp-dir', tmpDir], {
      cwd: backendRoot, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', STUDYGENIE_NODE_BIN: process.execPath },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    children.add(child);
    const decoder = new StringDecoder('utf8');
    let stdout = '', stderr = '', timedOut = false, oversized = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', data => {
      stdout += decoder.write(data);
      if (stdout.length > 32 * 1024 * 1024) { oversized = true; child.kill(); }
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); process.stderr.write(data); });
    const cleanup = () => { clearTimeout(timer); children.delete(child); };
    child.on('error', () => { cleanup(); reject(new Error('Could not start Python. Install Python 3.11, create backend/.venv and install python/requirements.txt.')); });
    child.on('close', code => {
      cleanup(); stdout += decoder.end();
      if (timedOut) return reject(new Error('Transcription timed out. Check model download/network and WORKER_TIMEOUT_MS.'));
      if (oversized) return reject(new Error('Transcription output exceeded the size limit.'));
      let payload; try { payload = JSON.parse(stdout.trim()); } catch {}
      if (code !== 0) return reject(new Error(payload?.error || 'Python transcription failed. See backend logs for dependency or model errors.'));
      if (!payload?.text?.trim()) return reject(new Error('No speech was detected in the lecture.'));
      resolve(payload);
    });
  });
}
