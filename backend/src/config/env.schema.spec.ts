import { checkIceConfig } from './env.schema';

const secret = 'a'.repeat(64);
const base = { STUN_URLS: 'stun:stun.l.google.com:19302', TURN_URLS: '', TURN_SECRET: '' };

describe('checkIceConfig', () => {
  it('accepts no TURN, or TURN with a secret', () => {
    expect(checkIceConfig(base)).toEqual([]);
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn:turn.example.com:3478?transport=udp, turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp', TURN_SECRET: secret })).toEqual([]);
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn:203.0.113.7,turn:[2001:db8::1]:3478', TURN_SECRET: secret })).toEqual([]);
  });

  it('catches the mistakes that would silently break calls', () => {
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn:turn.example.com:3478' })).toEqual(['TURN_URLS is set but TURN_SECRET is empty (use the same secret as turn/.env)']);
    expect(checkIceConfig({ ...base, TURN_SECRET: secret })).toEqual(['TURN_SECRET is set but TURN_URLS is empty']);
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn:x.com', TURN_SECRET: 'short' })[0]).toMatch(/at least 32/);
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn.example.com:3478', TURN_SECRET: secret })[0]).toMatch(/not a valid turn:/);
    expect(checkIceConfig({ ...base, TURN_URLS: 'https://turn.example.com', TURN_SECRET: secret })).toHaveLength(1);
    expect(checkIceConfig({ ...base, TURN_URLS: 'turn:turn.example.com:3478?transport=quic', TURN_SECRET: secret })).toHaveLength(1);
    expect(checkIceConfig({ ...base, STUN_URLS: 'stun.l.google.com:19302' })[0]).toMatch(/STUN_URLS/);
  });
});
