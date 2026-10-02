import { spawn } from 'node:child_process';

const port = process.env.PORT || '3001';
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/config`, {signal: AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('Server returned ' + response.status);
} catch {
  console.error('Start the app first in another terminal: npm start');
  process.exit(1);
}
const agent = spawn(process.platform === 'win32' ? 'ngrok.exe' : 'ngrok', ['http', `http://127.0.0.1:${port}`, '--inspect=false'], {stdio: 'inherit'});
agent.on('error', () => {
  console.error('Install the official ngrok agent and configure your account locally. See TUNNEL.md. Never paste your auth token into chat.');
  process.exitCode = 1;
});
agent.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => agent.kill());
process.on('SIGTERM', () => agent.kill());
