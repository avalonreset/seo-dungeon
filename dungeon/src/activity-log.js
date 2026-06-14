/**
 * Guild Ledger - Animated activity log with rich color coding,
 * typewriter effects, per-category icons with unique animations,
 * flowing glow effects, pulse animations, and a living "latest line"
 * that makes it obvious work is still happening.
 */

const CHAR_DELAY_BASE = 8;
const CHAR_DELAY_FAST = 4;
const CHAR_DELAY_FLOOD = 1;
const GLOW_DURATION = 2000;

let logEl = null;
let queue = [];
let isTyping = false;
let currentTyping = null;
let loadingIndicator = null;
let loadingFrame = 0;
let loadingInterval = null;

// ── Track the current "latest" line ──
let latestLine = null;
let latestDots = null;

// ── Thematic icons per category ──
// Each gets a unique Unicode symbol that matches its role in the dungeon
const ICONS = {
  tool:     '\u2692\uFE0E',   // ⚒ hammer & pick - generic tool work
  agent:    '\u273F',          // ✿ rosette - summoned agent
  fetch:    '\u21AF',          // ↯ lightning zigzag - fetching from the web
  search:   '\u2609',          // ☉ sun/eye - searching/scanning
  read:     '\u2234',          // ∴ therefore dots - reading/analyzing
  write:    '\u2741',          // ❁ flower - inscribing/writing
  bash:     '\u2623',          // ☣ biohazard - executing commands
  skill:    '\u269D',          // ⚝ outlined star - skill invocation
  user:     '\u276F',          // ❯ chevron - user prompt
  error:    '\u2620',          // ☠ skull - something died
  complete: '\u2726',          // ✦ four-pointed star - victory
  status:   '\u25C8',          // ◈ diamond - status/progress
  queue:    '\u21AC',          // ↬ arrow - queued steering
  system:   '\u2042',          // ⁂ asterism - system message
  domain:   '\u2302',          // ⌂ house - domain/site
  score:    '\u2694\uFE0E',   // ⚔ crossed swords - scoring
  demon:    '\u2666',          // ♦ diamond suit - demon
  fix:      '\u2726',          // ✦ star - vanquished
  compact:  '\u25C8',          // ◈ diamond - context compression
  text:     '\u203A',          // › single angle quote - generic text
};

// ── Classify log text into categories ──
function classify(text) {
  if (text.startsWith('ERROR') || text.startsWith('Fix error') || text.startsWith('Fix failed'))
    return 'error';

  if (text.startsWith('[Agent]')) return 'agent';
  if (text.startsWith('[WebFetch]') || text.startsWith('[WebSearch]')) return 'fetch';
  if (text.startsWith('[Grep]') || text.startsWith('[Glob]') || text.startsWith('[ToolSearch]')) return 'search';
  if (text.startsWith('[Read]')) return 'read';
  if (text.startsWith('[Write]') || text.startsWith('[Edit]') || text.startsWith('[NotebookEdit]')) return 'write';
  if (text.startsWith('[Bash]')) return 'bash';
  if (text.startsWith('[Skill]')) return 'skill';
  if (text.startsWith('[TodoWrite]') || text.startsWith('[TaskCreate]')) return 'status';

  if (text.startsWith('> ')) return 'user';
  if (/^(\[Compact\]|\[Compaction\]|Context compaction|Compaction|Compacting context|Compressing context|Context compression|Auto-compact|Auto compact)/i.test(text)) return 'compact';
  if (text.includes('[Complete]') || text.includes('omplete')) return 'complete';
  if (text.startsWith('[')) return 'tool';
  if (/^(Queued|Queue|Requeued|Prompt queued|Prompt returned|Returned prompt|Removed queued|Updated queued|Submitted queued)/i.test(text)) return 'queue';

  if (/^(Audit|Fix|Score|Found|Scanning|Initializing|Subagent|Stopped|Nothing active)/i.test(text)) return 'status';
  if (/demons?\s*(remain|found|slain|await)/i.test(text)) return 'demon';
  if (/score/i.test(text)) return 'score';

  if (text.startsWith('Hunting:') || text.startsWith('Source:')) return 'domain';

  if (/^(System|Waiting|Connected|Bridge|Ready|Recalled)/i.test(text)) return 'system';

  if (/vanquish|strikes|damage|fixed/i.test(text)) return 'fix';

  return 'text';
}

function getIcon(cls) {
  return ICONS[cls] || ICONS.text;
}

// ── Mark a line as the "latest" (living/active) ──
// The latest line is the ledger's cursor - the quill currently writing.
// It gets a static gold left bar + soft trailing dots. No shimmer, no
// pulse, no flicker. When a line loses .latest, it just drops those
// affordances and becomes historical - ink already dried.
function clearLatestAffordances(preserveLine = null) {
  if (logEl) {
    logEl.querySelectorAll('.log-line.latest, .log-line.active-output').forEach((node) => {
      if (node !== preserveLine) node.classList.remove('latest', 'active-output');
    });
    logEl.querySelectorAll('.log-dots').forEach((node) => {
      if (!preserveLine || !preserveLine.contains(node)) node.remove();
    });
  }
  if (latestLine && latestLine !== preserveLine) latestLine.classList.remove('latest', 'active-output');
  if (latestDots && latestDots.parentNode && (!preserveLine || !preserveLine.contains(latestDots))) {
    latestDots.remove();
    latestDots = null;
  }
}

function isActiveOutputLine(line) {
  if (!line) return false;
  return !line.classList.contains('user') &&
    !line.classList.contains('queue') &&
    !line.classList.contains('system') &&
    !line.classList.contains('error') &&
    !line.classList.contains('complete');
}

function markAsLatest(line) {
  clearLatestAffordances(line);
  if (latestDots && latestDots.parentNode) latestDots.remove();
  latestDots = null;

  latestLine = line;

  // If ledger is idle or line is a "complete" message, don't animate at all
  const isIdle = logEl && logEl.classList.contains('ledger-idle');
  const isComplete = line.classList.contains('complete');

  if (isIdle || isComplete) {
    // No "latest" class, no dots, no shimmer - completely static
    line.classList.remove('latest', 'active-output');
    latestDots = null;
    return;
  }

  line.classList.add('latest');
  if (isActiveOutputLine(line)) {
    line.classList.add('active-output');
  }

  latestDots = document.createElement('span');
  latestDots.className = 'log-dots';
  latestDots.innerHTML = '<span class="dot">\u2022</span><span class="dot">\u2022</span><span class="dot">\u2022</span>';
  const textSpan = line.querySelector('.log-text');
  if (textSpan) {
    textSpan.after(latestDots);
  }
}

function addTurnSeparatorIfNeeded(cls) {
  if (cls !== 'complete') return;
  if (logEl.lastElementChild?.classList.contains('log-separator')) return;
  const sep = document.createElement('div');
  sep.className = 'log-separator';
  sep.innerHTML = '<span class="sep-dot">\u25C7</span><span class="sep-dot">\u25C6</span><span class="sep-dot">\u25C7</span>';
  logEl.appendChild(sep);
  scrollToBottom();
}

function createLogLine(text, cls, { typing = false } = {}) {
  const line = document.createElement('div');
  line.className = `log-line ${cls}${typing ? ' typing' : ''} glow`;

  // Icon with its own category-specific animation class
  const icon = document.createElement('span');
  icon.className = `log-icon icon-${cls}`;
  icon.textContent = getIcon(cls);
  line.appendChild(icon);

  // Text content typed out
  const content = document.createElement('span');
  content.className = 'log-text';
  content.textContent = typing ? '' : text;
  line.appendChild(content);

  logEl.appendChild(line);
  scrollToBottom();

  return { line, content };
}

function finishTypingContext(ctx) {
  if (!ctx || ctx.done) return;
  ctx.done = true;
  if (ctx.interval) clearInterval(ctx.interval);
  ctx.content.textContent = ctx.text;
  ctx.line.classList.remove('typing');
  setTimeout(() => ctx.line.classList.remove('glow'), GLOW_DURATION);
  linkify(ctx.content);
  markAsLatest(ctx.line);
  addTurnSeparatorIfNeeded(ctx.cls);
  if (currentTyping === ctx) currentTyping = null;
  ctx.resolve?.();
}

function appendInstantLine(text, cls) {
  hideLoading();
  const { line, content } = createLogLine(text, cls, { typing: false });
  setTimeout(() => line.classList.remove('glow'), GLOW_DURATION);
  linkify(content);
  markAsLatest(line);
  addTurnSeparatorIfNeeded(cls);
}

export function flushLogQueue() {
  hideLoading();
  if (currentTyping) finishTypingContext(currentTyping);
  while (queue.length > 0) {
    const { text, cls } = queue.shift();
    appendInstantLine(text, cls);
  }
}

// ── Typewriter effect with icon prefix ──
function queuedCharacterPressure() {
  return queue.reduce((sum, item) => sum + (item?.text?.length || 0), 0);
}

function typingTickBatchSize(textLength, backlogCount = 0, backlogChars = 0) {
  if (backlogCount > 14 || backlogChars > 5000) return 12;
  if (backlogCount > 8 || backlogChars > 2500) return 8;
  if (backlogCount > 4 || backlogChars > 1200) return 5;
  if (textLength > 900) return 4;
  if (textLength > 450) return 2;
  return 1;
}

function charsPerTypingTick(textLength) {
  return typingTickBatchSize(textLength, queue.length, queuedCharacterPressure());
}

function typewriterLine(text, cls) {
  return new Promise((resolve) => {
    const { line, content } = createLogLine(text, cls, { typing: true });
    const ctx = { line, content, text, cls, interval: null, resolve, done: false };
    currentTyping = ctx;
    markAsLatest(line);

    let i = 0;
    const speed = queue.length > 8 ? CHAR_DELAY_FLOOD : queue.length > 3 ? CHAR_DELAY_FAST : CHAR_DELAY_BASE;
    ctx.interval = setInterval(() => {
      const charsPerTick = charsPerTypingTick(text.length);
      for (let c = 0; c < charsPerTick && i < text.length; c++) {
        content.textContent += text[i];
        i++;
      }
      scrollToBottom();
      if (i >= text.length) {
        finishTypingContext(ctx);
      }
    }, speed);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  LINKIFY - make URLs clickable and backticked content copy-to-clipboard
// ═══════════════════════════════════════════════════════════════════════
// After a line finishes typing, scan its text for URLs and backticked
// content, then replace them with styled, clickable elements.
//   - Bare URLs (http/https)       -> blue underlined, opens in new tab
//   - Backticked URL               -> blue underlined, opens in new tab
//   - Backticked path/command/code -> green highlight, copies to clipboard
// Uses tokenization + DOM nodes (not innerHTML) so content stays safe.

function linkify(contentSpan) {
  const raw = contentSpan.textContent;
  if (!raw) return;
  const segments = tokenize(raw);
  // Skip work if nothing linkable found
  if (!segments.some((s) => s.type !== 'text')) return;
  contentSpan.textContent = '';
  for (const seg of segments) {
    if (seg.type === 'text') {
      contentSpan.appendChild(document.createTextNode(seg.value));
    } else if (seg.type === 'url') {
      contentSpan.appendChild(makeUrlAnchor(seg.value, seg.display || seg.value));
    } else if (seg.type === 'code') {
      contentSpan.appendChild(makeCopyable(seg.value));
    }
  }
}

/**
 * Split a line into { type: 'text' | 'url' | 'code', value } segments.
 * Backtick-wrapped content is tokenized first (explicit intent). Bare
 * URLs outside backticks are picked up next. Everything else is text.
 */
function tokenize(text) {
  const out = [];
  let cursor = 0;
  const pushText = (s) => {
    if (!s) return;
    if (out.length > 0 && out[out.length - 1].type === 'text') {
      out[out.length - 1].value += s;
    } else {
      out.push({ type: 'text', value: s });
    }
  };

  while (cursor < text.length) {
    // Backtick code span
    if (text[cursor] === '`') {
      const end = text.indexOf('`', cursor + 1);
      if (end > cursor) {
        const inner = text.slice(cursor + 1, end);
        if (/^https?:\/\/\S+$/.test(inner)) {
          out.push({ type: 'url', value: inner.replace(/[.,;:!?)\]]+$/, ''), display: inner });
        } else {
          out.push({ type: 'code', value: inner });
        }
        cursor = end + 1;
        continue;
      }
    }

    // Bare URL
    const tail = text.slice(cursor);
    const m = tail.match(/^https?:\/\/[^\s`<>"']+/);
    if (m) {
      // Strip trailing punctuation that's probably sentence-terminal, not part of the URL
      let url = m[0];
      const trim = url.match(/[.,;:!?)\]]+$/);
      let trailing = '';
      if (trim) { trailing = trim[0]; url = url.slice(0, -trailing.length); }
      out.push({ type: 'url', value: url, display: url });
      cursor += url.length;
      pushText(trailing);
      continue;
    }

    pushText(text[cursor]);
    cursor += 1;
  }
  return out;
}

function makeUrlAnchor(url, display) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'log-link log-link-url';
  a.textContent = display;
  a.title = 'Open in new tab';
  return a;
}

function makeCopyable(text) {
  const s = document.createElement('span');
  s.className = 'log-link log-link-code';
  s.textContent = text;
  s.title = 'Click to copy';
  s.addEventListener('click', (e) => {
    e.stopPropagation();
    const doCopy = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error('no clipboard api'));
    doCopy
      .then(() => showCopyToast('Copied'))
      .catch(() => {
        // Fallback: select the span so the user can Ctrl+C manually
        const range = document.createRange();
        range.selectNodeContents(s);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        showCopyToast('Selected, press Ctrl+C');
      });
  });
  return s;
}

let _toastTimer = null;
function showCopyToast(msg) {
  let t = document.getElementById('log-copy-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'log-copy-toast';
    t.className = 'log-copy-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('fade');
  // Force reflow so re-adding the class re-triggers the transition
  void t.offsetWidth;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('fade'), 1100);
}

// ── Process queue ──
async function processQueue() {
  if (isTyping) return;
  isTyping = true;
  while (queue.length > 0) {
    const { text, cls } = queue.shift();
    hideLoading();
    await typewriterLine(text, cls);
  }
  isTyping = false;
}

// ── Loading indicator ──
function showLoading() {
  if (loadingIndicator) return;
  loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'log-line log-loading';
  logEl.appendChild(loadingIndicator);
  scrollToBottom();

  const runes = ['\u25C7', '\u25C6', '\u25C8', '\u25C6'];
  loadingFrame = 0;
  loadingInterval = setInterval(() => {
    loadingFrame = (loadingFrame + 1) % runes.length;
    if (loadingIndicator) {
      loadingIndicator.innerHTML = `<span class="loading-rune">${runes[loadingFrame]}</span><span class="loading-text"> channeling</span>`;
    }
    scrollToBottom();
  }, 500);
}

function hideLoading() {
  if (loadingIndicator) {
    loadingIndicator.remove();
    loadingIndicator = null;
  }
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
}

let userScrolledUp = false;
let programmaticScroll = false;

function scrollToBottom() {
  if (!logEl || userScrolledUp) return;
  programmaticScroll = true;
  logEl.scrollTop = logEl.scrollHeight;
  requestAnimationFrame(() => { programmaticScroll = false; });
}

function isNearBottom() {
  if (!logEl) return true;
  return (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight) < 60;
}

// ══════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════

export function initActivityLog() {
  logEl = document.getElementById('log-content');
  if (!logEl) return;

  // Start in idle state - no animations until something is actively loading
  logEl.classList.add('ledger-idle');

  // Track user scroll intent - distinguish user scrolls from programmatic ones
  logEl.addEventListener('scroll', () => {
    if (programmaticScroll) return;
    userScrolledUp = !isNearBottom();
  });

  // Keyboard navigation for the ledger
  document.addEventListener('keydown', (e) => {
    // Only handle if ledger-related keys and not typing in an input
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'Home') {
      e.preventDefault();
      logEl.scrollTop = 0;
      userScrolledUp = true;
    } else if (e.key === 'End') {
      e.preventDefault();
      logEl.scrollTop = logEl.scrollHeight;
      userScrolledUp = false;
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      logEl.scrollTop -= logEl.clientHeight * 0.8;
      userScrolledUp = !isNearBottom();
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      logEl.scrollTop += logEl.clientHeight * 0.8;
      userScrolledUp = !isNearBottom();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    /* ═══════════════════════════════════════════════
       GUILD LEDGER v3 - Ceremony for the significant

       Design philosophy:
       - Routine work stays CALM: tool calls, reads, fetches, bash,
         system chatter all arrive quietly, settle into the scroll,
         and stop moving. No flicker, no looping animation.
       - Significant moments earn CEREMONY: skill invocations, user
         commands, victories, completions, errors, demon sightings,
         and score reveals each get a one-shot entrance that feels
         earned. The ceremony plays once, then the line is still.
       - Six color families, one per meaning: parchment (neutral),
         ink blue (system work), forge green (execution/success),
         hearth gold (significance), agent purple (summoned
         entities), blood red (alarm). Icons share family colors.
       - The latest line is the ledger's living cursor: a gold
         gradient side-bar with soft trailing dots. Everything
         older is history; history does not move.
       - Links are affordances. Color + underline + hover shift.
         No glow, no shimmer, no flicker. They are hardcoded to
         ignore any parent gradient-clip so they can never regress
         into the old flicker behavior.
       - prefers-reduced-motion freezes every ceremony and every
         loop. The typewriter cursor remains because it carries
         content. The reader always gets the full ledger text.
       ═══════════════════════════════════════════════ */

    /* ── Base line ── */
    .log-line {
      --ledger-ink: #c8bfa8;
      --ledger-hot: #f2e5bd;
      --ledger-soft: #8a8270;
      --ledger-glow-rgb: 200, 191, 168;
      opacity: 0;
      animation: fadeInLine 0.4s ease-out forwards;
      position: relative;
      padding: 4px 0 4px 6px;
      line-height: 1.55;
    }
    @keyframes fadeInLine {
      from { opacity: 0; transform: translateX(-10px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .log-line.typing { opacity: 1; }

    /* Fresh-ink settle: new lines land slightly brighter, fade to normal
       over 1.4s. This is the baseline effect every line gets. Feels like
       wet ink drying into parchment. One-shot, not cyclic. */
    .log-line.glow {
      animation: fadeInLine 0.4s ease-out forwards, inkWet 1.4s ease-out 1;
    }
    @keyframes inkWet {
      0%   { filter: brightness(1.22); }
      100% { filter: brightness(1); }
    }

    /* ═══════════════════════════════════════════════
       HERO TIER CEREMONIES
       Six categories earn a one-shot entrance ceremony. Each fires
       exactly once when the line first appears, then the line is
       still forever. The ceremony runs alongside fadeInLine+inkWet
       via additional keyframes and pseudo-element halos.

         skill     -> rune activation (gold bloom behind icon)
         user      -> invocation (gold underline draws in)
         complete  -> victory stamp (green shimmer sweep, scale pop)
         fix       -> resolution (golden burst, icon spin)
         error     -> alarm (red sidebar flash + text flicker)
         demon     -> threat (red pulse, icon throb once)
         score     -> tally (golden glow, bold weight)
       ═══════════════════════════════════════════════ */

    /* ── Skill: rune activation ──
       Icon scales with a gold radial halo blooming behind it.
       Text letter-spacing widens briefly as the rune "opens." */
    .log-line.skill.glow .log-icon {
      animation: iconBloom 900ms ease-out 1;
    }
    .log-line.skill.glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 runeActivation 1s ease-out 1;
    }
    @keyframes iconBloom {
      0%   { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 #d4af37); }
      35%  { transform: scale(1.35); filter: brightness(1.5) drop-shadow(0 0 10px #d4af37); }
      100% { transform: scale(1.08); filter: brightness(1.12) drop-shadow(0 0 0 #d4af37); }
    }
    @keyframes runeActivation {
      0%   { letter-spacing: 0.015em; text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
      25%  { letter-spacing: 0.045em; text-shadow: 0 0 14px rgba(212, 175, 55, 0.55); }
      100% { letter-spacing: 0.015em; text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
    }

    /* ── User: invocation ──
       A short gold underline draws in from the left and fades. Italic
       and slightly wider letter-spacing communicate "your voice." */
    .log-line.user {
      font-style: italic;
      letter-spacing: 0.02em;
    }
    .log-line.user.glow::after {
      content: '';
      position: absolute;
      left: 9px;
      right: 4px;
      bottom: 2px;
      height: 1px;
      background: linear-gradient(90deg, rgba(212, 175, 55, 0.7), rgba(212, 175, 55, 0));
      transform-origin: left center;
      animation: userUnderline 900ms ease-out 1 forwards;
      pointer-events: none;
    }
    @keyframes userUnderline {
      0%   { transform: scaleX(0); opacity: 0.85; }
      60%  { transform: scaleX(1); opacity: 0.85; }
      100% { transform: scaleX(1); opacity: 0; }
    }

    /* ── Complete: victory stamp ──
       Scale pop + one-pass green shimmer across the text + icon burst.
       The shimmer is a single sweep (not infinite) via a pseudo-element
       overlay so the text underneath keeps its own color and stays
       legible. Links are exempt per .log-link rules below. */
    .log-line.complete.glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 completePop 0.7s ease-out 1;
    }
    .log-line.complete.glow .log-icon {
      animation: iconVictory 900ms ease-out 1;
    }
    .log-line.complete.glow::before {
      content: '';
      position: absolute;
      top: 0;
      left: -10%;
      right: -10%;
      bottom: 0;
      background: linear-gradient(90deg,
                  transparent 0%,
                  rgba(159, 212, 168, 0) 30%,
                  rgba(159, 212, 168, 0.35) 50%,
                  rgba(159, 212, 168, 0) 70%,
                  transparent 100%);
      animation: victoryShimmer 1.1s ease-out 1 forwards;
      pointer-events: none;
      mix-blend-mode: screen;
    }
    @keyframes iconVictory {
      0%   { transform: scale(1) rotate(0deg); filter: brightness(1) drop-shadow(0 0 0 #7fb890); }
      40%  { transform: scale(1.5) rotate(8deg); filter: brightness(1.8) drop-shadow(0 0 14px #9fd4a8); }
      100% { transform: scale(1.1) rotate(0deg); filter: brightness(1.15) drop-shadow(0 0 0 #7fb890); }
    }
    @keyframes victoryShimmer {
      0%   { transform: translateX(-60%); opacity: 0; }
      20%  { opacity: 1; }
      100% { transform: translateX(60%); opacity: 0; }
    }
    @keyframes completePop {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.035); }
      100% { transform: scale(1); }
    }

    /* ── Fix: resolution ──
       Golden burst on icon, brief gold text-shadow. A demon was vanquished
       and a real code edit landed. This is a reward moment. */
    .log-line.fix.glow .log-icon {
      animation: iconBurst 800ms ease-out 1;
    }
    .log-line.fix.glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 resolveGlow 1.1s ease-out 1;
    }
    @keyframes iconBurst {
      0%   { transform: scale(1) rotate(0deg); filter: brightness(1) drop-shadow(0 0 0 #d4af37); }
      45%  { transform: scale(1.4) rotate(30deg); filter: brightness(1.6) drop-shadow(0 0 12px #d4af37); }
      100% { transform: scale(1.05) rotate(0deg); filter: brightness(1.1) drop-shadow(0 0 0 #d4af37); }
    }
    @keyframes resolveGlow {
      0%   { text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
      30%  { text-shadow: 0 0 10px rgba(212, 175, 55, 0.5); }
      100% { text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
    }

    /* ── Error: alarm ──
       A red sidebar flashes in from the left and fades, a brief red
       background tint pulses, and the text momentarily dims once (like
       a flicker of torchlight). Feels alarming without being annoying. */
    .log-line.error:not(.latest).glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 errorPulse 1.5s ease-out 1,
                 errorFlicker 240ms ease-out 1;
    }
    .log-line.error.glow::before {
      content: '';
      position: absolute;
      left: 0;
      top: 2px;
      bottom: 2px;
      width: 3px;
      background: #c85050;
      border-radius: 1px;
      animation: errorSidebar 700ms ease-out 1 forwards;
      pointer-events: none;
      box-shadow: 0 0 8px rgba(200, 80, 80, 0.55);
    }
    @keyframes errorPulse {
      0%, 100% { background-color: transparent; }
      20%      { background-color: rgba(200, 80, 80, 0.12); }
      80%      { background-color: transparent; }
    }
    @keyframes errorFlicker {
      0%, 100% { opacity: 1; }
      40%      { opacity: 0.55; }
      70%      { opacity: 0.9; }
    }
    @keyframes errorSidebar {
      0%   { opacity: 0; transform: scaleY(0.3); }
      20%  { opacity: 1; transform: scaleY(1); }
      100% { opacity: 0; transform: scaleY(1); }
    }

    /* ── Demon: threat ──
       Icon throbs once, text has a brief warm-red glow. A demon has
       been sighted. Not as alarming as an error, but wants attention. */
    .log-line.demon.glow .log-icon {
      animation: iconThrobOnce 700ms ease-out 1;
    }
    .log-line.demon.glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 demonEcho 1s ease-out 1;
    }
    @keyframes iconThrobOnce {
      0%   { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 #c85050); }
      50%  { transform: scale(1.22); filter: brightness(1.4) drop-shadow(0 0 10px #c85050); }
      100% { transform: scale(1); filter: brightness(1.1) drop-shadow(0 0 0 #c85050); }
    }
    @keyframes demonEcho {
      0%   { text-shadow: 0 0 0 rgba(200, 80, 80, 0); }
      40%  { text-shadow: 0 0 8px rgba(200, 80, 80, 0.4); }
      100% { text-shadow: 0 0 0 rgba(200, 80, 80, 0); }
    }

    /* ── Score: tally ──
       Bold weight, brief gold glow. The verdict lands. */
    .log-line.score {
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .log-line.score.glow {
      animation: fadeInLine 0.4s ease-out forwards,
                 inkWet 1.4s ease-out 1,
                 scoreGlow 1.2s ease-out 1;
    }
    @keyframes scoreGlow {
      0%   { text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
      30%  { text-shadow: 0 0 12px rgba(212, 175, 55, 0.55); }
      100% { text-shadow: 0 0 0 rgba(212, 175, 55, 0); }
    }

    /* ── Icon base: single unified treatment. No per-category motion. ── */
    .log-icon {
      display: inline-block;
      width: 20px;
      text-align: center;
      margin-right: 7px;
      font-size: 13px;
      vertical-align: middle;
      opacity: 0.72;
    }

    /* ═══════════════════════════════════════════════
       COLOR FAMILIES
       Each category maps to one of six semantic roles.
       ═══════════════════════════════════════════════ */

    /* Parchment - default text, neutral chatter */
    .log-line.text {
      --ledger-ink: #c8bfa8;
      --ledger-hot: #fff0ca;
      --ledger-soft: #8a8270;
      --ledger-glow-rgb: 200, 191, 168;
      color: var(--ledger-ink);
    }
    .log-line.system {
      --ledger-ink: #8a8270;
      --ledger-hot: #c7bea8;
      --ledger-soft: #5d574c;
      --ledger-glow-rgb: 138, 130, 112;
      color: var(--ledger-ink);
    }

    /* Ink blue - cool system work (reading, searching, fetching) */
    .log-line.tool,
    .log-line.fetch,
    .log-line.search,
    .log-line.read,
    .log-line.domain {
      --ledger-ink: #8ab6d2;
      --ledger-hot: #d2f4ff;
      --ledger-soft: #47799a;
      --ledger-glow-rgb: 138, 182, 210;
      color: var(--ledger-ink);
    }
    .log-line.queue {
      --ledger-ink: #8ec9ff;
      --ledger-hot: #d9f2ff;
      --ledger-soft: #487aa8;
      --ledger-glow-rgb: 142, 201, 255;
      color: var(--ledger-ink);
    }
    .log-line.compact {
      --ledger-ink: #8fcce6;
      --ledger-hot: #e1f7ff;
      --ledger-soft: #477f95;
      --ledger-glow-rgb: 143, 204, 230;
      color: var(--ledger-ink);
    }

    /* Forge green - execution and success */
    .log-line.bash {
      --ledger-ink: #7fb890;
      --ledger-hot: #d5ffd9;
      --ledger-soft: #4d8c62;
      --ledger-glow-rgb: 127, 184, 144;
      color: var(--ledger-ink);
    }
    .log-line.complete {
      --ledger-ink: #9fd4a8;
      --ledger-hot: #e0ffe4;
      --ledger-soft: #5d9a67;
      --ledger-glow-rgb: 159, 212, 168;
      color: var(--ledger-ink);
    }

    /* Hearth gold - significance */
    .log-line.skill,
    .log-line.fix,
    .log-line.score {
      --ledger-ink: #d4af37;
      --ledger-hot: #ffe88b;
      --ledger-soft: #9b7b20;
      --ledger-glow-rgb: 212, 175, 55;
      color: var(--ledger-ink);
    }
    .log-line.user {
      --ledger-ink: #d4af37;
      --ledger-hot: #fff0a0;
      --ledger-soft: #9b7b20;
      --ledger-glow-rgb: 212, 175, 55;
      color: var(--ledger-ink);
      font-weight: 600;
    }
    .log-line.write,
    .log-line.status {
      --ledger-ink: #c89a40;
      --ledger-hot: #ffda82;
      --ledger-soft: #8f6828;
      --ledger-glow-rgb: 200, 154, 64;
      color: var(--ledger-ink);
    }

    /* Agent purple - summoned entities, spawned subagents */
    .log-line.agent {
      --ledger-ink: #a794d6;
      --ledger-hot: #eadfff;
      --ledger-soft: #7261a4;
      --ledger-glow-rgb: 167, 148, 214;
      color: var(--ledger-ink);
    }

    /* Blood red - alarm */
    .log-line.error,
    .log-line.demon {
      --ledger-ink: #c85050;
      --ledger-hot: #ff9999;
      --ledger-soft: #8c292f;
      --ledger-glow-rgb: 200, 80, 80;
      color: var(--ledger-ink);
    }
    .log-line.error { font-weight: 500; }

    /* Icon colors mirror line family (grouped, not 1:1 recopied) */
    .icon-tool, .icon-fetch, .icon-search, .icon-read, .icon-domain, .icon-queue, .icon-compact { color: #8ab6d2; }
    .icon-bash, .icon-complete { color: #7fb890; }
    .icon-skill, .icon-fix, .icon-user, .icon-score { color: #d4af37; }
    .icon-write, .icon-status { color: #c89a40; }
    .icon-agent { color: #a794d6; }
    .icon-error, .icon-demon { color: #c85050; }
    .icon-text { color: #8a8270; }
    .icon-system { color: #706a60; }

    /* ═══════════════════════════════════════════════
       STATIC LINE ACCENTS - thin left bars for meaningful types.
       These reinforce category without adding motion. Applied only to
       historical lines (the latest line has its own gold accent).
       ═══════════════════════════════════════════════ */
    .log-line.user {
      border-left: 2px solid rgba(212, 175, 55, 0.38);
      padding-left: 9px;
      margin-left: -2px;
    }
    .log-line.agent:not(.latest) {
      border-left: 2px solid rgba(167, 148, 214, 0.28);
      padding-left: 9px;
      margin-left: -2px;
    }
    .log-line.bash:not(.latest) {
      border-left: 2px solid rgba(127, 184, 144, 0.22);
      padding-left: 9px;
      margin-left: -2px;
    }

    /* ═══════════════════════════════════════════════
       TYPING CURSOR - the quill tip, visible only mid-stroke
       ═══════════════════════════════════════════════ */
    .log-line.typing::after {
      content: '\\2588';
      animation: cursorBlink 0.7s step-end infinite;
      color: #d4af37;
      font-weight: 300;
      font-size: 12px;
      margin-left: 2px;
      opacity: 0.85;
    }
    @keyframes cursorBlink {
      0%, 50%    { opacity: 0.85; }
      51%, 100%  { opacity: 0; }
    }

    /* ═══════════════════════════════════════════════
       LATEST LINE - the current reading position

       The current quill. The side bar, dot wave, and active text glow
       inherit the entry category color so the newest command, read,
       agent note, or status line feels alive without leaving stale
       effects on older lines.
       ═══════════════════════════════════════════════ */
    .log-line.latest {
      position: relative;
      padding-left: 14px;
    }
    .log-line.latest::before {
      content: '';
      position: absolute;
      left: 0;
      top: 3px;
      bottom: 3px;
      width: 3px;
      border-radius: 1px 1px 1px 1px;
      background: linear-gradient(180deg, var(--ledger-hot) 0%, var(--ledger-ink) 44%, var(--ledger-soft) 100%);
      box-shadow: 0 0 7px rgba(var(--ledger-glow-rgb), 0.58),
                  inset 0 0 2px rgba(255, 255, 255, 0.72);
      opacity: 0.95;
    }
    .log-line.latest .log-icon {
      opacity: 1;
      filter: brightness(1.18);
    }
    .log-line.latest.active-output .log-text {
      background-image: linear-gradient(102deg,
        var(--ledger-ink) 0%,
        var(--ledger-ink) 24%,
        var(--ledger-soft) 38%,
        var(--ledger-hot) 48%,
        #ffffff 50%,
        var(--ledger-hot) 52%,
        var(--ledger-soft) 62%,
        var(--ledger-ink) 76%,
        var(--ledger-ink) 100%);
      background-size: 340% 100%;
      background-position: 145% 0;
      background-repeat: no-repeat;
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      will-change: background-position, opacity, text-shadow;
      text-shadow:
        0 0 8px rgba(var(--ledger-glow-rgb), 0.16),
        0 0 20px rgba(var(--ledger-glow-rgb), 0.08);
      animation:
        activeReadGlow 2.2s linear infinite,
        activeReadBreath 1.65s ease-in-out infinite alternate;
    }
    @keyframes activeReadGlow {
      0%   { background-position: 145% 0; }
      100% { background-position: -145% 0; }
    }
    @keyframes activeReadBreath {
      0% {
        opacity: 0.86;
        text-shadow:
          0 0 6px rgba(var(--ledger-glow-rgb), 0.12),
          0 0 14px rgba(var(--ledger-glow-rgb), 0.06);
      }
      100% {
        opacity: 1;
        text-shadow:
          0 0 10px rgba(var(--ledger-glow-rgb), 0.30),
          0 0 26px rgba(var(--ledger-glow-rgb), 0.18);
      }
    }
    .ledger-idle .log-line.latest.active-output .log-text {
      background-image: none;
      background-clip: initial;
      -webkit-background-clip: initial;
      -webkit-text-fill-color: currentColor;
      text-shadow: none;
      animation: none;
    }
    .log-line.latest.active-output .log-link {
      -webkit-text-fill-color: currentColor;
      background-clip: initial;
      -webkit-background-clip: initial;
      animation: none;
    }

    /* Trailing dot wave - very soft, just enough to say "still writing" */
    .log-dots {
      display: inline-block;
      margin-left: 6px;
      letter-spacing: 3px;
      font-size: 11px;
    }
    .log-dots .dot {
      display: inline-block;
      animation: dotWave 2s ease-in-out infinite;
      opacity: 0.2;
      color: currentColor;
    }
    .log-dots .dot:nth-child(1) { animation-delay: 0s; }
    .log-dots .dot:nth-child(2) { animation-delay: 0.3s; }
    .log-dots .dot:nth-child(3) { animation-delay: 0.6s; }
    @keyframes dotWave {
      0%, 100% { opacity: 0.18; transform: translateY(0); }
      50%      { opacity: 0.55; transform: translateY(-2px); }
    }

    /* ═══════════════════════════════════════════════
       ONE-SHOT EFFECTS - tied to meaningful outcomes only.
       Fire when the line first appears, decay cleanly, never loop.
       ═══════════════════════════════════════════════ */

    /* Error: brief red-tinted background flush, decays to transparent */
    .log-line.error:not(.latest) {
      animation: fadeInLine 0.4s ease-out forwards, errorPulse 1.5s ease-out 1;
    }
    @keyframes errorPulse {
      0%, 100% { background: transparent; }
      20%      { background: rgba(200, 80, 80, 0.12); }
      80%      { background: transparent; }
    }

    /* Complete: subtle scale pop, like a stamp pressing onto paper */
    .log-line.complete:not(.latest) {
      animation: fadeInLine 0.4s ease-out forwards, completePop 0.7s ease-out 1;
    }
    @keyframes completePop {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.025); }
      100% { transform: scale(1); }
    }

    /* ═══════════════════════════════════════════════
       SEPARATOR RUNES - one-shot trace-in, then still.
       The central rune appears first, then the outer runes fade in
       from it. Once placed, the separator never moves again.
       ═══════════════════════════════════════════════ */
    .log-separator {
      text-align: center;
      padding: 10px 0;
      opacity: 0;
      animation: fadeInLine 0.5s ease forwards;
      position: relative;
    }
    .log-separator::before,
    .log-separator::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 28%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.22), transparent);
      transform: translateY(-50%);
    }
    .log-separator::before { left: 8%; }
    .log-separator::after  { right: 8%; }
    .sep-dot {
      display: inline-block;
      color: #6a5a3a;
      font-size: 11px;
      margin: 0 12px;
      opacity: 0;
      animation: sepTrace 600ms ease-out 1 forwards;
    }
    .sep-dot:nth-child(2) {
      color: #d4af37;
      animation-delay: 0s;
      font-size: 13px;
      text-shadow: 0 0 6px rgba(212, 175, 55, 0.4);
    }
    .sep-dot:nth-child(1) { animation-delay: 220ms; }
    .sep-dot:nth-child(3) { animation-delay: 220ms; }
    @keyframes sepTrace {
      0%   { opacity: 0; transform: scale(0.6); }
      60%  { opacity: 1; transform: scale(1.15); }
      100% { opacity: 0.7; transform: scale(1); }
    }

    /* ═══════════════════════════════════════════════
       LOADING RUNE - meditative spinner with gold halo.
       The rune spins, a faint gold ring orbits counter-direction at
       half the speed. Compound motion that reads as "conjuring," not
       "loading spinner." Stays quiet until loading is active.
       ═══════════════════════════════════════════════ */
    .log-loading {
      opacity: 1;
      color: #8a8270;
      padding: 3px 0 3px 4px;
      position: relative;
    }
    .loading-rune {
      display: inline-block;
      position: relative;
      color: #d4af37;
      animation: runeSpin 3s linear infinite;
      font-size: 14px;
      opacity: 0.85;
      text-shadow: 0 0 8px rgba(212, 175, 55, 0.35);
    }
    .loading-rune::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 26px;
      height: 26px;
      margin-left: -13px;
      margin-top: -13px;
      border-radius: 50%;
      border: 1px solid rgba(212, 175, 55, 0.22);
      box-shadow: 0 0 8px rgba(212, 175, 55, 0.18),
                  inset 0 0 4px rgba(212, 175, 55, 0.12);
      animation: runeHalo 6s linear infinite reverse;
    }
    @keyframes runeSpin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes runeHalo {
      0%   { transform: rotate(0deg) scale(1); opacity: 0.35; }
      50%  { transform: rotate(180deg) scale(1.08); opacity: 0.6; }
      100% { transform: rotate(360deg) scale(1); opacity: 0.35; }
    }
    .loading-text {
      display: inline-block;
      min-width: 100px;
      animation: loadingPulse 2.4s ease-in-out infinite;
      font-style: italic;
      color: #8a8270;
      letter-spacing: 0.02em;
      margin-left: 6px;
    }
    @keyframes loadingPulse {
      0%, 100% { opacity: 0.35; }
      50%      { opacity: 0.75; }
    }

    /* ═══════════════════════════════════════════════
       IDLE STATE - total stillness when nothing is running
       ═══════════════════════════════════════════════ */
    .ledger-idle .log-line.latest::before {
      display: none;
    }
    .ledger-idle .log-line.latest .log-icon {
      filter: none;
      opacity: 0.72;
    }
    .ledger-idle .log-dots {
      display: none;
    }
    .ledger-idle .log-icon {
      opacity: 0.6;
    }

    /* ═══════════════════════════════════════════════
       CLICKABLE LINKS - clean affordances, no motion.

       Critical: links explicitly set -webkit-text-fill-color and
       background-clip to 'initial'/'currentColor' so that if any parent
       ever uses a gradient-clip trick, links stay solid and never
       flicker. This is the fix for the "link flashing" bug the user
       reported - the root cause was a shimmer on a parent span cascading
       into anchors. We burn the exemption in at the element level so no
       future regression can reintroduce it.
       ═══════════════════════════════════════════════ */
    .log-link {
      cursor: pointer;
      transition: color 160ms ease,
                  background-color 160ms ease,
                  border-color 160ms ease,
                  text-decoration-color 160ms ease;
      user-select: text;
      -webkit-user-select: text;
      -webkit-text-fill-color: currentColor;
      background-clip: initial;
      -webkit-background-clip: initial;
    }

    /* URL links - ink blue with offset underline. Hover brightens the
       text, thickens and extends the underline, adds a soft glow halo
       behind the text. No flicker, no pulse - the motion is only on
       hover, as a deliberate user-driven acknowledgement. */
    .log-link-url {
      color: #8ab6d2;
      text-decoration: underline;
      text-decoration-color: rgba(138, 182, 210, 0.42);
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
      font-weight: 500;
      transition: color 180ms ease,
                  text-decoration-color 180ms ease,
                  text-decoration-thickness 180ms ease,
                  text-shadow 180ms ease;
    }
    .log-link-url:hover {
      color: #cfe6f5;
      text-decoration-color: #cfe6f5;
      text-decoration-thickness: 2px;
      text-shadow: 0 0 10px rgba(138, 182, 210, 0.55);
    }
    .log-link-url:active {
      color: #a8c4da;
    }

    /* Code links (backticked paths/commands) - warm parchment pill.
       Hover lifts the pill slightly with a soft drop shadow and
       brightens the text. Active presses the pill back down.
       The combined hover + active feels tactile. */
    .log-link-code {
      display: inline-block;
      color: #b8ac8a;
      background: linear-gradient(180deg, rgba(184, 172, 138, 0.08), rgba(184, 172, 138, 0.12));
      border: 1px solid rgba(184, 172, 138, 0.25);
      border-radius: 3px;
      padding: 1px 6px;
      margin: 0 1px;
      font-weight: 500;
      transition: color 180ms ease,
                  background 180ms ease,
                  border-color 180ms ease,
                  box-shadow 180ms ease,
                  transform 180ms ease;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25),
                  inset 0 1px 0 rgba(255, 240, 200, 0.04);
    }
    .log-link-code:hover {
      color: #f0e6c8;
      background: linear-gradient(180deg, rgba(212, 175, 55, 0.18), rgba(184, 140, 60, 0.22));
      border-color: rgba(212, 175, 55, 0.55);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45),
                  0 0 10px rgba(212, 175, 55, 0.25),
                  inset 0 1px 0 rgba(255, 240, 200, 0.12);
      transform: translateY(-1px);
    }
    .log-link-code:active {
      background: rgba(212, 175, 55, 0.28);
      border-color: rgba(212, 175, 55, 0.7);
      box-shadow: 0 0 0 rgba(0, 0, 0, 0),
                  inset 0 1px 3px rgba(0, 0, 0, 0.4);
      transform: translateY(1px);
      transition-duration: 60ms;
    }

    /* ═══════════════════════════════════════════════
       COPY TOAST - brief confirmation, gold on black
       ═══════════════════════════════════════════════ */
    .log-copy-toast {
      position: fixed;
      bottom: 28px;
      right: 28px;
      background: rgba(10, 12, 20, 0.95);
      color: #d4af37;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 2px;
      padding: 9px 16px;
      border: 1px solid rgba(212, 175, 55, 0.42);
      border-radius: 3px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
      z-index: 999999;
      pointer-events: none;
      opacity: 1;
      transition: opacity 320ms ease;
    }
    .log-copy-toast.fade { opacity: 0; }

    /* ═══════════════════════════════════════════════
       HOVER ON HISTORICAL LINES - aid for re-reading
       When the audit is long and the user scrolls back, hovering a
       historical line subtly lifts it with a faint parchment
       highlight. Makes it easier to track the line your eye is on
       without creating any ambient motion.
       ═══════════════════════════════════════════════ */
    .log-line:not(.latest):not(.log-loading):hover {
      background: rgba(212, 175, 55, 0.04);
      transition: background 140ms ease;
    }

    /* ═══════════════════════════════════════════════
       REDUCED MOTION - respect the user's system preference.
       Keeps the typewriter cursor (carries content). Freezes every
       ceremony, every halo, every orbit. The ledger is fully
       readable, just static.
       ═══════════════════════════════════════════════ */
    @media (prefers-reduced-motion: reduce) {
      .log-line,
      .log-line.glow,
      .log-line.skill.glow,
      .log-line.complete.glow,
      .log-line.fix.glow,
      .log-line.error:not(.latest).glow,
      .log-line.demon.glow,
      .log-line.score.glow {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
        text-shadow: none !important;
        letter-spacing: 0.015em !important;
      }
      .log-line.skill.glow .log-icon,
      .log-line.complete.glow .log-icon,
      .log-line.fix.glow .log-icon,
      .log-line.demon.glow .log-icon {
        animation: none !important;
        filter: none !important;
        transform: none !important;
      }
      .log-line.complete.glow::before,
      .log-line.error.glow::before,
      .log-line.user.glow::after {
        display: none !important;
      }
      .log-dots .dot {
        animation: none !important;
        opacity: 0.45 !important;
        transform: none !important;
      }
      .log-line.latest.active-output .log-text {
        animation: none !important;
        background-image: none !important;
        background-clip: initial !important;
        -webkit-background-clip: initial !important;
        -webkit-text-fill-color: currentColor !important;
        text-shadow: none !important;
      }
      .loading-rune,
      .loading-rune::before {
        animation: none !important;
      }
      .loading-text {
        animation: none !important;
        opacity: 0.6 !important;
      }
      .sep-dot {
        animation: none !important;
        opacity: 0.7 !important;
      }
    }
  `;
  document.head.appendChild(style);

  logEl.innerHTML = '';
}

function trimLog() {
  while (logEl.children.length > 300) {
    logEl.removeChild(logEl.firstChild);
  }
}

export function addLog(msg, options = {}) {
  if (!msg || !logEl) return;

  let clean = msg.replace(/[\n\r]+/g, ' ').trim();
  if (!clean || clean.length < 2) return;
  if (clean === '[working...]') return;
  if (clean.startsWith('{') && clean.endsWith('}') && clean.includes('":"')) return;
  if (clean.startsWith('[{') && clean.includes('":"')) return;
  if (/^`{3}\w*$/.test(clean)) return;  // markdown code fences (```json, ```)
  if (clean === '```') return;

  const cls = classify(clean);
  if (options.immediate || cls === 'user') {
    flushLogQueue();
    appendInstantLine(clean, cls);
    trimLog();
    return;
  }

  queue.push({ text: clean, cls });

  trimLog();

  processQueue();
}

export function showLoadingIndicator() {
  showLoading();
  if (logEl) logEl.classList.remove('ledger-idle');
}

export function hideLoadingIndicator() {
  hideLoading();
  if (latestLine) latestLine.classList.remove('active-output');
  if (logEl) logEl.classList.add('ledger-idle');
}

export const __activityLogTestHooks = Object.freeze({
  classify,
  typingTickBatchSize,
});
