/* Speed: date, time and number formatting.
   `date.toLocaleDateString([], {...})` builds a brand-new formatter on every call, which is slow enough to
   matter when a screen formats hundreds of times and dates. This keeps one formatter per option set and
   reuses it. The text that comes out is identical. Loaded before everything else. */
(() => {
  'use strict';
  if (!window.Intl || !Intl.DateTimeFormat || !Intl.NumberFormat) return;
  const cache = new Map();
  const fmt = (Ctor, tag, locales, options) => {
    let key;
    try { key = tag + JSON.stringify(locales ?? null) + JSON.stringify(options ?? null); } catch { return null; }
    let f = cache.get(key);
    if (!f) { f = new Ctor(locales == null || (Array.isArray(locales) && !locales.length) ? undefined : locales, options); cache.set(key, f); }
    return f;
  };
  const has = (o, keys) => o && typeof o === 'object' && keys.some((k) => o[k] !== undefined);
  const DATE = ['weekday', 'year', 'month', 'day'], TIME = ['hour', 'minute', 'second'];
  const wrap = (name, ok) => {
    const orig = Date.prototype[name];
    Date.prototype[name] = function (locales, options) {
      // Only when the options name the parts outright, so the built-in defaults never come into play.
      if (ok(options) && !Number.isNaN(this.getTime())) { try { const f = fmt(Intl.DateTimeFormat, 'd', locales, options); if (f) return f.format(this); } catch { /* fall through */ } }
      return orig.call(this, locales, options);
    };
  };
  wrap('toLocaleDateString', (o) => has(o, DATE) && !has(o, ['dateStyle', 'timeStyle']));
  wrap('toLocaleTimeString', (o) => has(o, TIME) && !has(o, ['dateStyle', 'timeStyle']));
  wrap('toLocaleString', (o) => has(o, DATE) && has(o, TIME) && !has(o, ['dateStyle', 'timeStyle']));
  const numOrig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locales, options) {
    try { const f = fmt(Intl.NumberFormat, 'n', locales, options); if (f) return f.format(this); } catch { /* fall through */ }
    return numOrig.call(this, locales, options);
  };
})();
