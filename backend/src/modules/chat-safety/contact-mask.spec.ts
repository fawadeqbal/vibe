import { completesNumber, fragmentDigits, maskContacts, MASK, tokenDigits } from './contact-mask';

const masked = (t: string, links = false) => maskContacts(t, { links }).text;

describe('contact mask', () => {
  describe('hides phone numbers, however they are written', () => {
    it.each([
      ['my number is 03001234567', 'my number is ****'],
      ['0300 1234567', '****'],
      ['call 0300-123-4567 after 9', 'call **** after 9'],
      ['+92 300 1234567', '****'],
      ['923001234567 whatsapp karo', '**** whatsapp karo'],
      ['03OO 12345 67', '****'],
      ['0 3 0 0 1 2 3 4 5 6 7', '****'],
      ['۰۳۰۰۱۲۳۴۵۶۷ pe msg karo', '**** pe msg karo'],
      ['zero three zero zero one two three four five six seven', '****'],
      ['sifar teen sifar sifar aik do teen char panch chay saat', '****'],
      ['(0300) 123.45.67 ok?', '**** ok?'],
    ])('%s', (input, out) => {
      expect(masked(input)).toBe(out);
      expect(maskContacts(input).hidden).toContain('phone');
    });
  });

  describe('hides handles, chat-app links and e-mails', () => {
    it.each([
      ['add me on insta ali.khan22 😊', 'add me on insta **** 😊', 'social'],
      ['snap id: ali_22', 'snap id: ****', 'social'],
      ['my ig is sara.k', 'my ig is ****', 'social'],
      ['follow @ali.khan', 'follow ****', 'social'],
      ['wa.me/923001234567', '****', 'social'],
      ['join https://t.me/alikhan now', 'join **** now', 'social'],
      ['instagram.com/ali.khan', '****', 'social'],
      ['ali@gmail.com', '****', 'email'],
      ['email me ali (at) gmail dot com', 'email me ****', 'email'],
      ['ali at gmail.com', '****', 'email'],
    ])('%s', (input, out, kind) => {
      expect(masked(input)).toBe(out);
      expect(maskContacts(input).hidden).toContain(kind);
    });
  });

  describe('leaves ordinary messages alone', () => {
    it.each([
      'hi! how are you?',
      'I am 23, from Lahore',
      'ticket was 500 rupees, Rs 1,500,000 for the car',
      'match tomorrow at 7:30, Pakistan 250/3',
      'born 04/11/2001',
      'I studied 2018-2022',
      'class of 2025 2026',
      'one to one is better',
      'insta is fun but tiktok is better',
      'I want to go for a walk',
      'call me at 9',
      'my score was 98.5%',
      'see you at 5.30',
      'room 1203, floor 4',
      'top 10 songs of 2024',
      'meet you at cafe.com tomorrow',
    ])('%s', (input) => {
      expect(maskContacts(input)).toEqual({ text: input, hidden: [] });
    });
  });

  it('only hides other links on random calls', () => {
    expect(masked('check example.com/page')).toBe('check example.com/page');
    expect(masked('check example.com/page', true)).toBe(`check ${MASK}`);
    expect(masked('see https://site.io/x and www.foo.pk', true)).toBe(`see ${MASK} and ${MASK}`);
  });

  it('keeps what is around the hidden part', () => {
    expect(masked('hey 03001234567 and ali@gmail.com, bye')).toBe('hey **** and ****, bye');
    expect(masked('call 0300 1234567, or text')).toBe('call ****, or text');
    expect(masked('it is 03001234567.')).toBe('it is ****.');
  });

  it('reads tokens', () => {
    expect(tokenDigits('03OO-12')).toBe('030012');
    expect(tokenDigits('seven')).toBe('7');
    expect(tokenDigits('۰۳')).toBe('03');
    expect(tokenDigits('OOO')).toBeNull();
    expect(tokenDigits('1st')).toBeNull();
  });

  it('catches a number sent a few digits at a time', () => {
    expect(fragmentDigits('0300')).toBe('0300');
    expect(fragmentDigits('123 45')).toBe('12345');
    expect(fragmentDigits('call 0300')).toBeNull();
    expect(completesNumber('', '0300')).toBe(false);
    expect(completesNumber('0300', '12')).toBe(false);
    expect(completesNumber('0300', '123')).toBe(true);
  });
});
