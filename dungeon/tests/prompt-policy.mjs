import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridge = require('../server/index.js');

const savedDeepEffort = process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP;

try {
  delete process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP;
  const codexDeepPolicy = bridge.buildRuntimePolicy('codex', 'deep');
  assert.match(codexDeepPolicy, /Codex is the packaged default runtime/i);
  assert.match(codexDeepPolicy, /delegate in parallel/i);
  assert.match(codexDeepPolicy, /xhigh \/ maximum comparable effort/i);
  assert.match(codexDeepPolicy, /reasoning_effort=xhigh/i);
  assert.match(codexDeepPolicy, /Do not let deep\/xhigh runs fall back to default medium worker effort/i);

  process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP = 'extra-high';
  const codexExtraHighPolicy = bridge.buildRuntimePolicy('codex', 'deep');
  assert.match(codexExtraHighPolicy, /xhigh \/ maximum comparable effort/i);
  assert.match(codexExtraHighPolicy, /reasoning_effort=extra-high/i);

  const claudeDeepPolicy = bridge.buildRuntimePolicy('claude', 'deep');
  assert.match(claudeDeepPolicy, /Codex is the packaged default runtime/i);
  assert.match(claudeDeepPolicy, /using claude only because the user selected/i);
  assert.match(claudeDeepPolicy, /maximum comparable effort/i);
  assert.match(claudeDeepPolicy, /model is opus/i);

  const geminiBalancedPolicy = bridge.buildRuntimePolicy('gemini', 'balanced');
  assert.match(geminiBalancedPolicy, /using gemini only because the user selected/i);
  assert.match(geminiBalancedPolicy, /high comparable effort/i);

  console.log('Prompt policy tests passed');
} finally {
  if (savedDeepEffort === undefined) delete process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP;
  else process.env.SEO_DUNGEON_CODEX_EFFORT_DEEP = savedDeepEffort;
}
