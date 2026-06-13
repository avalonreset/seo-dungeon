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
  const fakeJs = path.join(tmp, 'node_modules', 'fakeagent', 'bin', 'fakeagent.js');
  fs.writeFileSync(fakeBase, 'extensionless shim\n', 'utf8');
  fs.writeFileSync(fakeCmd, '@echo off\r\necho fakeagent\r\n', 'utf8');
  fs.mkdirSync(path.dirname(fakeJs), { recursive: true });
  fs.writeFileSync(fakeJs, 'console.log("fakeagent")\n', 'utf8');
  fs.writeFileSync(fakePs1, `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
$exe=".exe"
if (Test-Path "$basedir/node$exe") {
  & "$basedir/node$exe" --no-warnings=DEP0040 "$basedir/node_modules/fakeagent/bin/fakeagent.js" $args
} else {
  & "node$exe" --no-warnings=DEP0040 "$basedir/node_modules/fakeagent/bin/fakeagent.js" $args
}
exit $LASTEXITCODE
`, 'utf8');

  const testPath = `${tmp}${path.delimiter}${savedEnv.PATH || savedEnv.Path || savedEnv.path || ''}`;
  process.env.PATH = testPath;
  process.env.Path = testPath;
  process.env.path = testPath;

  const fakeLaunch = bridge.resolveCliLaunch('fakeagent');
  if (process.platform === 'win32') {
    assert.equal(fakeLaunch.command, 'node.exe');
    assert.equal(fakeLaunch.shell, false);
    assert.deepEqual(fakeLaunch.argsPrefix, ['--no-warnings=DEP0040', fakeJs]);
    assert.match(fakeLaunch.display, /fakeagent\.ps1 -> .*fakeagent\.js$/i);
  } else {
    assert.equal(fakeLaunch.command, 'fakeagent');
    assert.equal(fakeLaunch.shell, false);
  }

  const ps1Launch = bridge.resolveCliLaunch(fakePs1);
  if (process.platform === 'win32') {
    assert.equal(ps1Launch.command, 'node.exe');
    assert.match(ps1Launch.display, /fakeagent\.ps1 -> .*fakeagent\.js$/i);
    assert.deepEqual(ps1Launch.argsPrefix, ['--no-warnings=DEP0040', fakeJs]);
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
  assert.deepEqual(
    bridge.insertPromptArg(['exec', '--json'], 'multi word prompt stays together'),
    ['exec', '--json', 'multi word prompt stays together']
  );

  console.log('CLI launcher tests passed');
} finally {
  restoreEnv();
  fs.rmSync(tmp, { recursive: true, force: true });
}
