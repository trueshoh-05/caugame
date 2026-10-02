import en from '../data/text/en.json';

type Dict = Record<string, unknown>;
const modules = import.meta.glob('../data/text/*.json', { eager: true }) as Record<string, { default: Dict }>;
const langs: Record<string, Dict> = {};
for (const [path, m] of Object.entries(modules)) {
  const code = path.split('/').pop()!.replace('.json', '');
  langs[code] = m.default;
}

export const LANGS = ['en', 'ru', 'uz'].filter((l) => langs[l]);
export const LANG_NAMES: Record<string, string> = { en: 'English', ru: 'Русский', uz: 'Oʻzbekcha' };
let current = 'en';

export function setLang(code: string): void { current = langs[code] ? code : 'en'; }
export function getLang(): string { return current; }

function lookup(dict: Dict | undefined, path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as Dict)) node = (node as Dict)[part];
    else return undefined;
  }
  return node;
}

/** Raw value for a key in the current language, falling back to English. */
export function raw<T = unknown>(path: string): T {
  const v = lookup(langs[current], path);
  return (v === undefined ? lookup(en as Dict, path) : v) as T;
}

/** Translated string with {placeholders} filled in. Missing keys show the key itself. */
export function t(path: string, vars: Record<string, string | number> = {}): string {
  const v = raw<unknown>(path);
  const s = typeof v === 'string' ? v : path;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
