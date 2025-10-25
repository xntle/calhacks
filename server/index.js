import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// in-memory presence per room: { roomId: Set<socketId> }
const presence = new Map();

io.on("connection", (socket) => {
  // join a room
  socket.on("room:join", ({ roomId, user }) => {
    socket.data.user = user || {
      id: socket.id,
      name: `u_${socket.id.slice(0, 4)}`,
    };
    socket.join(roomId);
    if (!presence.has(roomId)) presence.set(roomId, new Set());
    presence.get(roomId).add(socket.id);

    // announce + send presence
    io.to(roomId).emit("presence:update", {
      roomId,
      count: presence.get(roomId).size,
      users: Array.from(presence.get(roomId)).map((id) => ({
        id,
        name: id === socket.id ? socket.data.user?.name : `u_${id.slice(0, 4)}`,
      })),
    });

    socket
      .to(roomId)
      .emit("sys:msg", {
        text: `${socket.data.user.name} joined`,
        t: Date.now(),
      });
  });

  // chat message
  socket.on("msg:send", ({ roomId, text }) => {
    const payload = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: socket.data.user || { id: socket.id },
      text,
      t: Date.now(),
    };
    io.to(roomId).emit("msg:new", payload);
  });

  // typing indicator
  socket.on("typing", ({ roomId, typing }) => {
    socket.to(roomId).emit("typing", { userId: socket.id, typing });
  });

  // leave / disconnect
  function handleLeaveAll() {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue; // own room
      const set = presence.get(roomId);
      if (!set) continue;
      set.delete(socket.id);
      io.to(roomId).emit("presence:update", {
        roomId,
        count: set.size,
        users: Array.from(set).map((id) => ({
          id,
          name: `u_${id.slice(0, 4)}`,
        })),
      });
      socket
        .to(roomId)
        .emit("sys:msg", {
          text: `${socket.data.user?.name || "user"} left`,
          t: Date.now(),
        });
    }
  }

  socket.on("disconnect", handleLeaveAll);
  socket.on("room:leave", handleLeaveAll);
});

const PORT = process.env.PORT || 5174;
server.listen(PORT, () => console.log(`WS server on :${PORT}`));
