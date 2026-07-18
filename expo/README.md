# PunchThis (Expo app)

Native cross-platform site-audit app — Expo Router + React Native.

**Identity:** iOS/Android `com.punchthis.app` · URL scheme `punchthis` · Expo slug `punchthis`

## Local development

Run commands from this `expo/` folder (not the repository root):

```bash
bun i
bun run start        # Expo dev server
bun run start-web    # Web preview
bun run test
bun run typecheck
bun run lint
bun run build:web
```

## Upgrade note

Changing bundle ID / Android package / URL scheme is a **new app install** on devices that previously used a different app identity. Existing local data does not migrate across that identity change — export first (Settings → Export all data). See `docs/launch/DECISIONS.md` (L17).
