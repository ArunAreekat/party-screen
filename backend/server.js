import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// State
const parties = new Map();
// parties[code] = { code, host, members: Map<socketId, {name}>, queue: [], tvSocketId }

const FIXED_CODE = process.env.PARTY_CODE || '1234';

// Pre-seed the party so it always exists on startup
parties.set(FIXED_CODE, {
  code: FIXED_CODE,
  members: new Map(),
  queue: [],
  tvSocketId: null,
  createdAt: Date.now(),
});

function getPartyState(party) {
  return {
    code: party.code,
    memberCount: party.members.size,
    members: Array.from(party.members.values()),
    queue: party.queue,
  };
}

// REST: create party (always returns the fixed code)
app.post('/party/create', (req, res) => {
  const code = FIXED_CODE;

  // Reset party state (new TV session)
  const party = {
    code,
    members: new Map(),
    queue: [],
    tvSocketId: null,
    createdAt: Date.now(),
  };
  parties.set(code, party);

  console.log(`Party created: ${code}`);
  res.json({ code });
});

// REST: check party exists
app.get('/party/:code', (req, res) => {
  const party = parties.get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  res.json({ code: party.code, memberCount: party.members.size });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  let currentPartyCode = null;

  // TV connects to party
  socket.on('tv:join', ({ code }) => {
    const party = parties.get(code);
    if (!party) { socket.emit('error', 'Party not found'); return; }

    party.tvSocketId = socket.id;
    currentPartyCode = code;
    socket.join(`party:${code}`);
    socket.emit('tv:joined', getPartyState(party));
    console.log(`TV joined party ${code}`);
  });

  // Guest joins party
  socket.on('guest:join', ({ code, name }) => {
    const party = parties.get(code);
    if (!party) { socket.emit('error', 'Party not found'); return; }

    const guest = { name, joinedAt: Date.now() };
    party.members.set(socket.id, guest);
    currentPartyCode = code;
    socket.join(`party:${code}`);

    socket.emit('guest:joined', getPartyState(party));
    // Notify TV + others
    io.to(`party:${code}`).emit('party:member-joined', { name, memberCount: party.members.size });
    console.log(`${name} joined party ${code}`);
  });

  // Guest sends a message
  socket.on('guest:message', ({ code, content, type = 'text' }) => {
    const party = parties.get(code);
    if (!party) return;

    const member = party.members.get(socket.id);
    const senderName = member?.name || 'Anonymous';

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,       // 'text' | 'emoji' | 'gif'
      content,
      sender: senderName,
      timestamp: Date.now(),
    };

    party.queue.push(message);
    // Keep queue bounded
    if (party.queue.length > 100) party.queue.shift();

    // Broadcast to everyone in the party (TV + all guests)
    io.to(`party:${code}`).emit('party:message', message);
    console.log(`[${code}] ${senderName}: ${content}`);
  });

  socket.on('disconnect', () => {
    if (!currentPartyCode) return;
    const party = parties.get(currentPartyCode);
    if (!party) return;

    const member = party.members.get(socket.id);
    if (member) {
      party.members.delete(socket.id);
      io.to(`party:${currentPartyCode}`).emit('party:member-left', {
        name: member.name,
        memberCount: party.members.size,
      });
      console.log(`${member.name} left party ${currentPartyCode}`);
    }

    if (party.tvSocketId === socket.id) {
      party.tvSocketId = null;
      console.log(`TV disconnected from party ${currentPartyCode}`);
    }
  });
});


const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`Party server running on port ${PORT}`));
