import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger.ts';

export interface ControllerBatteryInfo {
  name: string;
  capacity: number;
  status: string; // 'Charging' | 'Discharging' | 'Full' | 'Unknown'
}

export function getControllerBatteryInfo(): ControllerBatteryInfo[] {
  const list: ControllerBatteryInfo[] = [];
  const baseDir = '/sys/class/power_supply';

  if (!fs.existsSync(baseDir)) {
    return list;
  }

  try {
    const devices = fs.readdirSync(baseDir);

    for (const dev of devices) {
      // Exclude primary system batteries, chargers, and standard usb-c ports
      if (/^(BAT|AC|ADP|ucsi-source-psy)/i.test(dev)) {
        continue;
      }

      const devPath = path.join(baseDir, dev);
      
      // Verify it has 'type' file
      const typePath = path.join(devPath, 'type');
      if (!fs.existsSync(typePath)) continue;
      
      const type = fs.readFileSync(typePath, 'utf-8').trim().toLowerCase();
      // Controllers report as Battery type in the sysfs tree
      if (type !== 'battery') continue;

      // Read capacity percentage
      const capacityPath = path.join(devPath, 'capacity');
      if (!fs.existsSync(capacityPath)) continue;
      
      const capacity = parseInt(fs.readFileSync(capacityPath, 'utf-8').trim(), 10);

      // Read status
      const statusPath = path.join(devPath, 'status');
      const status = fs.existsSync(statusPath)
        ? fs.readFileSync(statusPath, 'utf-8').trim()
        : 'Unknown';

      // Read model name or default to directory name
      const modelPath = path.join(devPath, 'model_name');
      let name = fs.existsSync(modelPath)
        ? fs.readFileSync(modelPath, 'utf-8').trim()
        : dev;

      // Normalize device names for standard gamepads
      if (name.startsWith('sony_controller_battery_') || dev.includes('sony_controller')) {
        name = 'DualSense Wireless Controller';
      } else if (name.startsWith('input_battery_') || dev.includes('input_battery')) {
        name = 'Xbox Wireless Controller';
      } else {
        // Clean up snake_case names
        name = name
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }

      list.push({ name, capacity, status });
    }
  } catch (err: any) {
    log('main', `Failed to read gamepad power levels: ${err.message}`, 'WARN');
  }

  return list;
}
