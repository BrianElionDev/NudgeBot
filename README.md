## NudgeBot

Desktop notification demo that listens to sources and pushes Windows/macOS toasts.

### Prerequisites

- Node.js 18+ (ESM enabled)
- Windows 10/11 for toast customization notes below

### Install

```bash
npm install
```

### Run (Demo Source)

```bash
npm start
```

This will emit a few demo notifications at an interval and then stop.

### Environment variables

- `DEMO_INTERVAL_MS` (default: 8000)
- `DEMO_MAX_MESSAGES` (default: 5)
- `NOTIFIER_SOUND` ("true" | "false" | sound name) — default true
- `NOTIFIER_APP_ID` (Windows) — custom app label for the toast header (e.g., `NudgeBot`)
- `NOTIFIER_ICON` (Windows) — absolute path to `.ico`/`.png` used as the toast icon

Example (PowerShell):

```powershell
$env:NOTIFIER_SOUND = "false"
$env:DEMO_MAX_MESSAGES = "3"
$env:DEMO_INTERVAL_MS = "8000"
$env:NOTIFIER_APP_ID = "NudgeBot"
$env:NOTIFIER_ICON = "E:\\Web Development\\BrianElionDev\\NudgeBot\\public\\bell.png"
npm start
```

### Project Structure

```
src/
  core/
    logger.js       # Winston logger
    notifier.js     # Wrapper around node-notifier
  sources/
    demo.js         # Fake messages → notifications
main.js             # Starts demo source and handles shutdown
```

### Windows Toasts: app name and icons

- Small badge icon (near the title) is tied to the app identity.
- Main notification image is set via `NOTIFIER_ICON`.
- To customize the small badge:
  1. Create a Start Menu shortcut (.lnk) for this app.
  2. Set AppUserModelID to the same value used in `NOTIFIER_APP_ID`.
  3. Set the shortcut icon to your `.ico`.
  4. Place the shortcut in `%AppData%\Microsoft\Windows\Start Menu\Programs\`.

Emoji note: Windows toast icon must be an image file, not an emoji. Put emojis in the title/body text instead.

### Discord integration (optional)

The project includes a placeholder `src/sources/discord.js`. For a real bot, you would:

- Install `discord.js`
- Provide `DISCORD_TOKEN`
- Start a Discord client and forward messages to `pushNotification`

### License

ISC
