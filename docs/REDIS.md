# Redis for Local Development

This project uses Redis for background job processing (BullMQ). The following describes how to run Redis locally for development and how CI uses Redis for tests.

## Local development

1. Start Redis with Docker Compose:

   ```bash
   docker-compose up -d redis
   ```

2. Set the environment variable used by the app:

   - `REDIS_URL` (e.g., `redis://127.0.0.1:6379`)

3. Verify Redis is reachable:

   ```bash
   redis-cli -h 127.0.0.1 ping
   # should return PONG
   ```

## CI

The GitHub Actions workflow `ci-redis.yml` starts a Redis service so tests that depend on Redis can run. The workflow sets `REDIS_URL=redis://127.0.0.1:6379` before running tests.

## Notes

- For production, use a managed Redis instance (e.g., AWS ElastiCache) and secure access with VPC and authentication.
- After switching to BullMQ, the app will rely on `REDIS_URL` to connect to Redis.
