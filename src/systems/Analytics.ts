import config from '../data/analytics.json';

/**
 * Anonymous counting with GoatCounter: page visits, plus a few game events so we can see how
 * far players get (e.g. "game/stage-fail/engineering_physics/final"). No names, no cookies.
 * Only active on the public site; never in development, tests (?debug) or a file:// copy.
 */
type GC = { count: (v: { path: string; title?: string; event?: boolean }) => void };

const enabled = typeof location !== 'undefined' && config.hosts.includes(location.hostname) && !/[?&]debug\b/.test(location.search);
const queue: { path: string; title?: string }[] = [];
const sent = new Set<string>();

function gc(): GC | undefined { return (window as unknown as { goatcounter?: GC }).goatcounter; }

function flush(): void {
  const g = gc();
  if (!g?.count) return;
  for (const e of queue.splice(0)) g.count({ path: e.path, title: e.title ?? e.path, event: true });
}

export const Analytics = {
  enabled,
  /** Load the counter; it records the page visit itself. */
  init(): void {
    if (!enabled) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = config.script;
    s.dataset.goatcounter = config.endpoint;
    s.onload = flush;
    document.head.appendChild(s);
  },
  /** Count a game event, e.g. event('stage-clear', courseId, 'midterm'). `once` = at most once per page load. */
  event(name: string, ...parts: (string | number)[]): void {
    if (!enabled) return;
    const path = ['game', name, ...parts].join('/');
    queue.push({ path });
    flush();
  },
  once(name: string, ...parts: (string | number)[]): void {
    const key = [name, ...parts].join('/');
    if (sent.has(key)) return;
    sent.add(key);
    Analytics.event(name, ...parts);
  },
};
