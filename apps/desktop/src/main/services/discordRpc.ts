import { Client } from 'discord-rpc';
import { log } from './logger.ts';

// Generic Client ID for Nexus Play (can be registered in Discord Developer Portal)
const clientId = '123456789012345678'; 
let rpc: Client | null = null;
let isConnected = false;

export function initDiscordRpc() {
  try {
    rpc = new Client({ transport: 'ipc' });
    
    rpc.on('ready', () => {
      isConnected = true;
      log('main', 'Connected to Discord Rich Presence', 'INFO');
      setIdlePresence();
    });

    rpc.login({ clientId }).catch(error => {
      log('main', `Failed to init: ${error.message}`, 'WARN');
    });
  } catch (error: any) {
    log('main', `Failed to init: ${error.message}`, 'WARN');
  }
}

export function setIdlePresence() {
  if (!rpc || !isConnected) return;
  rpc.setActivity({
    details: 'Browsing library',
    state: 'Nexus Play',
    startTimestamp: new Date(),
    largeImageKey: 'nexus_logo', // Placeholder image key
    largeImageText: 'Nexus Play',
    instance: false,
  }).catch(console.error);
}

export function setPlayingPresence(gameTitle: string) {
  if (!rpc || !isConnected) return;
  rpc.setActivity({
    details: `Playing ${gameTitle}`,
    state: 'Nexus Play',
    startTimestamp: new Date(),
    largeImageKey: 'nexus_logo',
    largeImageText: 'Nexus Play',
    instance: false,
  }).catch(console.error);
}
