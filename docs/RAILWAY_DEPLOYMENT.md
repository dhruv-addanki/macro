# Railway Deployment

Macro deploys to Railway as two services in one project:

1. `Macro API`: public Fastify API connected to this GitHub repository.
2. `Postgres`: private Railway PostgreSQL database.

Supabase and S3 are not required for this deployment. Meal images are compressed
by the mobile app, sent to the API for OpenAI analysis, and discarded.

## Repository configuration

The root [`railway.json`](../railway.json) configures:

- Railpack builds from the monorepo root.
- Prisma Client generation during the build.
- `prisma migrate deploy` before each API deployment.
- The Fastify production start command.
- `/health` deployment health checks.
- Restart-on-failure and graceful deployment draining.

Keep the Railway service root directory at the repository root. The API depends
on the root Prisma schema and the `packages/shared` npm workspace.

## Create the Railway project

1. In the existing Railway Hobby workspace, create a project named `Macro`.
2. Add a service from the `dhruv-addanki/macro` GitHub repository.
3. Name that service `Macro API`.
4. If Railway stages a mobile service automatically, remove it. Expo/TestFlight
   is built through EAS, not hosted as a Railway service.
5. Add Railway PostgreSQL and keep the service name `Postgres`.
6. Do not generate a public domain or TCP proxy for Postgres. If a TCP proxy
   already exists, remove it so only project-private networking is used.

## Configure Macro API variables

Paste the values from [`railway.env.example`](../railway.env.example) into the
`Macro API` Variables tab, then replace `OPENAI_API_KEY`.

The database reference must remain:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Do not set `PORT`; Railway injects it. Do not add Supabase or AWS variables.

Production intentionally uses:

```env
MACRO_STORE_DRIVER=prisma
MACRO_AUTH_DRIVER=local
MACRO_ALLOW_DEMO_USER=false
MACRO_SEED_DEMO_USER=false
MACRO_PHOTO_STORAGE_DRIVER=disabled
```

The API fails at startup if production is missing Postgres/OpenAI configuration
or tries to use ephemeral local photo storage.

## Deploy and verify

1. Deploy `Macro API`.
2. In `Macro API` Settings, generate a Railway public domain.
3. Open `https://YOUR_DOMAIN/health`.
4. Confirm the response includes:

```json
{
  "ok": true,
  "service": "macro-api",
  "openaiConfigured": true,
  "authDriver": "local",
  "photoStorageDriver": "disabled",
  "persistence": {
    "driver": "prisma",
    "pending": false,
    "lastError": null
  }
}
```

The pre-deploy command applies committed Prisma migrations before the new API
container starts.

## Configure the TestFlight build

Use the generated Railway HTTPS domain in the Expo production environment:

```env
EXPO_PUBLIC_API_URL=https://YOUR_DOMAIN
EXPO_PUBLIC_AUTH_DRIVER=local
EXPO_PUBLIC_ENABLE_DEMO_AUTH=false
EXPO_PUBLIC_ENABLE_PHOTO_RETENTION=false
```

These are build-time variables. Rebuild the TestFlight binary after changing
them.

Each tester should use **Sign up** with a different email. The returned session
token is persisted in Expo SecureStore, so each installation keeps its own
backend identity. The shared demo button and unauthenticated demo fallback are
disabled in production.

Local auth is passwordless and suitable only for the controlled beta. Before a
public release, add password or passkey authentication and account recovery.

## Operations

- Enable daily and weekly backups from the Postgres service `Backups` tab.
- Set a workspace usage alert or hard limit because the Hobby allowance is
  shared with other Railway projects.
- Keep Postgres private; only `Macro API` needs a public domain.
- Check deployment logs after migrations and before shipping a new TestFlight
  build.
