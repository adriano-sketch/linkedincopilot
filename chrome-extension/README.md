# LinkedIn Copilot — Chrome Extension

## Setup

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode** (top right)
3. Click **"Load unpacked"**
4. Select the `chrome-extension` folder from this project

## Usage

1. Click the extension icon in Chrome toolbar
2. Log in with your LinkedIn Copilot email and password
3. Open a LinkedIn tab — the extension starts working automatically
4. It polls the action queue every 30 seconds and executes pending actions

## How it works

- **Background worker** (`background.js`): Polls the `action_queue` table, manages safety limits, sends heartbeats
- **Content script** (`content.js`): Executes LinkedIn actions (visit, follow, connect, like, DM) with human-like behavior
- **Popup** (`popup.html/js/css`): Login UI and status dashboard

## Architecture

The extension is a **dumb executor** — it doesn't decide anything. All intelligence (ICP checks, lead selection, message generation) lives in the backend. The extension just receives "go to this URL, type this text, click this button" and executes.

## Safety Features

- **Passive actions** (visit profile, follow, like post): Run **24/7** — no day/hour restrictions. These are invisible to the lead and maximize pipeline throughput.
- **Messaging actions** (connection request, DM, follow-up): Restricted to **configured business hours** (default Mon-Fri, 8h-18h). Sent during work hours to appear natural and improve response rates.
- Daily limits: 40 connections, 100 messages, 80 visits, 200 total
- 7-day warm-up period at 30% capacity
- 15-90s random delays between actions
- Human-like typing (30-80ms per character with pauses)
- Auto-pause on LinkedIn warnings (24h cooldown)

## Keeping Your Computer Awake

The extension needs Chrome running to work. If your computer sleeps, actions stop.

### macOS (Recommended: Amphetamine)

**[Amphetamine](https://apps.apple.com/app/amphetamine/id937984704)** (free, Mac App Store) is the most reliable option — it prevents sleep even with the MacBook lid closed, without needing an external monitor.

Alternatively, run in Terminal:
```bash
sudo pmset -a sleep 0 disksleep 0 displaysleep 10 womp 1 powernap 0
caffeinate -s &
```

### Windows
```cmd
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
```

See the **Setup Guide** in the app (Settings → Setup Guide) for full instructions.
