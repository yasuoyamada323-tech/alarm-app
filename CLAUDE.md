# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step or dependencies. Open `index.html` directly in a browser:

```bash
# Quick local server (Python)
python3 -m http.server 8080
# then open http://localhost:8080
```

The Web Audio API requires a user gesture before playing sound, which browsers enforce at runtime — no workaround in code.

## Architecture

Vanilla JS/CSS/HTML with no framework or bundler. Three files:

- **`index.html`** — static markup; all interactive elements have IDs targeted by `app.js`
- **`app.js`** — all logic; runs a single `setInterval` tick every 1 s that updates the clock and checks whether `alarmTime` matches the current `HH:MM`
- **`style.css`** — dark-theme styling; `body.ringing` and `.status.ringing` are toggled by JS to trigger CSS animations when the alarm fires

### State in `app.js`

| Variable | Type | Meaning |
|---|---|---|
| `alarmTime` | `string \| null` | Set time as `"HH:MM"`, `null` when no alarm is active |
| `audioCtx` | `AudioContext \| null` | Lazily created on first beep; reused across beeps |
| `beepInterval` | interval ID \| `null` | Non-null only while the alarm is ringing |

The alarm fires when `alarmTime !== null && hhmm === alarmTime && !beepInterval` inside the clock tick. `beepInterval` acts as a "currently ringing" guard to prevent re-triggering within the same minute.
