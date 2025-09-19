const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let currentTrack = null;
let isPlaying = false;
let masterVolume = 70;
let adminSockets = new Set();
let listeners = 0;

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Sync Music Server Running',
    listeners: io.engine.clientsCount,
    currentTrack: currentTrack ? currentTrack.title : 'None',
    isPlaying: isPlaying 
  });
});

io.on('connection', (socket) => {
  listeners = io.engine.clientsCount;
  console.log('User connected:', socket.id, 'Total:', listeners);
  
  // Send current state to new connections
  socket.emit('sync-data', {
    track: currentTrack,
    isPlaying: isPlaying,
    volume: masterVolume,
    timestamp: Date.now()
  });

  // Broadcast listener count to all clients
  io.emit('listener-count', { count: listeners });

  socket.on('admin-login', (data) => {
    console.log('Admin login attempt');
    if (data.password === 'admin123') {
      adminSockets.add(socket.id);
      socket.emit('admin-authenticated', { success: true });
      console.log('Admin authenticated:', socket.id);
    } else {
      socket.emit('admin-authenticated', { success: false });
      console.log('Admin login failed');
    }
  });

  socket.on('play-track', (data) => {
    if (adminSockets.has(socket.id)) {
      currentTrack = data.track;
      isPlaying = true;
      console.log('Playing track:', currentTrack.id);
      
      io.emit('track-update', { track: currentTrack });
      io.emit('playback-state', { isPlaying: true, timestamp: data.timestamp });
    }
  });

  socket.on('pause-track', (data) => {
    if (adminSockets.has(socket.id)) {
      isPlaying = false;
      console.log('Pausing track');
      io.emit('playback-state', { isPlaying: false, timestamp: data.timestamp });
    }
  });

  socket.on('resume-track', (data) => {
    if (adminSockets.has(socket.id)) {
      isPlaying = true;
      console.log('Resuming track');
      io.emit('playback-state', { isPlaying: true, timestamp: data.timestamp });
    }
  });

  socket.on('stop-track', (data) => {
    if (adminSockets.has(socket.id)) {
      currentTrack = null;
      isPlaying = false;
      console.log('Stopping track');
      
      io.emit('track-update', { track: null });
      io.emit('playback-state', { isPlaying: false, timestamp: data.timestamp });
    }
  });

  socket.on('set-volume', (data) => {
    if (adminSockets.has(socket.id)) {
      masterVolume = data.volume;
      console.log('Setting volume:', masterVolume);
      io.emit('volume-update', { volume: masterVolume });
    }
  });

  socket.on('force-sync', (data) => {
    if (adminSockets.has(socket.id)) {
      currentTrack = data.track;
      isPlaying = data.isPlaying;
      masterVolume = data.volume;
      
      console.log('Force sync triggered');
      
      io.emit('sync-data', {
        track: currentTrack,
        isPlaying: isPlaying,
        volume: masterVolume,
        timestamp: data.timestamp
      });
    }
  });

  socket.on('request-sync', () => {
    socket.emit('sync-data', {
      track: currentTrack,
      isPlaying: isPlaying,
      volume: masterVolume,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    listeners = io.engine.clientsCount;
    adminSockets.delete(socket.id);
    console.log('User disconnected:', socket.id, 'Total:', listeners);
    
    // Broadcast updated listener count
    io.emit('listener-count', { count: listeners });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎵 Sync Music Server running on port ${PORT}`);
});