// Test environment: separate database and Redis db, fixed OTP, no pretty logs.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://vibe:vibe@127.0.0.1:5432/vibe_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-123';
process.env.OTP_FIXED_CODE = '1234';
process.env.LOG_LEVEL = 'error';
process.env.SWAGGER_ENABLED = 'false';
process.env.RATE_LIMIT_PER_MINUTE = '10000';
process.env.UPLOAD_DIR = '/tmp/vibe-test-uploads';
// A TURN relay is configured so the ICE endpoint hands out credentials.
process.env.TURN_URLS = 'turn:turn.test:3478?transport=udp,turns:turn.test:5349?transport=tcp';
process.env.TURN_SECRET = 'test-turn-secret-0123456789abcdef0123456789';
