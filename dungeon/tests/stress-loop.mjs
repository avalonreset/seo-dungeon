import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const iterations = Number(process.env.SEO_DUNGEON_STRESS_ITERATIONS || 3);
const basePort = Number(process.env.SEO_DUNGEON_STRESS_BASE_PORT || (6200 + (process.pid % 800)));
const npmExecPath = process.env.npm_execpath;

function npmRun(script) {
  if (npmExecPath) return [process.execPath, [npmExecPath, 'run', script]];
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return [npmCommand, ['run', script]];
}

const suites = [
  {
    name: 'dialogue',
    command: npmRun('test:dialogue'),
    envFor(index) {
      return { SEO_DUNGEON_DIALOGUE_TEST_PORT: String(basePort + index * 10) };
    },
  },
  {
    name: 'live-bridge',
    command: npmRun('test:live-bridge'),
    envFor(index) {
      return { SEO_DUNGEON_LIVE_BRIDGE_TEST_PORT: String(basePort + index * 10 + 2) };
    },
  },
  {
    name: 'ux',
    command: npmRun('test:ux'),
    envFor(index) {
      return {
        SEO_DUNGEON_UX_BRIDGE_PORT: String(basePort + index * 10 + 4),
        SEO_DUNGEON_UX_VITE_PORT: String(basePort + index * 10 + 5),
      };
    },
  },
];

function runCommand(label, command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        const error = new Error(`${label} exited with code ${code}`);
        error.output = output;
        reject(error);
      }
    });
  });
}

assert(Number.isInteger(iterations) && iterations > 0, 'SEO_DUNGEON_STRESS_ITERATIONS must be a positive integer');

const started = Date.now();
for (let i = 0; i < iterations; i++) {
  const iteration = i + 1;
  console.log(`\n=== SEO Dungeon stress iteration ${iteration}/${iterations} ===`);
  for (const suite of suites) {
    const [command, args] = suite.command;
    const label = `${suite.name} iteration ${iteration}`;
    console.log(`\n--- ${label} ---`);
    await runCommand(label, command, args, suite.envFor(i));
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nSEO Dungeon stress loop passed: ${iterations} iteration(s), ${suites.length} suite(s), ${seconds}s`);
