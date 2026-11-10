import { browserLabel, deviceLabel } from './device-label';

describe('device names (Settings → Devices)', () => {
  it('uses what the app says, else reads the browser', () => {
    expect(deviceLabel({ device: 'Samsung SM-A515F · Android 13', client: 'android' })).toBe('Samsung SM-A515F · Android 13');
    expect(deviceLabel({ userAgent: 'Dart/3.5 (dart:io)' })).toBe('Android phone');
    expect(deviceLabel({ client: 'ios' })).toBe('iPhone');
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows');
    expect(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(browserLabel('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(browserLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('Firefox on Mac');
    expect(browserLabel('curl/8.0')).toBe('Web browser');
  });
});
