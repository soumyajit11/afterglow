import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";

function App() {
  const id = location.pathname.startsWith("/room/")
    ? location.pathname.split("/")[2]
    : null;
  const [room, setRoom] = useState(null),
    [members, setMembers] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [file, setFile] = useState(null),
    [online, setOnline] = useState(false),
    [ready, setReady] = useState(false),
    [copied, setCopied] = useState(false),
    [max, setMax] = useState(2048);
  const video = useRef(),
    socket = useRef(),
    latest = useRef(),
    readyRef = useRef(false),
    canPlayRef = useRef(false);
  const [name, setName] = useState(sessionStorage.getItem("watch-name") || ""),
    [entered, setEntered] = useState(false),
    [blocked, setBlocked] = useState(false);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setMax(c.maxUploadMB))
      .catch(() => {});
    if (id)
      fetch("/api/rooms/" + id)
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw Error(body.error);
          setRoom(body);
        })
        .catch((e) => setError(e.message));
  }, [id]);
  function apply(state) {
    latest.current = state;
    setRoom(state);
    const v = video.current;
    if (!v || !readyRef.current) return;
    const target = state.position;
    if (Math.abs(v.currentTime - target) > 0.8)
      v.currentTime = Math.min(
        target,
        Number.isFinite(v.duration) ? v.duration : target,
      );
    if (state.playing) {
      v.play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    } else v.pause();
  }
  useEffect(() => {
    if (!id || !entered) return;
    const s = io({ reconnection: true });
    socket.current = s;
    s.on("connect", () => {
      setOnline(true);
      s.emit("join", { id, name }, (result) => {
        if (result.error) setError(result.error);
        else {
          apply(result.state);
          s.emit("buffering", !canPlayRef.current);
        }
      });
    });
    s.on("disconnect", () => {
      setOnline(false);
      video.current?.pause();
    });
    s.on("state", apply);
    s.on("members", setMembers);
    return () => s.disconnect();
  }, [id, entered]);
  function buffering(value) {
    if (!entered) return;
    socket.current?.emit("buffering", value);
  }
  function command(action, time) {
    if (online) socket.current?.emit("control", { action, time });
  }
  async function create(e) {
    e.preventDefault();
    setError("");
    if (!file) return setError("Choose a movie first.");
    if (file.size > max * 1024 * 1024)
      return setError("This movie exceeds the upload limit.");
    setBusy(true);
    const data = new FormData();
    data.append("movie", file);
    data.append("name", e.target.roomName.value);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/rooms");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        return setError("Server did not accept the upload.");
      }
      if (xhr.status === 201) location.href = "/room/" + result.id;
      else setError(result.error);
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("Connection failed. Try uploading again.");
    };
    xhr.send(data);
  }
  const join = (e) => {
    e.preventDefault();
    sessionStorage.setItem("watch-name", name);
    setEntered(true);
  };
  return (
    <>
      <header>
        <a className="brand" href="/">
          ◈ <span>afterglow</span>
        </a>
        <span className="header-note">GOOD MOVIES. GREAT COMPANY.</span>
        <span className="badge">WATCH PARTY</span>
      </header>
      <main>
        {!id ? (
          <>
            <section className="hero">
              <div className="eyebrow">
                <span className="dot" /> YOUR PEOPLE, ONE SCREEN
              </div>
              <h1>
                Movie night.
                <br />
                <em>Anywhere, together.</em>
              </h1>
              <p>
                Turn a movie into a shared moment. Bring your own film, invite
                your friends, and settle in — we’ll keep everyone in sync.
              </p>
              <div className="features">
                <span>↔ Synced playback</span>
                <span>♧ Private rooms</span>
                <span>◎ No accounts</span>
              </div>
            </section>
            <section className="create-card">
              <div className="card-heading">
                <span className="step">01</span>
                <div>
                  <h2>Set the scene</h2>
                  <p>Your next movie night starts here.</p>
                </div>
              </div>
              <form onSubmit={create}>
                <label>
                  ROOM NAME
                  <input
                    name="roomName"
                    placeholder="Friday night cinema"
                    maxLength="80"
                    required
                    disabled={busy}
                  />
                </label>
                <label className={"dropzone " + (file ? "selected" : "")}>
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    onChange={(e) => setFile(e.target.files[0])}
                    disabled={busy}
                  />
                  <span className="upload-icon">↥</span>
                  <strong>{file ? file.name : "Choose your movie"}</strong>
                  <span>
                    {file
                      ? (file.size / 1024 / 1024).toFixed(1) + " MB"
                      : "Click to select an MP4 from your computer"}
                  </span>
                  <small>MP4 · H.264 video + AAC audio · up to {max} MB</small>
                </label>
                <p className="hint">
                  Your movie stays on this server. Only people with your invite
                  link can access the room.
                </p>
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Uploading movie · " + progress + "%"
                    : "Create a private room"}{" "}
                  <span>→</span>
                </button>
                {busy && <progress value={progress} max="100" />}
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
              </form>
            </section>
            <section className="how">
              <div>
                <b>01 / BRING A FILM</b>
                <p>Upload a browser-friendly MP4.</p>
              </div>
              <div>
                <b>02 / INVITE YOUR PEOPLE</b>
                <p>Send your private room link.</p>
              </div>
              <div>
                <b>03 / PRESS PLAY TOGETHER</b>
                <p>One play, pause, or seek for everyone.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="room-top">
              <div>
                <div className="eyebrow">YOUR PRIVATE SCREENING</div>
                <h1 className="room-title">
                  {room?.name || "Loading your room…"}
                </h1>
                <p>{room?.movie.title}</p>
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setError(
                      "Copy the link from your address bar to invite friends.",
                    );
                  }
                }}
              >
                {copied ? "Link copied ✓" : "Copy invite link ↗"}
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {room && (
              <div className="theater">
                <section className="screen-card">
                  <div className="screen">
                    <video
                      ref={video}
                      src={"/api/rooms/" + id + "/video"}
                      preload="auto"
                      playsInline
                      onLoadedMetadata={() => {
                        readyRef.current = true;
                        setReady(true);
                        if (latest.current) apply(latest.current);
                      }}
                      onWaiting={() => {
                        canPlayRef.current = false;
                        buffering(true);
                      }}
                      onCanPlay={() => {
                        canPlayRef.current = true;
                        buffering(false);
                      }}
                      onPlaying={() => buffering(false)}
                      onEnded={() => command("pause")}
                      onError={() =>
                        setError(
                          "This video cannot play in your browser. Use an MP4 with H.264 video and AAC audio.",
                        )
                      }
                    />
                    {!entered && (
                      <div className="join-overlay">
                        <span className="upload-icon">◈</span>
                        <h2>Your seat is waiting</h2>
                        <p>Pick a name so your friends know you’re here.</p>
                        <form onSubmit={join}>
                          <input
                            aria-label="Your name"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            maxLength="32"
                          />
                          <button className="primary">
                            Join movie night →
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                  <div className="controls">
                    <button
                      className="primary play"
                      disabled={!entered || !online || !ready}
                      onClick={() =>
                        command(room.playing || room.waiting ? "pause" : "play")
                      }
                    >
                      {room.playing || room.waiting ? "Ⅱ Pause" : "▶ Play"}
                    </button>
                    <input
                      aria-label="Seek movie"
                      type="range"
                      min="0"
                      max={
                        Number.isFinite(video.current?.duration)
                          ? video.current.duration
                          : 1
                      }
                      step="0.1"
                      value={Math.min(
                        room.position,
                        Number.isFinite(video.current?.duration)
                          ? video.current.duration
                          : 1,
                      )}
                      disabled={!online || !ready || !entered}
                      onChange={(e) => command("seek", Number(e.target.value))}
                    />
                    <span>
                      {Math.floor(room.position / 60)}:
                      {String(Math.floor(room.position % 60)).padStart(2, "0")}
                    </span>
                    <button
                      className="secondary"
                      onClick={() => video.current?.requestFullscreen?.()}
                    >
                      ⛶
                    </button>
                  </div>
                  {blocked && (
                    <button
                      className="enable"
                      onClick={() =>
                        video.current.play().then(() => setBlocked(false))
                      }
                    >
                      Click to enable playback in this browser
                    </button>
                  )}
                  <div className="status">
                    <span className={"dot " + (!online ? "offline" : "")} />
                    {!entered
                      ? "Join to control playback"
                      : !online
                        ? "Reconnecting — playback paused locally"
                        : room.waiting
                          ? "Waiting for everyone to buffer…"
                          : room.playing
                            ? "Playing in sync"
                            : "Paused for everyone"}
                    <span>Everyone can control playback</span>
                  </div>
                  <label className="volume">
                    Your volume
                    <input
                      aria-label="Your volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      defaultValue="1"
                      onChange={(e) => {
                        video.current.volume = Number(e.target.value);
                      }}
                    />
                  </label>
                </section>
                <aside>
                  <div className="audience-heading">
                    <h2>In the room</h2>
                    <span>{members.length}</span>
                  </div>
                  {members.length ? (
                    members.map((m, i) => (
                      <div className="member" key={i}>
                        <span className="avatar">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{m.name}</strong>
                          <small>
                            {m.buffering ? "Buffering…" : "Ready to watch"}
                          </small>
                        </div>
                        <span
                          className={"dot " + (m.buffering ? "offline" : "")}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="hint">
                      Your friends will appear here when they join.
                    </p>
                  )}
                  <div className="together-note">
                    <span>✦</span>
                    <h3>Better together.</h3>
                    <p>
                      If someone buffers, the room pauses and resumes when
                      everyone is ready. Press Pause to cancel automatic resume.
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>
      <footer>
        <span>◈ afterglow</span>
        <span>A little closer, wherever you are.</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
