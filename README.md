# Miles Apart Booth

A photo booth for long-distance couples. Open the site, send your partner the link, and take a 4-shot photo strip together: you on the left, them on the right.

- **Next.js** (App Router, JavaScript)
- **PeerJS** for WebRTC video, audio and data. It uses the free PeerJS cloud signaling server, so there is no backend and no database.
- Photos never touch a server. Each browser captures its own camera, sends the shot straight to the partner, and builds the strip locally.

## How it works

1. Person A opens the site and gets a link like `/?room=<peerId>`. They copy it and send it.
2. Person B opens the link. Their browser calls Person A and opens a data connection.
3. Either person presses **Take 4 photos together**. Both browsers run the same 3-2-1 countdown four times, capture their own camera frame each time and swap photos.
4. Each browser draws the strip on a canvas and offers **Download strip** (PNG).

Only two people can be in a room. A third person who opens the link is told the booth is full.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To test alone, open the share link in a second browser window or a private window. Cameras work on `localhost` without HTTPS.

To test on your phone over your local network, you need HTTPS, because browsers block the camera on plain-HTTP LAN addresses. Try `npx next dev --experimental-https`, or deploy a preview to Vercel.

## Deploy to Vercel

The app deploys as-is, with no environment variables.

**Dashboard:** push this repo to GitHub, then on vercel.com choose **Add New → Project**, import the repo and click **Deploy**. Vercel detects Next.js automatically.

**CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

## Better connectivity (TURN)

Most connections work over the default STUN servers. Some networks need a TURN relay, including strict corporate NATs, some mobile carriers and symmetric NATs. If calls connect but video never shows up, add TURN servers:

1. Create a free account at [metered.ca](https://www.metered.ca/stun-turn) (or any TURN provider).
2. In `app/page.jsx`, uncomment the `config.iceServers` block in `PEER_OPTIONS` and paste your credentials.

Anything in client code is public, so use credentials your provider lets you restrict or rotate.

## Notes

- **iOS Safari:** the videos use `autoPlay` and `playsInline`, and your own video is muted. If iOS blocks your partner's audio, a **Tap to hear them** button appears.
- **Expired links:** a link only works while the person who made it keeps the page open. If they close it, the link shows "That link has expired. Ask your partner for a new one."
- **Partner leaves:** the person who made the link can send the same link again. The other person can start a new booth.
