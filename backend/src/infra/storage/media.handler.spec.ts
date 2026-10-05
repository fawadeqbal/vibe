import { isServableKey } from './media.handler';

describe('isServableKey', () => {
  it('serves normal public keys', () => {
    expect(isServableKey('avatars/u1/1791198544238.jpg')).toBe(true);
  });

  it.each(['', 'private/selfies/u1/1.jpg', '../etc/passwd', 'avatars/../private/x', 'avatars//x', './x', 'avatars/'])('refuses %p', (key) => {
    expect(isServableKey(key)).toBe(false);
  });
});
