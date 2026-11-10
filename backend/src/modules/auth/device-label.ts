/**
 * A short, human name for the device a sign-in came from, for Settings →
 * Devices. The apps say it themselves (`X-Device: Samsung SM-A515F · Android 13`);
 * for the website it's read from the browser's user agent ("Chrome on Windows").
 */
export function deviceLabel(input: { device?: string | null; userAgent?: string | null; client?: string | null }): string {
  const said = [...(input.device ?? '')].filter((ch) => ch.charCodeAt(0) >= 32).join('').trim();
  if (said) return said.slice(0, 80);
  const ua = input.userAgent ?? '';
  if (input.client === 'android' || input.client === 'ios' || /^Dart\//.test(ua)) return input.client === 'ios' ? 'iPhone' : 'Android phone';
  return browserLabel(ua);
}

export function browserLabel(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Web browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? /iPad/.test(ua)
        ? 'iPad'
        : 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'Chromebook'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return os ? `${browser} on ${os}` : browser;
}
