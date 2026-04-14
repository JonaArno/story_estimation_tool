const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      story: '',
      participants: {},
      revealed: false,
    };
  }
  return rooms[roomId];
}

function getRoomSummary(room) {
  const participants = Object.values(room.participants).map(p => ({
    id: p.id,
    name: p.name,
    isSpectator: p.isSpectator,
    hasVoted: p.vote !== null,
    vote: room.revealed ? p.vote : null,
  }));
  return {
    story: room.story,
    participants,
    revealed: room.revealed,
  };
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let participantId = uuidv4();

  socket.on('join', ({ roomId, name, isSpectator }) => {
    if (!name || !name.trim()) return;
    if (!roomId) return;

    currentRoom = roomId;
    socket.join(roomId);

    const room = getRoom(roomId);
    room.participants[participantId] = {
      id: participantId,
      name: name.trim(),
      vote: null,
      isSpectator: !!isSpectator,
    };

    io.to(roomId).emit('room_update', getRoomSummary(room));
  });

  socket.on('set_story', ({ story }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.story = story;
    room.revealed = false;
    // Clear all votes when story changes
    for (const p of Object.values(room.participants)) {
      p.vote = null;
    }
    io.to(currentRoom).emit('room_update', getRoomSummary(room));
  });

  socket.on('vote', ({ value }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (room.revealed) return;
    const participant = room.participants[participantId];
    if (!participant || participant.isSpectator) return;
    participant.vote = value;
    io.to(currentRoom).emit('room_update', getRoomSummary(room));
  });

  socket.on('reveal', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.revealed = true;
    io.to(currentRoom).emit('room_update', getRoomSummary(room));
  });

  socket.on('new_round', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.revealed = false;
    room.story = '';
    for (const p of Object.values(room.participants)) {
      p.vote = null;
    }
    io.to(currentRoom).emit('room_update', getRoomSummary(room));
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room) return;
    delete room.participants[participantId];
    if (Object.keys(room.participants).length === 0) {
      delete rooms[currentRoom];
    } else {
      io.to(currentRoom).emit('room_update', getRoomSummary(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Story estimation tool running at http://localhost:${PORT}`);
});
