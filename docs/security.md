# Security Model & Guidelines

Because Nexus Play runs executable games and commands, a strict security boundary is maintained between the web renderer and the Node.js main process.

## 1. Process Separation & Sandboxing
The Electron window configuration prevents direct system vulnerabilities:
- `contextIsolation: true` separates the preload script context from the web page context.
- `nodeIntegration: false` prevents the React code from calling Node.js APIs directly.
- `sandbox: true` runs the renderer in a restricted process sandbox.

## 2. Command Validation & Execution
- Raw shell execution is restricted.
- Manual launch commands entered by the user are flagged in the UI as custom.
- Scanned commands from Steam and Legendary are built strictly using structural parameters (`appid` or `app_name`) rather than executing arbitrary strings found in configurations.

## 3. Directory Traversal Protection
The custom `nexus-media://` protocol handler serving cached game images checks that all paths are within the designated assets directory:
```typescript
const relative = path.relative(assetDir, absolutePath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  return new Response('Access Denied', { status: 403 });
}
```
This blocks any malicious attempts to load arbitrary system files (like `/etc/passwd`) through the image renderer.

## 4. Credential & Log Redaction
- Nexus Play does not store or process GOG, Steam, or Epic Games passwords. Authentication is handled entirely by the respective official Clients (Steam and Legendary).
- Log outputs automatically strip 32-character hexadecimal patterns, protecting SteamGridDB API keys from showing up in diagnostics output or copy-pasted diagnostic logs.
