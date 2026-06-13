import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridge = require('../server/index.js');

const envKeys = [
  'PATH',
  'Path',
  'path',
  'SEO_DUNGEON_CODEX_CLI',
  'SEO_DUNGEON_CODEX_ARGS',
  'SEO_DUNGEON_CLAUDE_ARGS',
  'SEO_DUNGEON_GEMINI_ARGS',
  'SEO_DUNGEON_CODEX_EFFORT_DEEP',
  'SEO_DUNGEON_CODEX_EFFORT_BALANCED',
  'SEO_DUNGEON_CODEX_EFFORT_FAST',
  'SEO_DUNGEON_CLAUDE_MODEL',
  'SEO_DUNGEON_CLAUDE_MODEL_DEEP',
  'SEO_DUNGEON_CLAUDE_MODEL_BALANCED',
  'SEO_DUNGEON_CLAUDE_MODEL_FAST',
  'SEO_DUNGEON_GEMINI_MODEL',
  'SEO_DUNGEON_GEMINI_MODEL_DEEP',
  'SEO_DUNGEON_GEMINI_MODEL_BALANCED',
  'SEO_DUNGEON_GEMINI_MODEL_FAST'
];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dungeon-cli-'));

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  const fakeBase = path.join(tmp, 'fakeagent');
  const fakeCmd = `${fakeBase}.cmd`;
  const fakePs1 = `${fakeBase}.ps1`;
  fs.writeFileSync(fakeBase, 'extensionless shim\n', 'utf8');
  fs.writeFileSync(fakeCmd, '@echo off\r\necho fakeagent\r\n', 'utf8');
  fs.writeFileSync(fakePs1, 'Write-Output fakeagent\r\n', 'utf8');

  const testPath = `${tmp}${path.delimiter}${savedEnv.PATH || savedEnv.Path || savedEnv.path || ''}`;
  process.env.PATH = testPath;
  process.env.Path = testPath;
  process.env.path = testPath;

  const fakeLaunch = bridge.resolveCliLaunch('fakeagent');
  if (process.platform === 'win32') {
    assert.equal(fakeLaunch.display.toLowerCase(), fakePs1.toLowerCase());
    assert.match(fakeLaunch.command, /powershell\.exe$/i);
    assert.equal(fakeLaunch.shell, false);
    assert.deepEqual(fakeLaunch.argsPrefix.slice(-2), ['-File', fakePs1]);
  } else {
    assert.equal(fakeLaunch.command, 'fakeagent');
    assert.equal(fakeLaunch.shell, false);
  }

  const ps1Launch = bridge.resolveCliLaunch(fakePs1);
  if (process.platform === 'win32') {
    assert.match(ps1Launch.command, /powershell\.exe$/i);
    assert.equal(ps1Launch.display.toLowerCase(), fakePs1.toLowerCase());
    assert.deepEqual(ps1Launch.argsPrefix.slice(-2), ['-File', fakePs1]);
    assert.equal(ps1Launch.shell, false);
  } else {
    assert.equal(ps1Launch.command, fakePs1);
    assert.equal(ps1Launch.shell, false);
  }

  const cmdLaunch = bridge.resolveCliLaunch(fakeCmd);
  if (process.platform === 'win32') {
    assert.equal(cmdLaunch.shell, true);
    assert.equal(cmdLaunch.display.toLowerCase(), fakeCmd.toLowerCase());
  }

  process.env.SEO_DUNGEON_CODEX_CLI = 'fakeagent';
  process.env.SEO_DUNGEON_CODEX_ARGS = '--flag "two words"';
  assert.deepEqual(bridge.resolveCodexCli(), {
    execPath: 'fakeagent',
    args: ['--flag', 'two words']
  });

  for (const key of envKeys.filter((key) => key.startsWith('SEO_DUNGEON_') && key.includes('_MODEL_'))) {
    delete process.env[key];
  }
  delete process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP;
  delete process.env.SEO_DUNGEON_CODEX_EFFORT_BALANCED;
  delete process.env.SEO_DUNGEON_CODEX_EFFORT_FAST;
  assert.equal(bridge.getCodexProfileConfig('deep').effort, 'xhigh');
  assert.equal(bridge.getCodexProfileConfig('balanced').effort, 'high');
  assert.equal(bridge.getCodexProfileConfig('fast').effort, 'medium');
  assert.equal(bridge.getTextCliProfileConfig('claude', 'deep').model, 'opus');
  assert.equal(bridge.getTextCliProfileConfig('claude', 'balanced').model, 'sonnet');
  assert.equal(bridge.getTextCliProfileConfig('claude', 'fast').model, 'haiku');
  assert.equal(bridge.getTextCliProfileConfig('gemini', 'deep').model, 'pro');
  assert.equal(bridge.getTextCliProfileConfig('gemini', 'balanced').model, 'flash');
  assert.equal(bridge.getTextCliProfileConfig('gemini', 'fast').model, 'flash-lite');

  const geminiCli = bridge.resolveTextCli('gemini');
  assert.equal(geminiCli.execPath, 'gemini');
  assert(geminiCli.args.includes('{{prompt}}'), 'Gemini args must include a prompt placeholder');

  assert.deepEqual(
    bridge.insertPromptArg(['--prompt', '{{prompt}}', '--model', 'flash'], 'hello'),
    ['--prompt', 'hello', '--model', 'flash']
  );

  console.log('CLI launcher tests passed');
} finally {
  restoreEnv();
  fs.rmSync(tmp, { recursive: true, force: true });
}
