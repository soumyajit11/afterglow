import { io } from "socket.io-client";

const [origin, id] = process.argv.slice(2);
if (!origin || !id || new URL(origin).protocol !== "https:") {
  console.error(
    "Usage: npm run check:public -- https://YOUR-TUNNEL-DOMAIN ROOM_ID",
  );
  process.exit(1);
}
const base = new URL(origin).origin;
// ngrok permits this header for programmatic clients; browsers see its provider notice.
const headers = { "ngrok-skip-browser-warning": "1" };
for (const route of [
  `/room/${id}`,
  `/api/rooms/${id}`,
  `/api/rooms/${id}/video`,
]) {
  const video = route.endsWith("/video");
  const response = await fetch(base + route, {
    headers: { ...headers, ...(video ? { Range: "bytes=0-15" } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== (video ? 206 : 200))
    throw Error(`${route}: HTTP ${response.status}`);
  if (
    video &&
    !response.headers.get("content-range")?.startsWith("bytes 0-15/")
  )
    throw Error("Missing video byte range");
  if (route.startsWith("/api/rooms/") && !video) {
    const room = await response.json();
    if (!room.movie?.title) throw Error("Room API returned no movie");
  } else {
    if (!video && !(await response.text()).includes('id="root"'))
      throw Error("Room page is not the React app");
    if (video) await response.body.cancel();
  }
  console.log(
    video
      ? "PASS video byte range"
      : route.startsWith("/api")
        ? "PASS room API"
        : "PASS room page",
  );
}
const socket = io(base, {
  transports: ["websocket"],
  reconnection: false,
  timeout: 15000,
  extraHeaders: { ...headers, Origin: base },
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("WebSocket room join timed out")),
      20000,
    );
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once("connect", () =>
      socket.emit("join", { id, name: "Connection check" }, (result) => {
        clearTimeout(timer);
        if (!result?.state) reject(Error("No authoritative room state"));
        else resolve();
      }),
    );
  });
  console.log("PASS WebSocket and authoritative room state");
} finally {
  socket.disconnect();
}
console.log("Browser decoding and autoplay still require a browser test.");
