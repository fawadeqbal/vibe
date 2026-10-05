#!/usr/bin/env node
// Checks that the TURN server works with the API's settings.
//
//   npm run turn:check                  # uses STUN_URLS / TURN_URLS / TURN_SECRET from .env
//   npm run turn:check -- turns:turn.example.com:443?transport=tcp   # just this address
//
// For every TURN address it makes the same short-lived login the API gives
// the app, asks the server for a relay (a TURN "Allocate"), then frees it.
// A ✓ means: the server is reachable on that port, the secret matches, and it
// hands out relays. No dependencies; plain Node 18+.
import { createHmac, createHash, randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 5000;
const COOKIE = 0x2112a442;
const T = { BINDING: 0x0001, ALLOCATE: 0x0003, REFRESH: 0x0004 };
const A = {
  MAPPED: 0x0001, USERNAME: 0x0006, INTEGRITY: 0x0008, ERROR: 0x0009, LIFETIME: 0x000d, REALM: 0x0014,
  NONCE: 0x0015, RELAYED: 0x0016, TRANSPORT: 0x0019, XOR_MAPPED: 0x0020, FINGERPRINT: 0x8028,
};

// ── settings ────────────────────────────────────────────────────────────────

function loadDotEnv() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^["']/.test(v)) v = v.slice(1, v.indexOf(v[0], 1));
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };
const list = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const stunUrls = only.length ? only.filter((u) => u.startsWith('stun')) : list(env.STUN_URLS ?? 'stun:stun.l.google.com:19302');
const turnUrls = only.length ? only.filter((u) => u.startsWith('turn')) : list(env.TURN_URLS);
const secret = env.TURN_SECRET ?? '';
const ttl = Number(env.TURN_TTL_SECONDS ?? 86400);

// Same scheme as rtc.controller.ts: username = expiry:userId, password = base64(hmac-sha1(secret, username)).
const username = `${Math.floor(Date.now() / 1000) + ttl}:turn-check`;
const password = createHmac('sha1', secret).update(username).digest('base64');

function parseUrl(url) {
  const m = url.match(/^(stuns?|turns?):(\[[^\]]+\]|[^:?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/i);
  if (!m) throw new Error(`can't read "${url}" (expected e.g. turn:turn.example.com:3478?transport=udp)`);
  const scheme = m[1].toLowerCase();
  const secure = scheme.endsWith('s');
  return { url, scheme, host: m[2].replace(/^\[|\]$/g, ''), port: Number(m[3] ?? (secure ? 5349 : 3478)), transport: secure ? 'tls' : (m[4] ?? 'udp').toLowerCase() };
}

// ── STUN messages ───────────────────────────────────────────────────────────

const pad4 = (n) => (n + 3) & ~3;

function attr(type, value) {
  const b = Buffer.alloc(4 + pad4(value.length));
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(value.length, 2);
  value.copy(b, 4);
  return b;
}

function message(type, attrs, auth) {
  const id = randomBytes(12);
  let body = Buffer.concat(attrs);
  const header = (len) => {
    const h = Buffer.alloc(20);
    h.writeUInt16BE(type, 0);
    h.writeUInt16BE(len, 2);
    h.writeUInt32BE(COOKIE, 4);
    id.copy(h, 8);
    return h;
  };
  if (auth) {
    // MESSAGE-INTEGRITY covers everything before it, with the length already counting it.
    const key = createHash('md5').update(`${auth.username}:${auth.realm}:${auth.password}`).digest();
    const mac = createHmac('sha1', key).update(Buffer.concat([header(body.length + 24), body])).digest();
    body = Buffer.concat([body, attr(A.INTEGRITY, mac)]);
  }
  return { id, buf: Buffer.concat([header(body.length), body]) };
}

function parse(buf) {
  const type = buf.readUInt16BE(0);
  const len = buf.readUInt16BE(2);
  const attrs = new Map();
  for (let o = 20; o + 4 <= 20 + len; ) {
    const t = buf.readUInt16BE(o);
    const l = buf.readUInt16BE(o + 2);
    if (!attrs.has(t)) attrs.set(t, buf.subarray(o + 4, o + 4 + l));
    o += 4 + pad4(l);
  }
  return { type, id: buf.subarray(8, 20), attrs };
}

function xorAddress(v) {
  if (!v) return null;
  const family = v[1];
  const port = v.readUInt16BE(2) ^ (COOKIE >>> 16);
  if (family === 1) {
    const ip = (v.readUInt32BE(4) ^ COOKIE) >>> 0;
    return `${ip >>> 24}.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}:${port}`;
  }
  return `[ipv6]:${port}`;
}

/** RFC 1918 / CGNAT / loopback / link-local: not reachable from the internet. */
function isPrivateIp(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = p;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254);
}

const errorOf = (msg) => {
  const v = msg.attrs.get(A.ERROR);
  return v ? { code: v[2] * 100 + v[3], reason: v.subarray(4).toString() } : null;
};

// ── transports ──────────────────────────────────────────────────────────────

/** Opens a connection and returns send(msg) → Promise<response>. */
async function connect(target) {
  const pending = new Map();
  const deliver = (buf) => {
    const msg = parse(buf);
    const key = msg.id.toString('hex');
    pending.get(key)?.(msg);
    pending.delete(key);
  };
  let write;
  let close;
  if (target.transport === 'udp') {
    const sock = dgram.createSocket(net.isIPv6(target.host) ? 'udp6' : 'udp4');
    sock.on('message', deliver);
    sock.on('error', () => {});
    write = (buf) => sock.send(buf, target.port, target.host);
    close = () => sock.close();
  } else {
    const sock = await new Promise((resolve, reject) => {
      const s = target.transport === 'tls'
        ? tls.connect({ host: target.host, port: target.port, servername: net.isIP(target.host) ? undefined : target.host }, () => resolve(s))
        : net.connect({ host: target.host, port: target.port }, () => resolve(s));
      s.setTimeout(TIMEOUT_MS, () => s.destroy(new Error(`no answer on ${target.transport.toUpperCase()} port ${target.port} (firewall closed, or nothing listening)`)));
      s.once('error', reject);
    });
    sock.setTimeout(0);
    sock.on('error', () => {});
    let buffered = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 20) {
        const size = 20 + buffered.readUInt16BE(2);
        if (buffered.length < size) break;
        deliver(buffered.subarray(0, size));
        buffered = buffered.subarray(size);
      }
    });
    write = (buf) => sock.write(buf);
    close = () => sock.destroy();
  }
  const send = ({ id, buf }) =>
    new Promise((resolve, reject) => {
      const key = id.toString('hex');
      let tries = 0;
      const timer = setInterval(() => {
        // UDP can drop packets: resend a few times before giving up.
        if (target.transport === 'udp' && ++tries < 4) return write(buf);
        clearInterval(timer);
        pending.delete(key);
        reject(new Error(`no answer on ${target.transport.toUpperCase()} port ${target.port} (firewall closed, or nothing listening)`));
      }, target.transport === 'udp' ? TIMEOUT_MS / 4 : TIMEOUT_MS);
      pending.set(key, (msg) => {
        clearInterval(timer);
        resolve(msg);
      });
      write(buf);
    });
  return { send, close };
}

// ── checks ──────────────────────────────────────────────────────────────────

async function checkStun(url) {
  const target = parseUrl(url);
  const conn = await connect(target);
  try {
    const res = await conn.send(message(T.BINDING, []));
    return `your public address is ${xorAddress(res.attrs.get(A.XOR_MAPPED)) ?? '?'}`;
  } finally {
    conn.close();
  }
}

async function checkTurn(url) {
  const target = parseUrl(url);
  const conn = await connect(target);
  const transport = attr(A.TRANSPORT, Buffer.from([17, 0, 0, 0])); // relay over UDP, like browsers/phones
  try {
    let res = await conn.send(message(T.ALLOCATE, [transport]));
    let err = errorOf(res);
    if (err?.code !== 401) throw new Error(err ? `server said ${err.code} ${err.reason}` : 'server gave a relay without asking for a password (open relay!)');
    let auth = { username, password, realm: res.attrs.get(A.REALM)?.toString() ?? '' };
    const withAuth = (extra = []) => [...extra, attr(A.USERNAME, Buffer.from(auth.username)), attr(A.REALM, Buffer.from(auth.realm)), attr(A.NONCE, auth.nonce)];
    auth.nonce = res.attrs.get(A.NONCE);
    res = await conn.send(message(T.ALLOCATE, withAuth([transport]), auth));
    err = errorOf(res);
    if (err?.code === 438) {
      auth.nonce = res.attrs.get(A.NONCE);
      res = await conn.send(message(T.ALLOCATE, withAuth([transport]), auth));
      err = errorOf(res);
    }
    if (err?.code === 401) throw new Error('password rejected: TURN_SECRET here differs from the one in turn/.env (or the server clock is badly off)');
    if (err?.code === 486) throw new Error('quota reached for this user (486); try again in a minute');
    if (err) throw new Error(`server said ${err.code} ${err.reason}`);
    const relay = xorAddress(res.attrs.get(A.RELAYED));
    const mapped = xorAddress(res.attrs.get(A.XOR_MAPPED));
    // Free the relay straight away.
    await conn.send(message(T.REFRESH, withAuth([attr(A.LIFETIME, Buffer.from([0, 0, 0, 0]))]), auth)).catch(() => null);
    // The relay address is handed to the other phone as-is: a private one (cloud VM without
    // external-ip) can't be reached from the internet, so every relayed call silently fails.
    if (relay && isPrivateIp(relay.slice(0, relay.lastIndexOf(':')))) {
      throw new Error(`relay ${relay} is a PRIVATE address, phones can't reach it. Set TURN_EXTERNAL_IP=<public ip>/<private ip> in turn/.env and recreate coturn`);
    }
    return `relay ${relay}${mapped ? ` (you are ${mapped})` : ''}`;
  } finally {
    conn.close();
  }
}

// ── main ────────────────────────────────────────────────────────────────────

const rows = [];
let failed = 0;
const run = async (url, fn) => {
  try {
    rows.push(`  ✓ ${url}\n      ${await fn(url)}`);
  } catch (e) {
    failed++;
    const msg = e.code === 'ENOTFOUND' ? `domain not found (DNS): ${e.hostname}` : e.code === 'ECONNREFUSED' ? 'connection refused (nothing listening on that port)' : e.message;
    rows.push(`  ✗ ${url}\n      ${msg}`);
  }
};

console.log('Vibe TURN check\n');
for (const u of stunUrls) await run(u, checkStun);
if (!turnUrls.length) {
  rows.push('  ! TURN_URLS is empty: calls between different networks will often fail. See turn/README.md');
  failed++;
} else if (!secret) {
  rows.push('  ! TURN_SECRET is empty: set it in .env (same value as in turn/.env)');
  failed++;
} else {
  for (const u of turnUrls) await run(u, checkTurn);
}
console.log(rows.join('\n'));
console.log(failed ? `\n${failed} problem(s) found.` : '\nAll good: the TURN server works with these settings.');
process.exit(failed ? 1 : 0);
