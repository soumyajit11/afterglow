# Public access from your laptop

The laptop remains the movie server. Friends need only a browser and the HTTPS room link. Keep the laptop awake, connected to the internet, and both the app and tunnel running. No router port forwarding is needed.

## Provider and capacity

This setup uses the official ngrok agent. A provider account and auth token are required. Free service is useful for a connection test, not a full movie night: the current free plan advertises up to 1 GB transfer and displays a provider notice before HTML pages. Your existing movie is about 629 MB; two complete remote views alone require about 1.26 GB, before seeking or overhead. Check your dashboard allowance before inviting viewers. No purchase is made by these scripts.

Official sources: https://ngrok.com/pricing and https://ngrok.com/use-cases/share-localhost. Cloudflare's free tunnel is not selected for this movie server because its video delivery restrictions require an appropriate paid service: https://developers.cloudflare.com/tunnel/concepts/routing/.

## One-time setup (on your computer)

1. Download the Windows agent from https://ngrok.com/download and follow its official installation instructions. Make `ngrok.exe` available on your PATH.
2. Sign in at https://dashboard.ngrok.com. Follow the dashboard's local `ngrok config add-authtoken` instruction in your own terminal. **Keep this token private; do not send it in chat or commit it.**

## Start and share

In this project folder, terminal 1:

```powershell
npm start
```

If the app is already running on port 3001, keep that instance running instead of starting another. Terminal 2:

```powershell
npm run tunnel
```

The agent displays `Forwarding https://... -> http://127.0.0.1:3001`. Open that HTTPS address on your computer, then open your room under the same address. The existing room path is:

```text
/room/wPFsCwyIQYkCMfmXXRww4Vh1N4Fyfaq3
```

Click **Copy invite link** on that public page. The app copies the current page URL, so it uses the public domain rather than localhost. Friends may see ngrok's service notice first and then the room. Never add `--host-header=rewrite`: the server checks the Origin against Host for HTTP and Socket.IO. The launcher preserves the public Host and turns off agent request inspection. No wildcard CORS or untrusted forwarded-header bypass is enabled.

Verify in terminal 3, substituting the real HTTPS domain:

```powershell
npm run check:public -- https://YOUR-TUNNEL-DOMAIN wPFsCwyIQYkCMfmXXRww4Vh1N4Fyfaq3
```

This checks the public React room page, room API, 16-byte video range response, WebSocket handshake, and authoritative room state. It briefly joins as “Connection check”; avoid running it during an active screening. It does not download the full movie or verify browser codec decoding. Then test the link from a phone with Wi-Fi turned off, join, and try play/pause with another viewer.

## Stop and restart

Press Ctrl+C in terminal 2 to stop public access. Press Ctrl+C in terminal 1 to stop the app. Uploaded movies and rooms remain in `storage/`. Run the same commands to restart and use the HTTPS URL displayed by the agent; if it changes, distribute the new room link.

The entire app is reachable through the tunnel, including room creation and uploads. Do not publish the base URL widely. Room links are bearer secrets: anyone with one can view its film and control playback. Provider traffic limits and laptop upload speed affect streaming; each viewer consumes a separate stream. Use films you are permitted to share.

Public availability is not established until the agent starts successfully and the public checks pass. Installation, account sign-in and the provider allowance remain user-controlled steps.
