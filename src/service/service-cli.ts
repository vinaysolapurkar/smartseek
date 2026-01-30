/**
 * Windows Service CLI
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runServiceCommand(command: string): Promise<void> {
  console.log(`\nSmartSeek - Windows Service Manager\n`);

  try {
    // Dynamic import to avoid issues on non-Windows
    const nodeWindows = await import('node-windows');
    const Service = nodeWindows.Service;

    const svc = new Service({
      name: 'SmartSeek',
      description: 'AI Assistant powered by DeepSeek',
      script: join(__dirname, '..', 'index.js'),
      nodeOptions: [],
      env: [
        {
          name: 'DEEPSEEK_API_KEY',
          value: process.env.DEEPSEEK_API_KEY || '',
        },
        {
          name: 'TELEGRAM_BOT_TOKEN',
          value: process.env.TELEGRAM_BOT_TOKEN || '',
        },
      ],
    });

    switch (command) {
      case 'install':
        console.log('Installing Windows Service...');
        svc.on('install', () => {
          console.log('✅ Service installed successfully!');
          console.log('\nTo start the service:');
          console.log('  smartseek service start');
          console.log('\nOr use Windows Services (services.msc)');
          process.exit(0);
        });
        svc.on('error', (err: Error) => {
          console.error('❌ Installation failed:', err.message);
          process.exit(1);
        });
        svc.install();
        break;

      case 'uninstall':
        console.log('Uninstalling Windows Service...');
        svc.on('uninstall', () => {
          console.log('✅ Service uninstalled successfully!');
          process.exit(0);
        });
        svc.on('error', (err: Error) => {
          console.error('❌ Uninstallation failed:', err.message);
          process.exit(1);
        });
        svc.uninstall();
        break;

      case 'start':
        console.log('Starting Windows Service...');
        svc.on('start', () => {
          console.log('✅ Service started!');
          console.log('\nHealth check: http://localhost:18790/health');
          process.exit(0);
        });
        svc.on('error', (err: Error) => {
          console.error('❌ Start failed:', err.message);
          process.exit(1);
        });
        svc.start();
        break;

      case 'stop':
        console.log('Stopping Windows Service...');
        svc.on('stop', () => {
          console.log('✅ Service stopped!');
          process.exit(0);
        });
        svc.on('error', (err: Error) => {
          console.error('❌ Stop failed:', err.message);
          process.exit(1);
        });
        svc.stop();
        break;

      case 'restart':
        console.log('Restarting Windows Service...');
        svc.on('stop', () => {
          console.log('Service stopped, starting...');
          svc.start();
        });
        svc.on('start', () => {
          console.log('✅ Service restarted!');
          process.exit(0);
        });
        svc.on('error', (err: Error) => {
          console.error('❌ Restart failed:', err.message);
          process.exit(1);
        });
        svc.stop();
        break;

      case 'status':
        console.log('Checking service status...');
        // Note: node-windows doesn't have a built-in status check
        // We'll check if the health endpoint responds
        try {
          const response = await fetch('http://localhost:18790/health', {
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const health = await response.json();
            console.log('✅ Service is RUNNING');
            console.log(`   Status: ${(health as any).status}`);
            console.log(`   Uptime: ${Math.round((health as any).uptime / 1000)}s`);
          } else {
            console.log('⚠️ Service responded but with error');
          }
        } catch {
          console.log('❌ Service is NOT RUNNING');
          console.log('   (or health endpoint is not accessible)');
        }
        break;

      case 'help':
      default:
        console.log(`
Usage: smartseek service <command>

Commands:
  install     Install as Windows Service
  uninstall   Remove the Windows Service
  start       Start the service
  stop        Stop the service
  restart     Restart the service
  status      Check if service is running

Notes:
  - Install/uninstall requires Administrator privileges
  - Run Command Prompt as Administrator for these commands
  - After install, the service will auto-start on boot

Examples:
  smartseek service install
  smartseek service start
  smartseek service status
`);
        break;
    }
  } catch (error) {
    if ((error as any).code === 'ERR_MODULE_NOT_FOUND') {
      console.error('❌ Windows Service support requires node-windows package.');
      console.error('   This feature only works on Windows.');
    } else {
      console.error('❌ Error:', String(error));
    }
    process.exit(1);
  }
}
