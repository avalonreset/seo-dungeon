const { WebSocketServer } = require('ws');
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const server = http.createServer();

const PORT = 3001;

// Project root: server/ -> dungeon/ -> seo-dungeon/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Evidence directory for failed audits. When _tryParseAudit gives up
// and we fall back to the synthetic "Parse Error" demon, we write the
// full raw agent output here so the failure can be inspected after
// the fact instead of lost. One file per failure, timestamped.
const LOG_DIR = path.resolve(__dirname, '..', '.logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

function logFailedAudit(domain, raw, note) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeDomain = (domain || 'unknown').replace(/[^a-z0-9.-]/gi, '_');
    const file = path.join(LOG_DIR, `failed-audit-${safeDomain}-${stamp}.txt`);
    const text = typeof raw === 'string' ? raw : (raw && raw.raw ? raw.raw : JSON.stringify(raw, null, 2));
    fs.writeFileSync(file, `=== ${note || 'failed audit'} ===\ndomain: ${domain}\nwhen: ${new Date().toISOString()}\n\n----- RAW AGENT OUTPUT -----\n${text}\n`);
    console.log(`  [evidence] wrote failed audit to ${path.relative(PROJECT_ROOT, file)}`);
  } catch (e) {
    console.error('  [evidence] could not write failure log:', e.message);
  }
}

// ── Security: Allowed message types and rate limits ──
const ALLOWED_TYPES = ['audit', 'fix', 'commit', 'narrate', 'chat', 'cancel'];
const MAX_CONCURRENT_PROCESSES = 5;
const MAX_MESSAGES_PER_MINUTE = 30;

// ── Security: Origin validation ──
const EXTRA_ALLOWED_ORIGINS = (process.env.SEO_DUNGEON_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...EXTRA_ALLOWED_ORIGINS
];

const wss = new WebSocketServer({
  server,
  perMessageDeflate: false,
  verifyClient: ({ origin, req }) => {
    // Allow connections with no origin (non-browser clients like dev tools)
    if (!origin) return true;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    console.warn(`Rejected WebSocket connection from origin: ${origin}`);
    return false;
  }
});

// Track active child processes so they can be cancelled
const activeProcesses = new Map(); // id -> ChildProcess

/**
 * Validate and resolve projectPath to prevent path traversal.
 * Returns the resolved path or null if invalid.
 */
function validateProjectPath(projectPath) {
  if (!projectPath) return PROJECT_ROOT;
  try {
    const resolved = path.resolve(projectPath);
    // Block obvious system directories
    const blocked = ['/etc', '/usr', '/bin', '/sbin', '/var', '/root',
      'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];
    for (const dir of blocked) {
      if (resolved.toLowerCase().startsWith(dir.toLowerCase())) return null;
    }
    // Must exist and be a directory
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Sanitize domain input for audit commands.
 */
function sanitizeDomain(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, 253);
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(trimmed)) return trimmed;
  // Allow URLs
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return url.hostname;
  } catch {
    return null;
  }
}

function normalizeRuntime(runtime) {
  const key = String(runtime || process.env.SEO_DUNGEON_RUNTIME || 'codex').trim().toLowerCase();
  return ['codex', 'claude', 'gemini'].includes(key) ? key : 'codex';
}

function resolveAgentProvider(runtime) {
  return normalizeRuntime(runtime);
}

function resolveCodexCli() {
  return {
    execPath: process.env.SEO_DUNGEON_CODEX_CLI || 'codex',
    args: splitArgs(process.env.SEO_DUNGEON_CODEX_ARGS || '')
  };
}

function splitArgs(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const matches = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map(part => {
    const quote = part[0];
    if ((quote === '"' || quote === "'") && part.endsWith(quote)) return part.slice(1, -1);
    return part;
  });
}

/**
 * Build a minimal environment for child processes.
 */
function safeEnv() {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  if (process.env.APPDATA) env.APPDATA = process.env.APPDATA;
  if (process.env.USERPROFILE) env.USERPROFILE = process.env.USERPROFILE;
  if (process.env.LOCALAPPDATA) env.LOCALAPPDATA = process.env.LOCALAPPDATA;
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
  if (process.env.GEMINI_API_KEY) env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (process.env.GEMINI_CONFIG_DIR) env.GEMINI_CONFIG_DIR = process.env.GEMINI_CONFIG_DIR;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (process.env.XDG_CONFIG_HOME) env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  if (process.env.TEMP) env.TEMP = process.env.TEMP;
  if (process.env.TMP) env.TMP = process.env.TMP;
  return env;
}

// Catch crashes so server stays alive
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stays alive):', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server stays alive):', err.message || err);
});

console.log('SEO Dungeon - Bridge Server');
console.log('─'.repeat(40));

wss.on('connection', (ws) => {
  console.log('Game client connected');

  // Per-connection rate limiting
  const messageTimestamps = [];

  // Keepalive ping every 15s so the connection doesn't drop during long audits
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 15000);

  const safeSend = (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  };

  ws.on('message', async (raw) => {
    // Rate limiting: max N messages per minute
    const now = Date.now();
    messageTimestamps.push(now);
    while (messageTimestamps.length > 0 && messageTimestamps[0] < now - 60000) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length > MAX_MESSAGES_PER_MINUTE) {
      safeSend(JSON.stringify({ id: 0, type: 'error', message: 'Rate limit exceeded. Max 30 messages per minute.' }));
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      console.error('Invalid JSON from client:', e.message);
      safeSend(JSON.stringify({ id: 0, type: 'error', message: 'Invalid message format' }));
      return;
    }
    const { id, command, type, projectPath, issue, userMessage, model, profile, runtime } = msg;
    const agentOptions = {
      runtime: normalizeRuntime(runtime),
      profile: normalizeProfile(profile || model)
    };

    // Validate message type against allowlist
    if (type && !ALLOWED_TYPES.includes(type)) {
      console.warn(`Rejected unknown message type: ${type}`);
      safeSend(JSON.stringify({ id, type: 'error', message: `Unknown command type: ${type}` }));
      return;
    }

    // Validate and resolve projectPath
    const validatedPath = validateProjectPath(projectPath);
    if (projectPath && !validatedPath) {
      console.warn(`Rejected invalid projectPath: ${projectPath}`);
      safeSend(JSON.stringify({ id, type: 'error', message: 'Invalid project path' }));
      return;
    }

    // Use validated project path for fixes, project root for audits
    const fixCwd = validatedPath;

    console.log(`Command #${id} [${type}]: ${command || '(no command)'}`);
    if (type !== 'cancel') console.log(`  Runtime: ${agentOptions.runtime}, profile: ${agentOptions.profile}`);
    if (validatedPath !== PROJECT_ROOT) console.log(`  Project: ${validatedPath}`);

    // Cancel - kill the child process for a given request
    if (type === 'cancel') {
      const proc = activeProcesses.get(id);
      if (proc) {
        console.log(`Cancelling process #${id}`);
        proc.kill('SIGTERM');
        activeProcesses.delete(id);
      }
      safeSend(JSON.stringify({ id, type: 'error', message: 'Cancelled by user' }));
      return;
    }

    try {
      // Enforce max concurrent processes
      if (activeProcesses.size >= MAX_CONCURRENT_PROCESSES) {
        safeSend(JSON.stringify({ id, type: 'error', message: `Too many concurrent operations (max ${MAX_CONCURRENT_PROCESSES})` }));
        return;
      }

      if (type === 'audit') {
        const domain = sanitizeDomain(command);
        if (!domain) {
          safeSend(JSON.stringify({ id, type: 'error', message: 'Invalid domain' }));
          return;
        }
        const result = await runAudit(domain, (chunk) => {
          safeSend(JSON.stringify({ id, type: 'stream', content: chunk }));
        }, undefined, id, agentOptions);
        activeProcesses.delete(id);
        safeSend(JSON.stringify({ id, type: 'result', data: result }));
        console.log(`Audit done: ${result.issues.length} issues, score ${result.score}`);

      } else if (type === 'fix') {
        const result = await runFix(issue, userMessage, fixCwd, (chunk) => {
          safeSend(JSON.stringify({ id, type: 'stream', content: chunk }));
        }, id, agentOptions);
        activeProcesses.delete(id);
        safeSend(JSON.stringify({ id, type: 'result', data: result }));
        console.log(`Fix done: ${(issue && issue.title) || command}`);

      } else if (type === 'commit') {
        // Sanitize commit message: limit length, strip control characters
        const safeMessage = (command || 'SEO fix').replace(/[^\x20-\x7E\n]/g, '').slice(0, 500);
        const result = await runCommit(safeMessage, fixCwd, (chunk) => {
          safeSend(JSON.stringify({ id, type: 'stream', content: chunk }));
        }, id, agentOptions);
        activeProcesses.delete(id);
        safeSend(JSON.stringify({ id, type: 'result', data: result }));
        console.log(`Commit done in ${fixCwd}`);

      } else if (type === 'narrate') {
        const result = await runAgent(command, (chunk) => {
          safeSend(JSON.stringify({ id, type: 'stream', content: chunk }));
        }, undefined, id, agentOptions);
        activeProcesses.delete(id);
        safeSend(JSON.stringify({ id, type: 'result', data: result }));
        console.log(`Narration done`);

      } else if (type === 'chat') {
        // Neutral pass-through - used outside of battle (Hall, Lodge,
        // between fights). Zero framing, zero demon context. Codex sees
        // exactly what the user typed and runs in their project directory.
        const result = await runAgent(command, (chunk) => {
          safeSend(JSON.stringify({ id, type: 'stream', content: chunk }));
        }, fixCwd, id, agentOptions);
        activeProcesses.delete(id);
        safeSend(JSON.stringify({ id, type: 'result', data: result }));
        console.log(`Chat done`);
      }
    } catch (err) {
      console.error(`Error on #${id}:`, err.message);
      safeSend(JSON.stringify({ id, type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    // Kill any orphaned Codex processes for this connection.
    for (const [procId, proc] of activeProcesses.entries()) {
      try { proc.kill('SIGTERM'); } catch (e) {}
      activeProcesses.delete(procId);
    }
    console.log('Game client disconnected');
  });
});

/**
 * Check if a directory is a git repository.
 */
function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure fixes run on a dedicated branch, not main.
 * Creates or switches to a date-stamped branch: seo-dungeon-fixes-YYYY-MM-DD
 * Returns the branch name on success, or null if branching was skipped.
 */
function ensureFixBranch(projectCwd) {
  try {
    if (!isGitRepo(projectCwd)) {
      console.log('  [branch] Not a git repo - skipping branch protection');
      return null;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const branchName = `seo-dungeon-fixes-${today}`;

    // Check current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectCwd,
      stdio: 'pipe'
    }).toString().trim();

    if (currentBranch === branchName) {
      console.log(`  [branch] Already on ${branchName}`);
      return branchName;
    }

    // Check if the branch already exists locally
    try {
      execSync(`git rev-parse --verify ${branchName}`, {
        cwd: projectCwd,
        stdio: 'pipe'
      });
      // Branch exists - switch to it
      execSync(`git checkout ${branchName}`, {
        cwd: projectCwd,
        stdio: 'pipe'
      });
      console.log(`  [branch] Switched to existing ${branchName}`);
    } catch {
      // Branch doesn't exist - create it
      execSync(`git checkout -b ${branchName}`, {
        cwd: projectCwd,
        stdio: 'pipe'
      });
      console.log(`  [branch] Created and switched to ${branchName}`);
    }

    return branchName;
  } catch (err) {
    console.warn(`  [branch] Warning: could not set up fix branch - ${err.message}`);
    return null;
  }
}

/**
 * Run an SEO audit via Codex CLI.
 */
async function runAudit(domain, onStream, cwd, requestId, agentOptions) {
  const prompt = `Run /seo audit on ${domain}. This will trigger the full SEO audit skill which spawns multiple subagents for technical SEO, content quality, schema markup, performance, crawlability, images, and more.

After the audit completes, CONSOLIDATE the findings into actionable groups. Do NOT list every granular finding as a separate issue. Instead, group related problems that would be fixed together into a single issue. For example, all mobile responsiveness problems (touch targets, font sizes, overflow) become one issue. All missing meta tags become one issue. Aim for 8-15 total issues maximum - each one should represent a meaningful, distinct area of work.

ORDER THE ISSUES BY SEO IMPACT - the issue that would make the single biggest difference to search rankings and user experience goes first (id:1). The last issue should be the least impactful nice-to-have. Use severity labels that reflect this: "critical" for top-priority ranking killers, "high" for significant problems, "medium" for meaningful improvements, "low" for minor optimizations, "info" for best-practice suggestions.

Format as a single JSON object. Return ONLY valid JSON at the very end (no markdown fences): {"domain":"${domain}","score":<overall 0-100>,"totalIssues":<n>,"issues":[{"id":<n>,"severity":"<critical|high|medium|low|info>","title":"<clear actionable title>","description":"<what specifically is wrong and what needs to be fixed - include key details so the fix agent knows what to do>","category":"<category>","hp":<10-100 based on combined effort to fix all items in this group>}]}

Quality over quantity. Each issue should be a real battle worth fighting, not busywork.`;

  const raw = await runAgent(prompt, onStream, undefined, requestId, agentOptions);

  // Try to extract structured audit data from the agent response.
  const parsed = _tryParseAudit(raw, domain);
  if (parsed) return parsed;

  // RETRY: Ask the agent to reformat the raw output as JSON
  console.log('  First parse failed - retrying with reformat prompt...');
  logFailedAudit(domain, raw, 'first parse attempt failed');
  onStream('[Reformatting results...]');
  const rawText = typeof raw === 'string' ? raw : (raw.raw || JSON.stringify(raw));
  const retryPrompt = `The following is the raw output of an SEO audit on ${domain}. Convert it into a single valid JSON object with this exact structure (no markdown fences, no extra text - ONLY the JSON):
{"domain":"${domain}","score":<0-100>,"totalIssues":<n>,"issues":[{"id":<n>,"severity":"<critical|high|medium|low|info>","title":"<title>","description":"<description>","category":"<category>","hp":<10-100>}]}

Raw audit output:
${rawText.slice(-12000)}`;

  const retryRaw = await runAgent(retryPrompt, onStream, undefined, requestId, agentOptions);
  const retryParsed = _tryParseAudit(retryRaw, domain);
  if (retryParsed) return retryParsed;

  // Last resort: return a single issue so the game doesn't get stuck
  console.error('  Retry also failed - returning fallback issue');
  logFailedAudit(domain, retryRaw, 'retry parse attempt failed');
  return {
    domain,
    score: 50,
    totalIssues: 1,
    issues: [{
      id: 1, severity: 'high', title: 'SEO Audit Parse Error',
      description: 'The audit completed but the results could not be parsed into structured data. Try running the audit again.',
      category: 'General', hp: 30
    }]
  };
}

/**
 * Attempt to extract a valid audit JSON from agent output.
 * Returns the parsed object or null if extraction fails.
 */
function _tryParseAudit(raw, domain) {
  try {
    if (raw && raw.issues) return _normalizeAudit(raw, domain);

    const text = typeof raw === 'string' ? raw : (raw.raw || JSON.stringify(raw));

    // Try progressively looser JSON extraction
    const patterns = [
      /\{[\s\S]*"issues"\s*:\s*\[[\s\S]*\][\s\S]*\}/,  // Strict: must have "issues":[]
      /\{[\s\S]*\}/                                       // Loose: any JSON object
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.issues && Array.isArray(parsed.issues)) {
          return _normalizeAudit(parsed, domain);
        }
      }
    }
  } catch (e) {
    console.error('  Parse attempt failed:', e.message);
  }
  return null;
}

function _normalizeAudit(parsed, domain) {
  parsed.issues = parsed.issues.map((issue, i) => ({
    id: issue.id || i + 1,
    severity: issue.severity || 'medium',
    title: issue.title || 'Unknown Issue',
    description: issue.description || 'No description',
    category: issue.category || 'General',
    hp: issue.hp || 50
  }));
  parsed.domain = parsed.domain || domain;
  parsed.score = parsed.score || 50;
  parsed.totalIssues = parsed.issues.length;
  return parsed;
}

/**
 * Fix a specific SEO issue via Codex CLI.
 * Runs inside the user's project directory so Codex can edit real files.
 */
/**
 * Build the demon-focus header that anchors every battle turn to the
 * selected SEO issue. Every available field (severity, category, URL,
 * selector, file, line, etc.) is included so Codex has full situational
 * awareness - even when the user's message is vague or conversational.
 */
function buildDemonHeader(issue) {
  const i = issue || {};
  const lines = [
    '════════════════════════════════════════════════════════',
    '  YOU ARE FIGHTING ONE SPECIFIC DEMON.  FOCUS ON IT.',
    '════════════════════════════════════════════════════════',
    '',
    'This is a gamified SEO tool. The user has selected an issue',
    'from their audit list and is now engaging with ONLY that issue.',
    'The demon below is the entire scope of this turn. Stay on it.',
    '',
    'DEMON FILE',
    '----------',
  ];
  if (i.title)       lines.push(`  Name:       ${i.title}`);
  if (i.severity)    lines.push(`  Severity:   ${String(i.severity).toUpperCase()}`);
  if (i.category)    lines.push(`  Category:   ${i.category}`);
  if (i.url)         lines.push(`  URL:        ${i.url}`);
  if (i.page)        lines.push(`  Page:       ${i.page}`);
  if (i.file)        lines.push(`  File:       ${i.file}`);
  if (i.selector)    lines.push(`  Selector:   ${i.selector}`);
  if (i.line)        lines.push(`  Line:       ${i.line}`);
  if (i.id != null)  lines.push(`  Issue ID:   ${i.id}`);
  if (i.description) {
    lines.push('');
    lines.push('DESCRIPTION');
    lines.push('-----------');
    lines.push(i.description.split('\n').map((ln) => '  ' + ln).join('\n'));
  }
  return lines.join('\n');
}

/**
 * Run a battle turn against one demon.
 *
 * The demon-focus header anchors the turn. The user's message is
 * passed through verbatim - Codex reads their intent. No heuristic
 * mode switching: if they ask a question, Codex answers; if they
 * give a directive, Codex acts; if they're polite or ambiguous,
 * Codex figures it out. This matches how an agent normally handles
 * requests, just scoped to one SEO issue.
 *
 * @param {object} issue        Full issue object (title, description,
 *                              severity, category, url, selector, etc.).
 * @param {string} userMessage  What the user typed in the Attack input.
 *                              May be empty, a question, or a directive.
 */
async function runFix(issue, userMessage, projectCwd, onStream, requestId, agentOptions) {
  const header = buildDemonHeader(issue);
  const msg = (userMessage || '').trim();
  const userBlock = msg
    ? `USER'S MESSAGE THIS TURN\n------------------------\n${msg}`
    : `USER'S MESSAGE THIS TURN\n------------------------\n(empty - the user hit Attack without typing. Proceed with fixing what the demon above describes.)`;

  const prompt = `You are working in a website project directory.

${header}

${userBlock}

HOW TO RESPOND
--------------
Stay focused on the ONE demon above. Read the user's message and react
to it naturally:
  - If they asked a question, answer it - grounded in this demon and
    any project files you need to read to verify your answer.
  - If they gave a directive (including a polite one like "can you fix
    this"), do the work - edit the relevant source files to address
    the demon.
  - If the message is empty or ambiguous and looks like "just go",
    proceed to fix what the demon describes.
  - If it's genuinely unclear what they want, ask one short clarifying
    question instead of guessing.

Do NOT investigate unrelated SEO issues, even if you notice them - the
user will select those demons separately. Do NOT rewrite the entire
project. Make surgical changes for THIS demon only.

End your response with a single-line JSON summary so the battle scene
can score the turn:
  {"fixed":<true if you edited files, false otherwise>,"summary":"<one short sentence>","filesChanged":["<list of files you changed, or []>"]}`;

  const raw = await runAgent(prompt, onStream, projectCwd, requestId, agentOptions);

  try {
    const text = typeof raw === 'string' ? raw : (raw.raw || JSON.stringify(raw));
    const jsonMatch = text.match(/\{[\s\S]*"fixed"[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) { /* fall through */ }

  return { fixed: true, summary: 'The agent handled this turn.', filesChanged: [] };
}

/**
 * Commit current changes in the project.
 */
async function runCommit(message, projectCwd, onStream, requestId, agentOptions) {
  const prompt = `In this project directory, stage all changed files and create a git commit with this message: "${message}". Do NOT push. Return JSON: {"committed":true,"message":"<commit message>","hash":"<short hash>"}`;

  const raw = await runAgent(prompt, onStream, projectCwd, requestId, agentOptions);

  try {
    const text = typeof raw === 'string' ? raw : (raw.raw || JSON.stringify(raw));
    const jsonMatch = text.match(/\{[\s\S]*"committed"[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}

  return { committed: true, message, hash: 'unknown' };
}

/**
 * Run the Codex CLI through the user's existing local login.
 * @param {string} prompt - The prompt to send
 * @param {function} onStream - Callback for streaming output
 * @param {string} [cwd] - Working directory (defaults to PROJECT_ROOT)
 */
function normalizeProfile(profile) {
  const key = String(profile || '').trim().toLowerCase();
  if (key === 'deep' || key === 'opus') return 'deep';
  if (key === 'fast' || key === 'haiku') return 'fast';
  return 'balanced';
}

function runAgent(prompt, onStream, cwd, requestId, options = {}) {
  const runtime = normalizeRuntime(options.runtime);
  const profile = normalizeProfile(options.profile);
  if (runtime === 'claude' || runtime === 'gemini') {
    return runTextCli(runtime, prompt, onStream, cwd, requestId, profile);
  }
  return runCodex(prompt, onStream, cwd, requestId, profile);
}

function getCodexProfileConfig(profile) {
  const key = normalizeProfile(profile);
  const envSuffix = key.toUpperCase();
  const defaultEffort = { deep: 'xhigh', balanced: 'high', fast: 'medium' }[key];
  return {
    key,
    model: process.env[`SEO_DUNGEON_CODEX_MODEL_${envSuffix}`] || process.env.SEO_DUNGEON_CODEX_MODEL || '',
    effort: process.env[`SEO_DUNGEON_CODEX_EFFORT_${envSuffix}`] || defaultEffort,
  };
}

const DEFAULT_TEXT_CLI_MODELS = {
  claude: {
    deep: 'opus',
    balanced: 'sonnet',
    fast: 'haiku',
  },
  gemini: {
    deep: 'gemini-3.1-pro-preview',
    balanced: 'gemini-3.5-flash',
    fast: 'gemini-3.1-flash-lite',
  },
};

function getTextCliProfileConfig(runtime, profile) {
  const normalizedRuntime = normalizeRuntime(runtime);
  const key = normalizeProfile(profile);
  const runtimeEnv = normalizedRuntime.toUpperCase();
  const profileEnv = key.toUpperCase();
  const configuredModel =
    process.env[`SEO_DUNGEON_${runtimeEnv}_MODEL_${profileEnv}`] ??
    process.env[`SEO_DUNGEON_${runtimeEnv}_MODEL`] ??
    DEFAULT_TEXT_CLI_MODELS[normalizedRuntime]?.[key] ??
    '';
  const model = /^(auto|default|none)$/i.test(String(configuredModel)) ? '' : configuredModel;
  return { key, model };
}

function resolveTextCli(runtime) {
  const normalizedRuntime = normalizeRuntime(runtime);
  const runtimeEnv = normalizedRuntime.toUpperCase();
  const execPath = process.env[`SEO_DUNGEON_${runtimeEnv}_CLI`] || normalizedRuntime;
  const defaultArgs = normalizedRuntime === 'claude'
    ? ['--print', '--output-format', 'text', '--permission-mode', 'acceptEdits']
    : ['--prompt', '{{prompt}}', '--output-format', 'text', '--approval-mode', 'auto_edit'];
  const args = process.env[`SEO_DUNGEON_${runtimeEnv}_ARGS`]
    ? splitArgs(process.env[`SEO_DUNGEON_${runtimeEnv}_ARGS`])
    : defaultArgs;
  return { execPath, args };
}

function insertPromptArg(args, prompt) {
  let inserted = false;
  const finalArgs = args.map((arg) => {
    if (arg === '{{prompt}}') {
      inserted = true;
      return prompt;
    }
    return arg;
  });
  if (!inserted) finalArgs.push(prompt);
  return finalArgs;
}

function runTextCli(runtime, prompt, onStream, cwd, requestId, profile) {
  const normalizedRuntime = normalizeRuntime(runtime);
  const workDir = cwd || PROJECT_ROOT;
  return new Promise((resolve, reject) => {
    const { execPath: cliExec, args: cliArgs } = resolveTextCli(normalizedRuntime);
    const cliProfile = getTextCliProfileConfig(normalizedRuntime, profile);
    const args = [...cliArgs];
    if (cliProfile.model) args.push('--model', cliProfile.model);
    const finalArgs = insertPromptArg(args, prompt);

    console.log(`  Running with ${normalizedRuntime} CLI (profile: ${cliProfile.key}${cliProfile.model ? `, model: ${cliProfile.model}` : ', default model'})`);
    console.log(`  CWD: ${workDir}`);
    const proc = spawn(cliExec, finalArgs, {
      cwd: workDir,
      env: safeEnv(),
      shell: process.platform === 'win32' && /\.ps1$/i.test(cliExec),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    if (requestId) activeProcesses.set(requestId, proc);

    let fullText = '';
    let lineBuffer = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullText += text;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onStream(trimmed);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      const trimmed = text.trim();
      if (trimmed && !/^\[?debug\]?/i.test(trimmed)) onStream(trimmed);
    });

    proc.on('close', (code) => {
      if (lineBuffer.trim()) onStream(lineBuffer.trim());
      console.log(`  ${normalizedRuntime} CLI finished (exit ${code}), ${fullText.length} chars`);
      if (code !== 0) {
        reject(new Error(`${normalizedRuntime} CLI exited with code ${code}: ${stderr || fullText}`));
        return;
      }
      try {
        resolve(JSON.parse(fullText));
      } catch {
        resolve({ raw: fullText });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${normalizedRuntime} CLI: ${err.message}. Is ${normalizedRuntime} installed and authenticated?`));
    });

    const MAX_RUNTIME_MS = 15 * 60 * 1000;
    const timeoutHandle = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      reject(new Error('Operation timed out after 15 minutes.'));
    }, MAX_RUNTIME_MS);
    proc.on('close', () => clearTimeout(timeoutHandle));
  });
}

function runCodex(prompt, onStream, cwd, requestId, profile) {
  const workDir = cwd || PROJECT_ROOT;
  return new Promise((resolve, reject) => {
    const { execPath: cliExec, args: cliArgs } = resolveCodexCli();
    const codexProfile = getCodexProfileConfig(profile);
    const args = [
      ...cliArgs,
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-s',
      'workspace-write',
      '-c',
      'approval_policy="never"',
      '-c',
      `model_reasoning_effort="${codexProfile.effort}"`,
      '-C',
      workDir
    ];
    if (codexProfile.model) args.push('-m', codexProfile.model);
    args.push(prompt);

    console.log(`  Running with codex exec (profile: ${codexProfile.key}, effort: ${codexProfile.effort}${codexProfile.model ? `, model: ${codexProfile.model}` : ''})`);
    console.log(`  CWD: ${workDir}`);
    const proc = spawn(cliExec, args, {
      cwd: workDir,
      env: safeEnv(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    if (requestId) activeProcesses.set(requestId, proc);

    let fullText = '';
    let buffer = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'item.completed' && event.item) {
            const item = event.item;
            if (item.type === 'agent_message' && item.text) {
              fullText += item.text;
              for (const textLine of item.text.split('\n').filter(l => l.trim())) {
                onStream(textLine.trim());
              }
            } else if (item.type && item.type.includes('tool')) {
              onStream(`[${item.name || item.type}]`);
            }
          } else if (event.type === 'turn.completed') {
            onStream('[Complete]');
          }
        } catch {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('{')) onStream(trimmed);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
            fullText += event.item.text;
          }
        } catch {}
      }

      console.log(`  Codex finished (exit ${code}), ${fullText.length} chars`);
      if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(fullText));
      } catch {
        resolve({ raw: fullText });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn codex: ${err.message}. Is Codex CLI installed and authenticated?`));
    });

    const MAX_RUNTIME_MS = 15 * 60 * 1000;
    const timeoutHandle = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      reject(new Error('Operation timed out after 15 minutes.'));
    }, MAX_RUNTIME_MS);
    proc.on('close', () => clearTimeout(timeoutHandle));
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bridge listening on ws://127.0.0.1:${PORT} (localhost only)`);
  console.log(`Agent provider: ${resolveAgentProvider()}`);
  console.log(`Agent runs from: ${PROJECT_ROOT}`);
  console.log('─'.repeat(40));
});
