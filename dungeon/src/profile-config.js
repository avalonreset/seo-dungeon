export const PROFILE_KEYS = ['deep', 'balanced', 'fast'];
const DANGEROUS_BYPASS_KEY = 'seo_dungeon_yolo_mode';
let consumedDangerousBypassUrl = false;

export const RUNTIME_LABELS = {
  codex: {
    name: 'Codex',
    profiles: {
      deep: { label: 'XHIGH', detail: 'deep audit' },
      balanced: { label: 'HIGH', detail: 'balanced' },
      fast: { label: 'MEDIUM', detail: 'quick pass' },
    },
  },
  claude: {
    name: 'Claude',
    profiles: {
      deep: { label: 'OPUS', detail: 'deep audit' },
      balanced: { label: 'SONNET', detail: 'balanced' },
      fast: { label: 'HAIKU', detail: 'quick pass' },
    },
  },
  gemini: {
    name: 'Gemini',
    profiles: {
      deep: { label: 'PRO', detail: 'deep audit' },
      balanced: { label: 'FLASH', detail: 'balanced' },
      fast: { label: 'FLASH-LITE', detail: 'quick pass' },
    },
  },
};

export function normalizeRuntime(value) {
  const key = String(value || '').trim().toLowerCase();
  return RUNTIME_LABELS[key] ? key : 'codex';
}

export function setSelectedRuntime(value) {
  const runtime = normalizeRuntime(value);
  try { localStorage.setItem('seo_dungeon_runtime', runtime); } catch (_) {}
  window.selectedRuntime = runtime;
  return runtime;
}

export function getSelectedRuntime() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = normalizeRuntime(params.get('runtime'));
  if (params.has('runtime')) {
    return setSelectedRuntime(fromUrl);
  }

  try {
    return setSelectedRuntime(localStorage.getItem('seo_dungeon_runtime'));
  } catch (_) {
    return setSelectedRuntime('codex');
  }
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  const key = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'yolo', 'danger'].includes(key);
}

export function setDangerousBypassEnabled(value) {
  const enabled = normalizeBoolean(value);
  try { localStorage.setItem(DANGEROUS_BYPASS_KEY, enabled ? '1' : '0'); } catch (_) {}
  window.seoDungeonDangerousBypass = enabled;
  if (window.selectedCharacter) window.selectedCharacter.dangerousBypass = enabled;
  try {
    window.dispatchEvent(new CustomEvent('seo-dungeon-dangerous-bypass-change', { detail: { enabled } }));
  } catch (_) {}
  return enabled;
}

export function getDangerousBypassEnabled() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('yolo') ?? params.get('dangerousBypass') ?? params.get('danger');
  if (!consumedDangerousBypassUrl && fromUrl != null) {
    consumedDangerousBypassUrl = true;
    return setDangerousBypassEnabled(fromUrl);
  }

  try {
    return setDangerousBypassEnabled(localStorage.getItem(DANGEROUS_BYPASS_KEY));
  } catch (_) {
    return setDangerousBypassEnabled(false);
  }
}

export function getProfileLabel(profileKey, runtime = getSelectedRuntime()) {
  const cfg = RUNTIME_LABELS[normalizeRuntime(runtime)] || RUNTIME_LABELS.codex;
  return cfg.profiles[profileKey] || cfg.profiles.balanced;
}

export function getProfileKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (PROFILE_KEYS.includes(normalized)) return normalized;
  if (normalized === 'opus') return 'deep';
  if (normalized === 'sonnet') return 'balanced';
  if (normalized === 'haiku') return 'fast';
  return 'balanced';
}
