export function position(room, now = Date.now()) {
  return Math.max(
    0,
    room.position + (room.playing ? (now - room.updatedAt) / 1000 : 0),
  );
}
export function snapshot(room) {
  return {
    name: room.name,
    movie: { title: room.movie.title, size: room.movie.size },
    position: position(room),
    playing: room.playing,
    revision: room.revision,
    waiting: room.waiting,
    serverTime: Date.now(),
  };
}
