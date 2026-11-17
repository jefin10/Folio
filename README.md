# Folio

A personal financial operating system: one double-entry ledger behind an Android app, a web app and a Galaxy Watch app. Built for a single owner (personal use).

Live: **https://folio.example.com**, self-hosted on a small EC2 box as its own ~100 MiB stack.

## What's in it

| | |
|---|---|
| **Ledger engine** (`packages/core`) | Exact `bigint` paise, double-entry postings that always sum to zero. Transfers, card payments, loans, refunds, splits and reimbursements are distinct events, so nothing is ever double-counted. Net worth = assets + receivables − liabilities − payables (credit limits are never assets). |
| **Accounts** | Savings/current/salary, FD/RD, cash, wallets, credit/debit/secured cards, BNPL, every loan type, custom types. Catalog of ~90 Indian banks, issuers, wallets and NBFCs (names and brand colours); upload any bank's logo yourself. |
| **Spending** | One-tap add with "type it" parsing (`10000 groceries on elite, parents owe 7000`), multi-person splits, personal-share maths, duplicate warnings, offline outbox. |
| **Reimbursements** | Per-person claims and settlements; one payment can settle many purchases and vice versa; never counted as income. |
| **Obligations** | EMIs (auto principal/interest split, amortisation), subscriptions, bills, rent, card autopay. Tracked and reminded, **never auto-paid**; each due date can be confirmed exactly once. |
| **Cards** | Utilisation, statement cycle, minimum due, rewards and fees, statement history, CSV import and reconciliation. |
| **Insight** | Customisable dashboard, cash flow, income vs spending, categories, CSV/JSON export, audit trail, correction history. |
| **Phone** | Expo SDK 58 / React Native 0.88, NeoPOP-style UI (CRED's open-source design language), carousels, haptics, biometric lock, home-screen widgets, bill reminders, watch bridge. |
| **Watch** | Kotlin + Compose for Wear OS: quick add with keypad or voice, today's spend, dues, owed-to-you, balances, offline queue, Tile, two complications. |

## Repository

```
packages/core     ledger engine, money/dates, recurring, loans, cards, reconciliation, voice parser (+ tests)
packages/api      Supabase data layer, React Query hooks, offline outbox, device unlock (+ tests)
supabase/         migrations (schema, ledger RPCs, RLS, single-owner lock, files, device auth) + SQL tests
apps/web          Next.js 16 static export + Tailwind 4
apps/mobile       Expo Router app, native watch-bridge module (modules/folio-wear), widgets
apps/wear         Wear OS app (Gradle, Kotlin, Compose) + unit tests
deploy/           slim self-hosted stack, Caddyfile, migrate/backup scripts, folio.sh helper
```

## How sign-in works

There is no sign-in screen. A new device asks **once** for the owner passphrase, then keeps its session (phone: Android Keystore-encrypted storage) and unlocks with **fingerprint / device PIN** (phone) or optionally the platform authenticator (web). The passphrase lives only on the server. 8 wrong passphrases in 15 minutes, from anywhere, lock all sign-ins for 15 minutes. Public sign-up is disabled and the database refuses a second owner.

```bash
deploy/folio.sh passphrase      # change it (existing devices stay signed in)
```
"Sign out other devices" is in Settings on both phone and web.

## Server (self-hosted, slim)

`postgres:17-alpine` + GoTrue (auth) + PostgREST (API) + one Caddy image serving the static site + Cloudflare tunnel + nightly `pg_dump` (14 kept, `~/folio/deploy/backups`). No Realtime (apps refresh on focus, reconnect and every ~20 s while visible) and no Storage service (logos/artwork/PDFs live in a size-capped, RLS-protected table).

```bash
deploy/folio.sh init         # first time: sync, generate secrets on the server, create the tunnel
deploy/folio.sh up           # sync + build the site ON THE SERVER + apply migrations
deploy/folio.sh status | logs [svc] | backup | anon-key
deploy/folio.sh check        # disposable copy on the server's 127.0.0.1:18090 for tests; check-down removes it
```
Secrets are generated on the server into `~/folio/deploy/.env` (mode 600) and never leave it. Everything runs as its own compose project `folio`; nothing is shared with other apps on the machine.

**Using Supabase Cloud instead:** create a project, `npx supabase db push` the migrations, set the env vars below, and create the owner (`owner@folio.invalid` + your passphrase) under Authentication → Users. Turn off sign-ups.

### Environment

| Where | Variable |
|---|---|
| web build | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set by the deploy) |
| phone (`apps/mobile/.env`) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`deploy/folio.sh anon-key`) |
| server `.env` | `SITE_URL, POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, FOLIO_SINGLE_OWNER, DISABLE_SIGNUP, COMPOSE_PROFILES` (generated) |

## Android app

The PC is low on RAM, so the release build runs in a capped scope (4.5 GB, no swap, 1 worker, arm64 only) with a watchdog. JDK 17 is required (the shell default is Java 8).

```bash
cd apps/mobile
npx expo prebuild --platform android --clean --no-install
cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleRelease \
  --no-daemon --max-workers=1 -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.jvmargs="-Xmx2g -XX:MaxMetaspaceSize=512m" -Pkotlin.compiler.execution.strategy=in-process
adb install -r app/build/outputs/apk/release/app-release.apk
```
The release APK embeds the JS bundle (no Metro needed). Widgets: long-press the home screen → Widgets → Folio.

## Wear OS app

It must share the phone's application id (`app.folio.android`) **and signing key** (it signs with `apps/mobile/android/app/debug.keystore`) or the Data Layer won't pair them.

```bash
cd apps/wear
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew testDebugUnitTest assembleRelease --no-daemon --max-workers=1
# Galaxy Watch: Settings → Developer options → ADB debugging + Debug over Wi-Fi, then
adb connect <watch-ip>:5555 && adb -s <watch-ip>:5555 install -r app/build/outputs/apk/release/app-release.apk
```
Add the Folio Tile from the watch's tile list, and the "Today's spend" / "Spendable" complications from a watch face's edit screen.

## Tests

```bash
pnpm --filter @folio/core test          # ledger, money, dates, recurring, loans, cards, reconciliation, dedupe, import, voice, edit round-trips
pnpm --filter @folio/api test           # outbox, error mapping, base64; live round-trip when FOLIO_IT_URL/FOLIO_IT_ANON_KEY are set
bash supabase/tests/run.sh              # all migrations on Postgres 16 + SQL assertions as real `authenticated` users (RLS on)
cd apps/wear && ./gradlew testDebugUnitTest
```

## Known limitations

- No bank sync. Statements are recorded manually or imported from netbanking CSV; PDFs are stored, not parsed.
- No push updates between devices; refresh is polling (~20 s while visible) plus focus/reconnect.
- The phone keeps no financial data on disk beyond the encrypted offline outbox and a small widget/watch summary, so browsing needs a connection (adding works offline).
- Both apps are signed with the shared debug key: fine for sideloading, not for the Play Store.
- Watch voice entry uses the watch's system speech recogniser.
