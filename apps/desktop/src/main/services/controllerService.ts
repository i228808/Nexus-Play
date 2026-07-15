import fs from 'node:fs';
import path from 'node:path';

interface DetectedController {
  vendor: string;
  name: string;
  type: 'ps' | 'xbox' | 'unknown';
  isVirtual: boolean;
  connection: 'wired' | 'bluetooth' | 'unknown';
}

/**
 * Detect physical controllers from /proc/bus/input/devices.
 * Filters out virtual/userspace drivers (e.g. Steam's xpad emulation)
 * to get the real hardware controller identity.
 */
function detectControllers(): DetectedController[] {
  if (!fs.existsSync('/proc/bus/input/devices')) return [];

  const raw = fs.readFileSync('/proc/bus/input/devices', 'utf-8');
  const blocks = raw.split('\n\n').filter(b => b.trim());

  const controllers: DetectedController[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    let vendor = '';
    let name = '';
    let bus = '';
    let phys = '';
    let sysfs = '';
    let handlers = '';

    for (const line of lines) {
      if (line.startsWith('I:')) {
        const vm = line.match(/Vendor=([0-9a-fA-F]+)/);
        if (vm) vendor = vm[1].toLowerCase();
        const bm = line.match(/Bus=([0-9a-fA-F]+)/);
        if (bm) bus = bm[1].toLowerCase();
      } else if (line.startsWith('N:')) {
        const nm = line.match(/Name="([^"]+)"/);
        if (nm) name = nm[1];
      } else if (line.startsWith('P:')) {
        phys = line.replace('P: Phys=', '').trim();
      } else if (line.startsWith('S:')) {
        sysfs = line.replace('S: Sysfs=', '').trim();
      } else if (line.startsWith('H:')) {
        handlers = line.replace('H: Handlers=', '').trim();
      }
    }

    // Only consider devices that register as joystick (js*) handlers
    if (!handlers.includes('js')) continue;

    const lowerName = name.toLowerCase();

    let type: 'ps' | 'xbox' | 'unknown' = 'unknown';

    // Sony: vendor 054c
    if (vendor === '054c' || lowerName.includes('dualsense') || lowerName.includes('dualshock') || lowerName.includes('playstation')) {
      type = 'ps';
    }
    // Microsoft: vendor 045e  
    else if (vendor === '045e' || lowerName.includes('xbox') || lowerName.includes('x-box')) {
      type = 'xbox';
    }

    // Bluetooth DualSense devices are legitimately exposed through uhid with no
    // `Phys` value. Keep their native identity while filtering generic Steam Input pads.
    const isVirtual =
      lowerName.includes('userspace driver') ||
      lowerName.includes('virtual') ||
      (type !== 'ps' && (sysfs.includes('/virtual/') || phys === '' || phys === 'virtual'));

    const connection = bus === '0003'
      ? 'wired'
      : bus === '0005'
        ? 'bluetooth'
        : 'unknown';

    if (type !== 'unknown') {
      controllers.push({ vendor, name, type, isVirtual, connection });
    }
  }

  return controllers;
}

export async function configureControllers(winePrefix: string, opts: { forceXInput?: boolean; hybridXInput?: boolean } = {}) {
  try {
    const controllers = detectControllers();

    // Log all detected controllers for debugging
    for (const c of controllers) {
      console.log(`[ControllerService] Found: "${c.name}" type=${c.type} connection=${c.connection} virtual=${c.isVirtual}`);
    }

    const hasWiredPSController = controllers.some(c => c.type === 'ps' && !c.isVirtual && c.connection === 'wired');
    const hasNonNativePSController = controllers.some(c => c.type === 'ps' && !c.isVirtual && c.connection !== 'wired');
    const hasXboxController = controllers.some(c => c.type === 'xbox' && !c.isVirtual);

    const env: Record<string, string> = {};

    if (opts.hybridXInput && (hasWiredPSController || hasNonNativePSController)) {
      console.log('[ControllerService] DualSense detected → enabling native HID plus SDL/XInput rumble bridge.');
      env.PROTON_ENABLE_HIDRAW = "1";
      env.PROTON_DISABLE_HIDRAW = "0";
      env.PROTON_NO_STEAMINPUT = "1";
      env.PROTON_USE_XALIA = "0";
      env.SDL_JOYSTICK_HIDAPI = "1";
      env.SDL_JOYSTICK_HIDAPI_PS5 = "1";
      env.SDL_JOYSTICK_HIDAPI_PS4 = "1";
      env.SDL_GAMECONTROLLER_USE_BUTTON_LABELS = "0";
      env.SDL_GAMECONTROLLER_IGNORE_DEVICES_EXCEPT = "0x054c/0x0ce6";
      env.SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD = "0";
      env.NEXUS_CONTROLLER_MODE = "dualsense-hybrid";
      if (winePrefix) {
        patchWinebusRegistry(winePrefix, { enableSDL: true, disableHidraw: false });
        patchWineUserRegistry(winePrefix, { hideWineExports: true });
      }

    } else if (opts.forceXInput && (hasWiredPSController || hasNonNativePSController)) {
      console.log('[ControllerService] DualSense detected → forcing SDL/XInput fallback for this game.');
      env.PROTON_DISABLE_HIDRAW = "1";
      env.PROTON_USE_SDL = "1";
      env.PROTON_PREFER_SDL = "1";
      env.PROTON_NO_STEAMINPUT = "1";
      env.SDL_JOYSTICK_HIDAPI = "1";
      env.SDL_JOYSTICK_HIDAPI_PS5 = "1";
      env.SDL_JOYSTICK_HIDAPI_PS4 = "1";
      env.SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD = "0";
      if (winePrefix) patchWinebusRegistry(winePrefix, { enableSDL: true, disableHidraw: true });

    } else if ((hasWiredPSController || hasNonNativePSController) && !hasXboxController) {
      console.log(`[ControllerService] ${hasWiredPSController ? 'Physical' : 'Bluetooth'} DualSense detected → enabling native HID passthrough.`);

      // Environment variables for Proton — this is the primary mechanism
      env.PROTON_ENABLE_HIDRAW = "1";
      env.PROTON_DISABLE_HIDRAW = "0";
      env.PROTON_NO_STEAMINPUT = "1";
      env.PROTON_USE_XALIA = "0";
      env.SDL_JOYSTICK_HIDAPI = "1";
      env.SDL_JOYSTICK_HIDAPI_PS5 = "1";
      env.SDL_JOYSTICK_HIDAPI_PS4 = "1";
      env.SDL_GAMECONTROLLER_USE_BUTTON_LABELS = "0";
      env.SDL_GAMECONTROLLER_IGNORE_DEVICES_EXCEPT = "0x054c/0x0ce6";
      env.SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD = "0";
      // GoW's native scePad runtime is installed in ProgramData by its MSI.
      // Make that directory discoverable to the Windows DLL loader in Proton.
      env.WINEPATH = 'C:\\ProgramData\\Sony Interactive Entertainment Inc\\PSPC_SDK\\S22\\4.00.00.15';

      // Try to patch winebus registry in the prefix.
      // SDL here is Winebus' native device backend, not Steam Input translation.
      if (winePrefix) {
        patchWinebusRegistry(winePrefix, { enableSDL: false, disableHidraw: false });
        patchWineUserRegistry(winePrefix, { hideWineExports: true });
      }

    } else if ((hasWiredPSController || hasNonNativePSController) && hasXboxController) {
      // Mixed: let SDL handle it (XInput default)
      console.log('[ControllerService] Mixed controllers detected → defaulting to SDL/XInput.');
      if (winePrefix) patchWinebusRegistry(winePrefix, { enableSDL: true, disableHidraw: true });

    } else if (hasXboxController) {
      console.log('[ControllerService] Physical Xbox controller detected → using standard SDL/XInput.');
      if (winePrefix) patchWinebusRegistry(winePrefix, { enableSDL: true, disableHidraw: true });

    } else {
      console.log('[ControllerService] No recognized controllers detected.');
    }

    return env;
  } catch (err) {
    console.error('[ControllerService] Error configuring controllers:', err);
    return {};
  }
}

/**
 * Patch the winebus registry keys in the Wine prefix.
 * Handles both Proton-style prefixes (pfx/ subdirectory) and plain Wine prefixes.
 */
function patchWinebusRegistry(winePrefix: string, opts: { enableSDL: boolean; disableHidraw: boolean }) {
  const enableSDL = opts.enableSDL ? '00000001' : '00000000';
  const disableHidraw = opts.disableHidraw ? '00000001' : '00000000';

  // Proton uses pfx/ subdirectory, plain Wine uses the prefix directly
  const candidates = [
    path.join(winePrefix, 'pfx', 'system.reg'),  // Proton-style
    path.join(winePrefix, 'system.reg'),           // Plain Wine
  ];

  for (const regPath of candidates) {
    if (!fs.existsSync(regPath)) continue;

    try {
      let content = fs.readFileSync(regPath, 'utf-8');

      const sdlKey = `"Enable SDL"=dword:${enableSDL}`;
      const hidrawKey = `"DisableHidraw"=dword:${disableHidraw}`;

      // Proton prefixes normally use ControlSet001; some use CurrentControlSet.
      let patched = false;
      content = content.replace(
        /(\[System\\\\(?:CurrentControlSet|ControlSet\d+)\\\\Services\\\\winebus\][^\n]*\n)([\s\S]*?)(?=\n\[|$)/g,
        (_section, header, body) => {
          patched = true;
          let next = body
            .replace(/"Enable SDL"=dword:[0-9a-fA-F]+/, sdlKey)
            .replace(/"DisableHidraw"=dword:[0-9a-fA-F]+/, hidrawKey);
          if (!body.includes('"Enable SDL"')) next += `${next.endsWith('\n') ? '' : '\n'}${sdlKey}\n`;
          if (!body.includes('"DisableHidraw"')) next += `${next.endsWith('\n') ? '' : '\n'}${hidrawKey}\n`;
          return `${header}${next}`;
        },
      );

      if (!patched) {
        content += `\n\n[System\\\\CurrentControlSet\\\\Services\\\\winebus]\n${sdlKey}\n${hidrawKey}\n`;
      }

      fs.writeFileSync(regPath, content);
      console.log(`[ControllerService] Patched winebus registry at: ${regPath}`);
      return; // Only patch the first found
    } catch (e) {
      console.error(`[ControllerService] Failed to patch ${regPath}:`, e);
    }
  }

  console.log('[ControllerService] No system.reg found in prefix — env vars will be the primary mechanism.');
}

function patchWineUserRegistry(winePrefix: string, opts: { hideWineExports: boolean }) {
  const regPath = fs.existsSync(path.join(winePrefix, 'pfx', 'user.reg'))
    ? path.join(winePrefix, 'pfx', 'user.reg')
    : path.join(winePrefix, 'user.reg');

  if (!fs.existsSync(regPath)) return;

  try {
    let content = fs.readFileSync(regPath, 'utf-8');
    const key = `"HideWineExports"=dword:${opts.hideWineExports ? '00000001' : '00000000'}`;
    let patched = false;

    content = content.replace(
      /(\[Software\\\\Wine\][^\n]*\n)([\s\S]*?)(?=\n\[|$)/,
      (_section, header, body) => {
        patched = true;
        if (body.includes('"HideWineExports"')) {
          return `${header}${body.replace(/"HideWineExports"=dword:[0-9a-fA-F]+/, key)}`;
        }
        return `${header}${body}${body.endsWith('\n') ? '' : '\n'}${key}\n`;
      },
    );

    if (!patched) content += `\n\n[Software\\\\Wine]\n${key}\n`;

    fs.writeFileSync(regPath, content);
    console.log(`[ControllerService] Patched Wine user registry at: ${regPath}`);
  } catch (e) {
    console.error(`[ControllerService] Failed to patch ${regPath}:`, e);
  }
}
