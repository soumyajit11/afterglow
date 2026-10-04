import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import multer from "multer";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { position, snapshot } from "./playback.js";

function sameOrigin(req) {
  try {
    return (
      !req.headers.origin ||
      new URL(req.headers.origin).host === req.headers.host
    );
  } catch {
    return false;
  }
}
const app = express(),
  http = createServer(app),
  io = new Server(http, {
    maxHttpBufferSize: 16384,
    allowRequest: (req, cb) => cb(null, sameOrigin(req)),
  });
const root = path.resolve(process.env.STORAGE_DIR || "storage");
fs.mkdirSync(root, { recursive: true });
const database = path.join(root, "rooms.json");
const rooms = new Map(
  fs.existsSync(database) ? JSON.parse(fs.readFileSync(database, "utf8")) : [],
);
for (const room of rooms.values()) {
  room.playing = false;
  room.waiting = false;
  room.updatedAt = Date.now();
}
function save() {
  const temp = database + ".tmp";
  fs.writeFileSync(
    temp,
    JSON.stringify(
      [...rooms].map(([id, room]) => [
        id,
        {
          ...room,
          position: position(room),
          playing: false,
          waiting: false,
          updatedAt: Date.now(),
        },
      ]),
    ),
  );
  fs.renameSync(temp, database);
}
const peers = new Map();
const upload = multer({
  storage: multer.diskStorage({
    destination: root,
    filename: (req, file, cb) =>
      cb(null, randomBytes(24).toString("hex") + ".mp4"),
  }),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024,
    files: 1,
    fields: 2,
  },
  fileFilter: (req, file, cb) =>
    cb(null, path.extname(file.originalname).toLowerCase() === ".mp4"),
});
app.use((req, res, next) => {
  res.set("Referrer-Policy", "no-referrer");
  if (!sameOrigin(req))
    return res
      .status(403)
      .json({ error: "Cross-origin requests are not allowed." });
  next();
});
app.use(express.json({ limit: "8kb" }));
app.get("/api/config", (req, res) =>
  res.json({ maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 2048) }),
);
app.post("/api/rooms", upload.single("movie"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an MP4 video." });
  const fd = fs.openSync(req.file.path, "r"),
    header = Buffer.alloc(12);
  fs.readSync(fd, header, 0, 12, 0);
  fs.closeSync(fd);
  if (header.toString("ascii", 4, 8) !== "ftyp") {
    fs.unlinkSync(req.file.path);
    return res
      .status(400)
      .json({ error: "This file is not an MP4 container." });
  }
  const id = randomBytes(24).toString("base64url");
  const room = {
    name: String(req.body.name || "Movie night")
      .trim()
      .slice(0, 80),
    movie: {
      title: path.basename(req.file.originalname).slice(0, 180),
      file: req.file.filename,
      size: req.file.size,
    },
    position: 0,
    playing: false,
    updatedAt: Date.now(),
    revision: 0,
    waiting: false,
  };
  rooms.set(id, room);
  save();
  res.status(201).json({ id });
});
app.get("/api/rooms/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room)
    return res
      .status(404)
      .json({ error: "Room not found. Check your invite link." });
  res.json(snapshot(room));
});
app.get("/api/rooms/:id/video", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.sendStatus(404);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(root, room.movie.file), {
    headers: { "Content-Type": "video/mp4" },
  });
});
function broadcast(id) {
  const room = rooms.get(id);
  io.to(id).emit("state", snapshot(room));
  const members = [...peers.values()].filter((p) => p.id === id);
  io.to(id).emit(
    "members",
    members.map((p) => ({ name: p.name, buffering: p.buffering })),
  );
}
io.on("connection", (socket) => {
  socket.on("join", (payload, callback) => {
    if (!payload || typeof payload !== "object") return;
    const { id, name } = payload;
    const ack = typeof callback === "function" ? callback : undefined;
    if (typeof id !== "string" || !rooms.has(id))
      return ack?.({ error: "Room not found" });
    if (peers.has(socket.id)) return;
    socket.join(id);
    peers.set(socket.id, {
      id,
      name: String(name || "Guest").slice(0, 32),
      buffering: false,
    });
    ack?.({ state: snapshot(rooms.get(id)) });
    broadcast(id);
  });
  socket.on("control", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { action, time } = payload;
    const peer = peers.get(socket.id);
    if (!peer) return;
    const room = rooms.get(peer.id);
    room.position = position(room);
    if (!["play", "pause", "seek"].includes(action)) return;
    if (
      action === "seek" &&
      (!Number.isFinite(time) || time < 0 || time > 86400)
    )
      return;
    room.position = position(room);
    if (action === "seek") {
      room.position = time;
    } else {
      room.playing = action === "play";
      room.waiting = false;
    }
    if (
      room.playing &&
      [...peers.values()].some((p) => p.id === peer.id && p.buffering)
    ) {
      room.playing = false;
      room.waiting = true;
    }
    room.updatedAt = Date.now();
    room.revision++;
    save();
    broadcast(peer.id);
  });
  socket.on("buffering", (value) => {
    const peer = peers.get(socket.id);
    if (!peer || typeof value !== "boolean" || peer.buffering === value) return;
    peer.buffering = value;
    const room = rooms.get(peer.id);
    room.position = position(room);
    if (value && room.playing) {
      room.playing = false;
      room.waiting = true;
    }
    if (
      room.waiting &&
      ![...peers.values()].some((p) => p.id === peer.id && p.buffering)
    ) {
      room.playing = true;
      room.waiting = false;
    }
    room.updatedAt = Date.now();
    room.revision++;
    save();
    broadcast(peer.id);
  });
  socket.on("disconnect", () => {
    const peer = peers.get(socket.id);
    if (!peer) return;
    peers.delete(socket.id);
    const room = rooms.get(peer.id);
    room.position = position(room);
    if (![...peers.values()].some((p) => p.id === peer.id)) {
      room.playing = false;
      room.waiting = false;
    } else if (
      room.waiting &&
      ![...peers.values()].some((p) => p.id === peer.id && p.buffering)
    ) {
      room.playing = true;
      room.waiting = false;
    }
    room.updatedAt = Date.now();
    save();
    broadcast(peer.id);
  });
});
setInterval(() => {
  for (const id of new Set([...peers.values()].map((p) => p.id))) broadcast(id);
}, 2000).unref();
setInterval(save, 10000).unref();
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
app.use((err, req, res, next) => {
  if (err.status === 416) return res.status(416).end();
  if (res.headersSent) return next(err);
  return res
    .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
    .json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Video exceeds the upload limit."
          : "Upload failed. Please choose a valid MP4 file.",
    });
});
http.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("Watch Party listening on port " + (process.env.PORT || 3001)),
);
