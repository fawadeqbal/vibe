// One-shot bootstrap for the vibe-storage (Garage) container, run by the
// `vibe-storage-init` service on every `docker compose up`. Idempotent: it only
// does what is missing, so redeploys are no-ops.
//
//   1. give the single node a role in the cluster layout and apply it
//   2. create the public and private buckets
//   3. import the API's access key (from .env) and grant it both buckets
//
// Talks to Garage's admin API v2 (port 3903) with GARAGE_ADMIN_TOKEN.
// Plain Node 22, no dependencies.

const ADMIN = process.env.GARAGE_ADMIN_URL ?? "http://vibe-storage:3903";
const TOKEN = need("GARAGE_ADMIN_TOKEN");
const KEY_ID = need("S3_ACCESS_KEY_ID");
const KEY_SECRET = need("S3_SECRET_ACCESS_KEY");
const BUCKETS = [need("S3_BUCKET"), process.env.S3_PRIVATE_BUCKET].filter(Boolean);
const CAPACITY = Number(process.env.GARAGE_CAPACITY_GB ?? 100) * 1e9;

function need(name) {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith("CHANGE_ME")) fail(`${name} is not set`);
  return v;
}

function fail(msg) {
  console.error(`[storage-init] ${msg}`);
  process.exit(1);
}

const log = (msg) => console.log(`[storage-init] ${msg}`);

async function call(method, path, body) {
  const res = await fetch(`${ADMIN}/v2/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function waitForGarage() {
  for (let i = 0; i < 60; i++) {
    try {
      return await call("GET", "GetClusterStatus");
    } catch (e) {
      if (e.status === 401 || e.status === 403) fail("GARAGE_ADMIN_TOKEN was refused");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fail(`Garage admin API at ${ADMIN} did not answer within 60s`);
}

async function ensureLayout(status) {
  const node = status.nodes.find((n) => n.isUp) ?? status.nodes[0];
  if (node.role) return log(`layout ok (v${status.layoutVersion})`);
  await call("POST", "UpdateClusterLayout", { roles: [{ id: node.id, zone: "dc1", capacity: CAPACITY, tags: ["vibe"] }] });
  const layout = await call("GET", "GetClusterLayout");
  await call("POST", "ApplyClusterLayout", { version: layout.version + 1 });
  log(`layout applied: node ${node.id.slice(0, 16)} in dc1`);
}

async function ensureKey() {
  try {
    await call("GET", `GetKeyInfo?id=${encodeURIComponent(KEY_ID)}`);
    return log("access key ok");
  } catch (e) {
    if (e.status !== 404 && e.status !== 400) throw e;
  }
  await call("POST", "ImportKey", { accessKeyId: KEY_ID, secretAccessKey: KEY_SECRET, name: "vibe-api" });
  log("access key imported");
}

async function ensureBucket(alias) {
  const buckets = await call("GET", "ListBuckets");
  let bucket = buckets.find((b) => b.globalAliases?.includes(alias));
  if (!bucket) {
    bucket = await call("POST", "CreateBucket", { globalAlias: alias });
    log(`bucket ${alias} created`);
  }
  await call("POST", "AllowBucketKey", {
    bucketId: bucket.id,
    accessKeyId: KEY_ID,
    permissions: { read: true, write: true, owner: true },
  });
  log(`bucket ${alias} ok`);
}

// Layout changes take a moment to propagate before buckets accept writes.
async function retry(fn, tries = 10) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

try {
  await ensureLayout(await waitForGarage());
  await retry(ensureKey);
  for (const b of BUCKETS) await retry(() => ensureBucket(b));
  log("done");
} catch (e) {
  fail(e.message);
}
