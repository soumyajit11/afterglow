# Afterglow — Watch Party

For browser-only access from outside your Wi-Fi while your laptop remains the server, see [TUNNEL.md](TUNNEL.md). It includes the public tunnel launcher, verification command, and bandwidth limits.

A React + Express + Socket.IO movie room. Upload one MP4, share a private link, and play, pause or seek together. Videos travel over normal HTTP (with byte range requests); Socket.IO sends the much smaller playback messages. Each friend streams their own copy from your server.

## Run on your computer

Install Node.js 22.12+ (Node 24 works), then open a terminal in this folder:

```powershell
npm install
npm run dev
```

Open http://localhost:5173. Create a room, upload a movie, enter your name, and copy its invite link. Use two browser tabs to try synchronized controls. Each browser may require a click to allow video playback. Volume is personal; the room shares playback controls.

For a production build:

```powershell
npm run build
npm start
```

Open http://localhost:3001. The Express server now serves the frontend and the video/API/socket endpoints together.

## Supported movies

Use `.mp4` with **H.264 video and AAC audio**. MP4 is a container; an MP4 containing HEVC or another unsupported codec may fail in some browsers. Upload checks validate extension, container signature, and size, not every frame or codec. Default limit: 2048 MB. For efficient seeking, use an MP4 with its metadata at the beginning (`faststart`). If you already have FFmpeg, convert with:

```text
ffmpeg -i input.mkv -c:v libx264 -c:a aac -movflags +faststart movie.mp4
```

## How synchronization works

The server owns a playback position, timestamp, and play/pause state for each room. It sends a full snapshot on join, reconnect, controls, and every two seconds. Clients correct drift above 0.8 seconds. This is approximate synchronization, not frame-perfect playback; slow networks and browser autoplay rules can delay a viewer.

When a connected viewer reports buffering, the server pauses everyone and remembers that playback should resume. It resumes when every connected viewer is ready. A manual Pause cancels that automatic resume. Disconnecting viewers stop blocking the room; reconnecting viewers receive current state. When the last viewer leaves, the room pauses. Everyone with the link can control playback.

Videos and rooms persist in `storage/`. The server checkpoints the position every ten seconds and when controls change. After a restart, rooms open paused at the last saved position. Room IDs contain 192 bits of random data and act as secret access tokens. There is no public room list. Anyone holding a link can view its movie: share it only with people you intend to invite.

## Hosting and sharing with friends

`localhost` means the viewer's own computer, so a localhost link cannot reach your computer from the internet. Deploy this project to a host that runs a **long-lived Node process**, supports **WebSockets**, accepts large uploads, and provides a **persistent disk**. Static-only hosting cannot run this server. Short-lived serverless functions are unsuitable for the current design.

1. Use one server instance; room state and participants live in memory. Multiple instances require a shared database and Socket.IO adapter first.
2. Run `npm ci` and `npm run build` during deployment; start with `npm start`.
3. Mount a persistent disk and set `STORAGE_DIR` to its absolute path. Keep it outside `dist`. Back up both the MP4 files and `rooms.json`. Temporary container disks lose uploads on redeploy.
4. Set `PORT` if your host requires it, and optionally `MAX_UPLOAD_MB`. Put HTTPS in front of the server. A reverse proxy must forward the original Host and WebSocket upgrade headers. Increase its upload body limit and upload timeouts to match your movies. The frontend uses same-origin URLs; no separate API domain is needed.
5. Open the deployed HTTPS URL, upload a movie, and share its room link. Test with two devices on different networks.

Example Windows configuration:

```powershell
$env:PORT="3001"
$env:STORAGE_DIR="D:\watch-party-data"
$env:MAX_UPLOAD_MB="2048"
npm start
```

Disk capacity and outgoing bandwidth matter: five viewers each streaming a 4 Mbps movie need roughly 20 Mbps of server upload bandwidth. The MVP retains rooms and videos until an administrator removes their entries/files while the server is stopped. There is no automatic expiry, account system, upload quota, or moderation. Before opening uploads to the general public, put authentication, rate limits, disk quotas and cleanup in front of room creation. Only upload films you are allowed to share. No hosting purchase or public deployment has been made.

## Checks

```powershell
npm test
npm run build
```

Tests cover playback snapshots and integration behavior including uploads, access, byte ranges, buffering, late joins, reconnects and persistence. Actual codec decoding and autoplay behavior need a real browser and a compatible movie.
