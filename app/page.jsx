'use client';

import { useEffect, useRef, useState } from 'react';

const SHOTS = 4;
const PHOTO_WIDTH = 960;
const JPEG_QUALITY = 0.85;
const PARTNER_TIMEOUT_MS = 15000;

const PAPER = '#FAF7F2';
const NAVY = '#1F2A44';
const PINK = '#F2A6B5';

const CONNECT_TIMEOUT_MS = 25000;

// Optional TURN relay, needed when two people are on different networks that
// block direct connections (common on mobile data). Set these at build time,
// e.g. from a free metered.ca account:
//   NEXT_PUBLIC_TURN_URLS=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp
//   NEXT_PUBLIC_TURN_USERNAME=...
//   NEXT_PUBLIC_TURN_CREDENTIAL=...
const TURN_URLS = (process.env.NEXT_PUBLIC_TURN_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

// PeerJS options. With no TURN set, PeerJS uses its free cloud signaling
// server (0.peerjs.com) and its default STUN/TURN servers.
const PEER_OPTIONS = {
  debug: 1,
  ...(TURN_URLS.length && {
    // Setting `config` replaces PeerJS's default ICE servers, so keep a STUN server too.
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: TURN_URLS,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ],
    },
  }),
};

const ERRORS = {
  cameraDenied: {
    title: 'camera needed',
    body: 'Miles Apart Booth needs your camera and microphone. Allow access in your browser (look for the camera icon in the address bar or your browser settings), then reload this page.',
    action: 'reload',
  },
  noCamera: {
    title: 'no camera found',
    body: 'We couldn’t find a camera on this device. Plug one in or try another device, then reload.',
    action: 'reload',
  },
  cameraBusy: {
    title: 'camera busy',
    body: 'Your camera seems to be in use by another app or tab. Close it, then reload this page.',
    action: 'reload',
  },
  unsupported: {
    title: 'can’t reach the camera',
    body: 'This browser can’t access a camera here. Open the site over HTTPS in a recent Safari, Chrome or Firefox.',
    action: 'reload',
  },
  expired: {
    title: 'link expired',
    body: 'That link has expired. Ask your partner for a new one.',
    action: 'home',
  },
  full: {
    title: 'booth is full',
    body: 'This booth already has two people in it. Only 2 people per room — start your own booth instead.',
    action: 'home',
  },
  connectFailed: {
    title: 'couldn’t connect',
    body: 'We couldn’t link up with your partner. Make sure they still have the booth open on their screen (not in the background). If it keeps happening, one of you may be on a network that blocks video calls — try switching to Wi-Fi or mobile data.',
    action: 'reload',
  },
  network: {
    title: 'connection trouble',
    body: 'We couldn’t reach the connection server. Check your internet, then reload.',
    action: 'reload',
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Draw an image into a box like CSS `object-fit: cover`.
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function captureFrame(video) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH;
  canvas.height = Math.round((PHOTO_WIDTH * vh) / vw);
  const ctx = canvas.getContext('2d');
  // Mirror so the photo matches what you saw on screen.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function composeStrip(mine, theirs) {
  const CELL_W = 600;
  const CELL_H = 450;
  const GAP = 16;
  const PAD = 36;
  const FOOTER = 200;
  const width = PAD * 2 + CELL_W * 2 + GAP;
  const height = PAD + SHOTS * CELL_H + (SHOTS - 1) * GAP + FOOTER;

  const caveat = cssVar('--font-caveat') || 'cursive';
  const dmSans = cssVar('--font-dm-sans') || 'sans-serif';
  await Promise.all([
    document.fonts.load(`700 76px ${caveat}`),
    document.fonts.load(`500 26px ${dmSans}`),
  ]).catch(() => {});

  const [myImgs, theirImgs] = await Promise.all([
    Promise.all(mine.map(loadImage)),
    Promise.all(Array.from({ length: SHOTS }, (_, i) => loadImage(theirs[i]))),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  for (let row = 0; row < SHOTS; row++) {
    const y = PAD + row * (CELL_H + GAP);
    [myImgs[row], theirImgs[row]].forEach((img, col) => {
      const x = PAD + col * (CELL_W + GAP);
      if (img) {
        drawCover(ctx, img, x, y, CELL_W, CELL_H);
      } else {
        ctx.fillStyle = 'rgba(242, 166, 181, 0.35)';
        ctx.fillRect(x, y, CELL_W, CELL_H);
        ctx.fillStyle = NAVY;
        ctx.globalAlpha = 0.6;
        ctx.font = `700 48px ${caveat}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('lost in the miles', x + CELL_W / 2, y + CELL_H / 2);
        ctx.globalAlpha = 1;
      }
    });
  }

  const footerTop = height - FOOTER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = NAVY;
  ctx.font = `700 76px ${caveat}`;
  ctx.fillText('miles apart, same frame', width / 2, footerTop + 102);

  ctx.fillStyle = PINK;
  ctx.fillRect(width / 2 - 28, footerTop + 126, 56, 3);

  ctx.fillStyle = '#8A8F9C';
  ctx.font = `500 26px ${dmSans}`;
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  ctx.fillText(date, width / 2, footerTop + 170);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function Booth() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const connRef = useRef(null);
  const partnerIdRef = useRef(null);
  // True once the video link (ICE) is actually up, not just negotiated.
  const connectedRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const sessionIdRef = useRef(0);
  const partnerPhotosRef = useRef([]);
  const photoWaiterRef = useRef(null);
  const handleMessageRef = useRef(() => {});
  const handlePartnerLeftRef = useRef(() => {});
  const stripUrlRef = useRef(null);

  const [isHost, setIsHost] = useState(true);
  const [status, setStatus] = useState('starting'); // starting | waiting | connecting | connected | left
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connOpen, setConnOpen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | shooting | waiting | composing | done
  const [shot, setShot] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [flashKey, setFlashKey] = useState(0);
  const [stripUrl, setStripUrl] = useState(null);

  const send = (msg) => {
    const conn = connRef.current;
    if (conn && conn.open) conn.send(msg);
  };

  const abortSession = () => {
    sessionIdRef.current += 1;
    photoWaiterRef.current?.(true);
    setCountdown(null);
    setPhase((p) => (p === 'done' ? p : 'idle'));
  };

  const waitForPartnerPhotos = () =>
    new Promise((resolve) => {
      const have = () => partnerPhotosRef.current.filter(Boolean).length >= SHOTS;
      let timer;
      const finish = () => {
        clearTimeout(timer);
        photoWaiterRef.current = null;
        resolve(partnerPhotosRef.current.slice());
      };
      if (have()) return finish();
      timer = setTimeout(finish, PARTNER_TIMEOUT_MS);
      photoWaiterRef.current = (force) => {
        if (force || have()) finish();
      };
    });

  const runSession = async (initiator) => {
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    const id = ++sessionIdRef.current;
    const aborted = () => sessionIdRef.current !== id;

    partnerPhotosRef.current = [];
    if (initiator) send({ type: 'start' });

    try {
      setPhase('shooting');
      const mine = [];
      for (let i = 0; i < SHOTS; i++) {
        setShot(i + 1);
        for (let n = 3; n >= 1; n--) {
          setCountdown(n);
          await sleep(1000);
          if (aborted()) return;
        }
        setCountdown(null);
        const img = captureFrame(localVideoRef.current);
        mine[i] = img;
        setFlashKey((k) => k + 1);
        send({ type: 'photo', i, img });
        await sleep(900);
        if (aborted()) return;
      }

      setPhase('waiting');
      const theirs = await waitForPartnerPhotos();
      if (aborted()) return;

      setPhase('composing');
      const blob = await composeStrip(mine, theirs);
      if (aborted() || !blob) return;
      if (stripUrlRef.current) URL.revokeObjectURL(stripUrlRef.current);
      const url = URL.createObjectURL(blob);
      stripUrlRef.current = url;
      setStripUrl(url);
      setPhase('done');
    } finally {
      sessionActiveRef.current = false;
    }
  };

  // Keep the data handler fresh so it never sees stale state.
  handleMessageRef.current = (msg, conn) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'start':
        runSession(false);
        break;
      case 'photo':
        if (Number.isInteger(msg.i) && msg.i >= 0 && msg.i < SHOTS && typeof msg.img === 'string') {
          partnerPhotosRef.current[msg.i] = msg.img;
          photoWaiterRef.current?.();
        }
        break;
      case 'full':
        setError(ERRORS.full);
        conn.close();
        callRef.current?.close();
        peerRef.current?.destroy();
        break;
      case 'bye':
        handlePartnerLeftRef.current(conn.peer);
        break;
      default:
        break;
    }
  };

  handlePartnerLeftRef.current = (peerId) => {
    if (!peerId || partnerIdRef.current !== peerId) return;
    const wasConnected = connectedRef.current;
    partnerIdRef.current = null;
    connectedRef.current = false;
    callRef.current?.close();
    connRef.current?.close();
    callRef.current = null;
    connRef.current = null;
    setRemoteStream(null);
    setConnOpen(false);
    setNeedsTap(false);
    abortSession();
    if (!wasConnected) return;

    setNotice('Your partner left');
    // The host keeps their peer alive, so the same link works again.
    // The guest's link pointed at the partner's peer, which is gone now.
    setStatus(isHost ? 'waiting' : 'left');
  };

  useEffect(() => {
    let cancelled = false;
    let peer = null;
    let stream = null;
    let connectTimer = null;
    const room = new URLSearchParams(window.location.search).get('room');
    setIsHost(!room);

    const fail = (err) => {
      if (!cancelled) setError(err);
    };

    const claimPartner = (id) => {
      if (partnerIdRef.current && partnerIdRef.current !== id && !connectedRef.current) {
        // The earlier attempt never got through (e.g. they reloaded); let the new one in.
        const old = { call: callRef.current, conn: connRef.current };
        partnerIdRef.current = null;
        old.call?.close();
        old.conn?.close();
      }
      if (!partnerIdRef.current) partnerIdRef.current = id;
      return partnerIdRef.current === id;
    };

    const connectFailed = (peerId) => {
      if (connectedRef.current || cancelled) return;
      if (room) return fail(ERRORS.connectFailed);
      // Host: drop the failed attempt and keep the link open for another try.
      handlePartnerLeftRef.current(peerId);
      setNotice('Couldn’t connect to them. Ask them to open the link again.');
    };

    const attachCall = (call) => {
      callRef.current = call;
      const pc = call.peerConnection;
      pc?.addEventListener('iceconnectionstatechange', () => {
        const state = pc.iceConnectionState;
        if ((state === 'connected' || state === 'completed') && !connectedRef.current) {
          connectedRef.current = true;
          clearTimeout(connectTimer);
          setNotice(null);
          setStatus('connected');
        } else if (state === 'failed') {
          connectFailed(call.peer);
        }
      });
      call.on('stream', (remote) => setRemoteStream(remote));
      call.on('close', () => handlePartnerLeftRef.current(call.peer));
      call.on('error', (err) => console.warn('call error', err));
    };

    const attachConn = (conn) => {
      connRef.current = conn;
      conn.on('open', () => setConnOpen(true));
      conn.on('data', (msg) => handleMessageRef.current(msg, conn));
      conn.on('close', () => handlePartnerLeftRef.current(conn.peer));
      conn.on('error', (err) => console.warn('data connection error', err));
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return fail(ERRORS.unsupported);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: true,
        });
      } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return fail(ERRORS.cameraDenied);
        if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return fail(ERRORS.noCamera);
        if (err?.name === 'NotReadableError') return fail(ERRORS.cameraBusy);
        return fail(ERRORS.cameraDenied);
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const { default: Peer } = await import('peerjs');
      if (cancelled) return;

      peer = new Peer(PEER_OPTIONS);
      peerRef.current = peer;

      peer.on('open', (id) => {
        if (room) {
          setStatus('connecting');
          partnerIdRef.current = room;
          connectTimer = setTimeout(() => connectFailed(room), CONNECT_TIMEOUT_MS);
          attachCall(peer.call(room, stream));
          attachConn(peer.connect(room, { reliable: true }));
        } else {
          setShareLink(`${window.location.origin}/?room=${encodeURIComponent(id)}`);
          setStatus((s) => (s === 'starting' ? 'waiting' : s));
        }
      });

      peer.on('call', (call) => {
        // Only 2 per room: ignore anyone who isn't our partner.
        if (!claimPartner(call.peer)) return;
        call.answer(stream);
        attachCall(call);
      });

      peer.on('connection', (conn) => {
        if (!claimPartner(conn.peer)) {
          conn.on('open', () => {
            conn.send({ type: 'full' });
            setTimeout(() => conn.close(), 3000);
          });
          return;
        }
        attachConn(conn);
      });

      // Lost the signaling server (common while idling). Reconnect so the
      // share link keeps working; existing P2P connections are unaffected.
      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });

      peer.on('error', (err) => {
        switch (err.type) {
          case 'peer-unavailable':
            if (!connectedRef.current) fail(ERRORS.expired);
            break;
          case 'browser-incompatible':
            fail(ERRORS.unsupported);
            break;
          case 'network':
          case 'server-error':
          case 'socket-error':
          case 'socket-closed':
          case 'unavailable-id':
            if (!connectedRef.current) fail(ERRORS.network);
            break;
          default:
            console.warn('peer error', err);
        }
      });
    }

    start();

    const onPageHide = () => {
      const conn = connRef.current;
      if (conn?.open) conn.send({ type: 'bye' });
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      window.removeEventListener('pagehide', onPageHide);
      sessionIdRef.current += 1;
      peer?.destroy();
      stream?.getTracks().forEach((t) => t.stop());
      if (stripUrlRef.current) URL.revokeObjectURL(stripUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, error]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) {
      // iOS may block autoplay with sound until the user taps something.
      video.play().catch(() => setNeedsTap(true));
    }
  }, [remoteStream, error]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      const input = document.getElementById('share-link');
      input?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enableAudio = () => {
    remoteVideoRef.current
      ?.play()
      .then(() => setNeedsTap(false))
      .catch(() => {});
  };

  const busy = phase === 'shooting' || phase === 'waiting' || phase === 'composing';
  const canShoot = status === 'connected' && connOpen && !!remoteStream && !busy;
  const stripName = `miles-apart-${new Date().toISOString().slice(0, 10)}.png`;

  if (error) {
    return (
      <main className="booth">
        <Header />
        <div className="card" role="alert">
          <h2>{error.title}</h2>
          <p>{error.body}</p>
          {error.action === 'reload' ? (
            <button className="btn btn-main" onClick={() => window.location.reload()}>
              Reload
            </button>
          ) : (
            <a className="btn btn-main" href="/">
              Start your own booth
            </a>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="booth">
      <Header />

      <section className="stage">
        <figure className="frame">
          <video ref={localVideoRef} className="mirror" autoPlay playsInline muted />
          <figcaption className="label">you</figcaption>
          {!localStream && <div className="placeholder">starting your camera…</div>}
        </figure>

        <figure className="frame">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <figcaption className="label">them</figcaption>
          {!remoteStream && (
            <div className="placeholder">
              {status === 'left' ? 'they left' : status === 'connecting' ? 'connecting…' : 'waiting for them…'}
            </div>
          )}
          {needsTap && remoteStream && (
            <button className="tap-audio" onClick={enableAudio}>
              Tap to hear them
            </button>
          )}
        </figure>

        {countdown && (
          <div className="countdown" aria-live="assertive">
            <span key={`${shot}-${countdown}`}>{countdown}</span>
          </div>
        )}
      </section>

      {flashKey > 0 && <div key={flashKey} className="flash" />}

      <section className="controls">
        {notice && <p className="notice">{notice}</p>}

        {status === 'starting' && <p className="hint">Getting your booth ready…</p>}

        {status === 'waiting' && shareLink && (
          <>
            <p className="hint">
              Send this link to <strong>your person</strong> and keep this page open. The booth opens when they join.
            </p>
            <div className="share">
              <input id="share-link" value={shareLink} readOnly onFocus={(e) => e.target.select()} />
              <button className="btn btn-soft" onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </>
        )}

        {status === 'connecting' && <p className="hint">Connecting to your partner…</p>}

        {status === 'connected' && (
          <>
            <button className="btn btn-main" onClick={() => runSession(true)} disabled={!canShoot}>
              {phase === 'done' ? 'Take 4 more' : 'Take 4 photos together'}
            </button>
            <p className="hint">
              {phase === 'shooting' && `Photo ${shot} of ${SHOTS} — smile!`}
              {phase === 'waiting' && 'Waiting for their photos…'}
              {phase === 'composing' && 'Developing your strip…'}
              {(phase === 'idle' || phase === 'done') &&
                (connOpen ? 'Either of you can press it. You’ll both get the strip.' : 'Almost ready…')}
            </p>
          </>
        )}

        {status === 'left' && (
          <a className="btn btn-soft" href="/">
            Start a new booth
          </a>
        )}
      </section>

      {stripUrl && (
        <section className="result">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stripUrl} alt="Your photo strip" />
          <a className="btn btn-main" href={stripUrl} download={stripName}>
            Download strip
          </a>
        </section>
      )}
    </main>
  );
}

function Header() {
  return (
    <header className="header">
      <h1 className="title">Miles Apart Booth</h1>
      <p className="tagline">a photo booth for two, wherever you are</p>
    </header>
  );
}
