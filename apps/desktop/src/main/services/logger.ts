import fs from 'node:fs';
import path from 'node:path';

let logDir: string;
try {
  // Use ~/.local/share/NexusPlay/logs on Linux
  const home = process.env.HOME || '/tmp';
  logDir = path.join(home, '.local', 'share', 'NexusPlay', 'logs');
} catch (e) {
  logDir = path.join('/tmp', 'NexusPlay', 'logs');
}

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export function log(file: 'main' | 'scanner' | 'launcher' | 'metadata', message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
  const timestamp = new Date().toISOString();
  
  // Redact potential API keys (e.g., SteamGridDB API key is 32-char hex string)
  let cleanMsg = message.replace(/\b[a-f0-9]{32}\b/gi, '********REDACTED********');
  
  const logLine = `[${timestamp}] [${level}] ${cleanMsg}\n`;
  const filePath = path.join(logDir, `${file}.log`);
  
  try {
    fs.appendFileSync(filePath, logLine);
  } catch {
    // Logging is best-effort; a detached AppImage may not have a usable terminal.
  }
}

export function readLogs(file: 'main' | 'scanner' | 'launcher' | 'metadata', linesCount = 150): string {
  const filePath = path.join(logDir, `${file}.log`);
  if (!fs.existsSync(filePath)) return `Log file ${file}.log not found.`;
  
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const lines = data.split('\n');
    return lines.slice(-linesCount).join('\n');
  } catch (err: any) {
    return `Error reading log file: ${err.message}`;
  }
}
