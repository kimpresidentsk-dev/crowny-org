# CLAUDE.md — CROWNY Platform

## Project Overview

CROWNY is a full-stack Progressive Web Application (PWA) — an all-in-one platform combining wallet, trading, marketplace, social networking, art, and wellness features. The primary language is Korean with 31-language i18n support.

**Tagline:** "Protecting Beauty, Empowering Safety"

**Platform categories:** Finance, Social, Shopping

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript (no build tool/bundler) |
| Backend | Google Firebase (Firestore, Auth, Storage, Messaging) |
| Serverless API | Vercel Functions (`/api/market/`) |
| Blockchain | Polygon (ERC-20), Web3.js 4.16.0, Thirdweb SDK |
| Icons | Lucide Icons 0.469.0 (CDN) |
| Charts | Lightweight Charts 4.2.0 (CDN) |
| Deployment | Vercel (static + serverless) |
| PWA | Service workers, offline support, push notifications |

**All frontend dependencies are loaded via CDN** — the only npm dependency is `firebase-admin` (used by serverless functions). There is no build step, no bundler, no transpilation.

---

## Directory Structure

```
crowny-org/
├── index.html                 # Main SPA entry point (all pages)
├── admin.html                 # Admin panel
├── style.css                  # Legacy main stylesheet
├── script.js                  # Legacy entry script
├── manifest.json              # PWA manifest
├── firebase.json              # Firebase config (rules, indexes)
├── firestore.rules            # Firestore security rules
├── firestore.indexes.json     # Firestore composite indexes
├── storage.rules              # Firebase Storage rules
├── vercel.json                # Vercel deployment config (headers, rewrites, caching)
├── package.json               # Minimal — only firebase-admin
├── sw.js                      # Main service worker
├── firebase-messaging-sw.js   # FCM service worker
├── pre-push-check.sh          # Git pre-push validation
├── api/
│   └── market/
│       ├── price.js           # NQ futures real-time price (Databento)
│       └── history.js         # NQ historical OHLCV data (Databento)
├── js/                        # Feature modules (~41 files)
│   ├── config.js              # Global config, token contracts, risk mgmt
│   ├── i18n.js                # Internationalization system
│   ├── ui.js                  # UI utilities, modals, toasts
│   ├── auth.js                # Authentication (email, Google OAuth)
│   ├── wallet.js              # Multi-wallet, ERC-20, AES encryption
│   ├── offchain.js            # Off-chain token balances (CRGC)
│   ├── e2e-crypto.js          # End-to-end encryption
│   ├── social.js              # Social feed, messaging, presence
│   ├── friends.js             # Friend management
│   ├── stories.js             # Stories feature
│   ├── explore.js             # Discovery/explore
│   ├── group-chat.js          # Group chat channels
│   ├── send.js                # Token send/transfer
│   ├── trading.js             # NQ futures trading engine
│   ├── marketplace.js         # E-commerce platform
│   ├── books.js               # Book marketplace & royalties
│   ├── app-art.js             # Art marketplace
│   ├── care.js                # Beauty care & wellness tracking
│   ├── beauty-manager.js      # Beauty management tools
│   ├── movement.js            # Fitness/movement tracking
│   ├── ai-assistant.js        # AI assistant features
│   ├── ai-social.js           # AI social features
│   ├── admin.js               # Admin dashboard
│   ├── dashboard.js           # User dashboard
│   ├── dashboard-emergency.js # Emergency dashboard
│   ├── business.js            # Business management
│   ├── artist.js              # Artist profiles
│   ├── brain.js               # AI brain/learning
│   ├── mentor-learning.js     # Mentor system
│   ├── mentors.js             # Mentor profiles
│   ├── notifications.js       # Unified notifications
│   ├── shortform.js           # Short-form video
│   ├── slogans.js             # Slogan management
│   ├── invite.js              # Referral/invite system
│   ├── search.js              # Search functionality
│   ├── translate.js           # Translation utilities
│   ├── settings.js            # User settings
│   ├── menu-visibility.js     # Menu visibility control
│   ├── pwa.js                 # PWA features
│   ├── landing.js             # Landing page
│   └── seed-data.js           # Data seeding utilities
├── css/                       # Modular stylesheets
│   ├── base.css               # Base styles, typography
│   ├── home.css               # Home page
│   ├── wallet.css             # Wallet UI
│   ├── social.css             # Social feed
│   ├── messenger.css          # Messenger/chat
│   ├── trading.css            # Trading UI
│   ├── ai.css                 # AI features
│   ├── care.css               # Care/wellness
│   ├── dark.css               # Dark mode overrides
│   ├── components.css         # Shared components
│   ├── mobile.css             # Mobile responsive
│   └── settings.css           # Settings page
├── lang/                      # i18n JSON files (31 languages)
│   ├── ko.json, en.json, zh.json, ja.json, es.json, ...
├── img/                       # Images & icons
│   └── icons/                 # PWA icons (192x192, 512x512)
└── scripts/                   # Build/deploy scripts
```

---

## Architecture

### Single-Page Application (SPA)

All pages live in `index.html`. Client-side routing uses `showPage(pageId)` to toggle visibility of page sections. Vercel rewrites all non-asset routes to `index.html`.

### Module Loading Order

Scripts load sequentially in `index.html`:

1. CDN libraries (Lucide, Firebase, Web3, Lightweight Charts)
2. `js/i18n.js` — loads active language JSON
3. `js/config.js` — global state, token contracts, risk parameters
4. `js/ui.js` — modal/toast helpers
5. `js/auth.js` — authentication
6. `js/wallet.js` — wallet management
7. `js/offchain.js` — off-chain balances
8. `js/e2e-crypto.js` — encryption
9. `js/social.js` — social core
10. Remaining feature modules

### Global State

Key globals available on `window`:

- `window.auth` — Firebase Auth instance
- `window.db` — Firestore instance
- `currentUser` — logged-in user object
- `userWallet` — user's wallet data
- `currentLang` — active language code (default: browser language or `'ko'`)

### Firebase Configuration

- **Project:** `crowny-84b84`
- **Auth:** Email/password + Google OAuth
- **Database:** Firestore (document model)
- **Storage:** Firebase Storage (user uploads, images)
- **Messaging:** Firebase Cloud Messaging (push notifications)

---

## Key Modules

### Authentication (`js/auth.js`)
Email/password signup with nickname, Google OAuth, email verification, password reset, referral code system, password strength checker.

### Wallet (`js/wallet.js`)
Multi-wallet support, AES-GCM encrypted private keys (Web Crypto API, PBKDF2 600K iterations), ERC-20 balance queries for CRNY/FNC/CRFN on Polygon, MetaMask integration.

### Trading (`js/trading.js`)
NQ (Nasdaq-100) futures trading with real-time WebSocket price feed, risk management (daily loss limit: -$500, cumulative: -$3,000), prop trading challenges (CRTD system), Lightweight Charts integration, $2/round-trip fee.

### Marketplace (`js/marketplace.js`)
Product listings across categories (Present, Doctor, Medical, AVLs, Solution, Architect, Crowny Mall, Designers), shopping cart, order lifecycle (paid → shipping → delivered), returns/refunds, reviews.

### Social (`js/social.js`)
User profiles, presence tracking (isOnline/lastSeen), social feed with posts/comments, friend management, AI bot comment automation.

### Care (`js/care.js`)
Beauty care tracking, skin photo analysis, care group management, SOS alert system, movement tracking.

### i18n (`js/i18n.js`)
31 supported languages. Auto-detects from browser. Manual switching persisted to localStorage. Fallback to Korean. Usage: `t('key.subkey', 'default text')`.

---

## Token System

| Token | Type | Description |
|-------|------|-------------|
| CRNY | ERC-20 (Polygon) | Main platform token |
| FNC | ERC-20 (Polygon) | Utility token |
| CRFN | ERC-20 (Polygon) | Combined token |
| CRGC | Off-chain | Platform credit |
| CRTD | Virtual | Prop trading balance |

---

## Database Schema (Firestore)

### Core Collections

- `users/{userId}` — User profiles, with subcollections: wallets, contacts, friends, followers, following, savedPosts, skin_photos, brain_results, movement_progress, movement_log, skin_analyses, pendingRewards
- `chats/{chatId}` — Direct messages (participants array, messages subcollection)
- `channels/{channelId}` — Group chat channels (messages subcollection)
- `posts/{postId}` — Social posts (comments subcollection)
- `products/{productId}` — Marketplace listings
- `orders/{orderId}` — Purchase orders (buyer/seller access)
- `transactions/{txId}` — Transaction records
- `notifications/{notifId}` — User notifications

### Feature Collections

- `artworks/{artworkId}`, `books/{bookId}`, `artists/{artistId}` — Creative content
- `businesses/{businessId}`, `campaigns/{campaignId}` — Business features
- `shortform_videos/{videoId}` — Short-form video content
- `care_groups/{groupId}`, `sos_alerts/{alertId}` — Wellness features
- `challenges/{challengeId}`, `prop_challenges/{challengeId}` — Trading challenges
- `friend_requests/{reqId}`, `stories/{storyId}` — Social features
- `offchain_transactions/{txId}` — Off-chain token transactions
- `bot_profiles/{botId}`, `admin_config/{docId}` — Admin-managed

### Security Rules

- **Default:** DENY all access
- **Auth required** for all reads/writes
- **Owner-only writes:** users, posts, products, artworks, books, stories, shortform_videos
- **Admin levels:** Level 2 (skin analysis), Level 3 (artists, businesses, orders), Level 5 (bot profiles, admin config)
- Rules defined in `firestore.rules`

---

## API Endpoints

### Vercel Serverless Functions (`/api/market/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market/price` | GET | Latest NQ futures price (Databento) |
| `/api/market/history` | GET | NQ OHLCV historical data (supports 1m, 5m, 1h, 1d timeframes) |

**Required environment variable:** `DATABENTO_API_KEY`

---

## Development Workflow

### Prerequisites

- Node.js (for `firebase-admin` in serverless functions)
- A modern browser (Chrome/Edge recommended for PWA testing)
- Firebase project access (for Firestore rules deployment)
- Vercel CLI (for local API function testing)

### Local Development

There is **no build step**. To develop locally:

1. Serve the root directory with any static file server
2. For API functions, use `vercel dev` to run serverless functions locally
3. Set `DATABENTO_API_KEY` environment variable for market data API

### Deploying

- **Frontend + API:** Push to the connected Vercel project (auto-deploys)
- **Firestore rules:** Use Firebase CLI: `firebase deploy --only firestore:rules`
- **Storage rules:** Use Firebase CLI: `firebase deploy --only storage`

### Pre-push Checks

`pre-push-check.sh` validates that critical files exist before push:
- `index.html` must be present
- `js/social.js` must be present

### No Formal Test Framework

There is no automated test suite. `test-i18n.html` provides manual i18n testing. Validate changes manually in the browser.

---

## Caching Strategy (Vercel)

| Path | Cache Policy |
|------|-------------|
| `sw.js`, `firebase-messaging-sw.js` | `no-cache, no-store, must-revalidate` |
| `/js/*`, `/img/*` | 1 year (`immutable`, cache-busted via `?v=`) |
| `/lang/*` | 1 hour |

---

## Conventions for AI Assistants

### Code Style

- **No build tools** — Write plain JavaScript that runs directly in the browser
- **No ES modules** — Scripts are loaded via `<script>` tags in `index.html`; functions/variables are global or attached to `window`
- **Korean comments** — Most code comments are in Korean; maintain this convention
- **Lucide icons** — Use Lucide icon names (not emoji) for UI icons. Legacy emoji is being migrated to Lucide
- **i18n strings** — All user-facing text should use `t('key.subkey', 'default')` with translations in `/lang/*.json`

### Firestore Patterns

```javascript
// Read a document
const doc = await db.collection('users').doc(uid).get();
const data = doc.data();

// Write a document
await db.collection('users').doc(uid).set({ ... });

// Real-time listener
db.collection('posts').onSnapshot(snap => {
  snap.docs.forEach(doc => { ... });
});

// Batch writes
const batch = db.batch();
batch.set(ref1, data1);
batch.update(ref2, data2);
await batch.commit();
```

### Security Considerations

- **Never expose** `service-account.json` (listed in `.gitignore`)
- **Private keys** are AES-GCM encrypted — never store plaintext keys
- Firestore security rules enforce owner-only access; respect this pattern
- Admin level checks (2, 3, 5) gate privileged operations
- API keys in `index.html` are Firebase client-side keys (safe to expose)
- `DATABENTO_API_KEY` is a server-side secret — use only in `/api/` functions

### File Naming

- Feature modules: `js/<feature-name>.js` (kebab-case)
- Stylesheets: `css/<feature-name>.css` (kebab-case)
- Language files: `lang/<iso-code>.json` (ISO 639-1)
- Backup files: `*.bak`, `*.backup` suffixes (manual versioning, do not modify)

### Adding New Features

1. Create `js/<feature>.js` with feature logic
2. Create `css/<feature>.css` if needed
3. Add `<script src="js/<feature>.js">` to `index.html` (order matters)
4. Add page section to `index.html` if the feature has its own page
5. Add i18n keys to `lang/ko.json` first, then propagate to other languages
6. Add Firestore rules to `firestore.rules` if new collections are needed
7. Register the page in `showPage()` routing if applicable

### Common Pitfalls

- **Script load order matters** — modules depend on globals set by earlier scripts (especially `config.js`, `ui.js`, `auth.js`)
- **Large file sizes** — Some modules are very large (marketplace.js: 240KB, admin.js: 228KB, social.js: 181KB, trading.js: 160KB). Be mindful of context when reading these files; use targeted searches rather than reading entire files
- **Backup files** — The `js/` directory contains `.bak` and `.backup` files. These are manual version snapshots — do not delete or modify them
- **No TypeScript** — The project is pure JavaScript; do not introduce TypeScript
- **No package manager dependencies for frontend** — All browser libraries are loaded via CDN in `index.html`

### Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `DATABENTO_API_KEY` | Vercel env | Market data API authentication |
| Firebase config | Hardcoded in `index.html` | Client-side Firebase SDK init |
| Thirdweb `clientId` | Hardcoded in `index.html` | NFT/Web3 features |

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `crowny_lang` | Active language code |
| `notif_settings` | Notification preferences |
| `crowny_invite_code` | Referral/invite code |
