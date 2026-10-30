import { clientKind } from './client-kind';

describe('clientKind', () => {
  it('trusts X-Client, then knows the old app by its Dart user agent, else web', () => {
    expect(clientKind({ 'x-client': 'android/0.1.5' })).toBe('android');
    expect(clientKind({ 'x-client': 'iOS/1.0.0' })).toBe('ios');
    expect(clientKind({ 'x-client': 'web' })).toBe('web');
    expect(clientKind({ 'user-agent': 'Dart/3.5 (dart:io)' })).toBe('android');
    expect(clientKind({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })).toBe('web');
    expect(clientKind({ 'x-client': 'toaster', 'user-agent': 'curl/8' })).toBe('web');
    expect(clientKind({})).toBe('web');
  });
});
