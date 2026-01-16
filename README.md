# Parental Control Backend

Backend server for the Parental Control Android application. Built with Node.js, Express, and Socket.IO for real-time monitoring and communication.

## Features

- **Real-time Communication**: Socket.IO for bidirectional communication with Android app
- **Audio Monitoring**: Live audio streaming and offline recording uploads
- **Video Monitoring**: Live camera feed with controls (switch camera, flash, brightness)
- **Remote Configuration**: Update app settings remotely
- **Notification Monitoring**: Receive and view device notifications
- **Storage Management**: Track device storage statistics
- **Permission Alerts**: Get notified when permissions are revoked
- **App Icon Control**: Hide/show app icon remotely
- **WebRTC Signaling**: Pass-through signaling for peer-to-peer connections

## Tech Stack

- **Node.js** >= 18.0.0
- **Express** - Web framework
- **Socket.IO** - Real-time bidirectional communication
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Compression** - Response compression

## Project Structure

```
backend/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── render.yaml            # Render.com deployment config
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore rules
├── RENDER_DEPLOYMENT.md   # Deployment guide
├── README.md             # This file
└── public/
    ├── index.html        # Web dashboard
    ├── css/
    │   └── style.css     # Dashboard styles
    ├── js/
    │   └── dashboard.js  # Dashboard JavaScript
    └── uploads/          # Audio recordings (persistent disk on Render)
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file** (optional)
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to customize settings.

4. **Start the server**
   ```bash
   npm start
   ```
   Or for development:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port for the server |
| `NODE_ENV` | `development` | Environment (development/production) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed CORS origins |

## API Endpoints

### HTTP Endpoints

- `GET /` - Web dashboard
- `GET /health` - Health check endpoint (returns status, uptime, version)
- `GET /api/info` - API information
- `GET /uploads/:filename` - Access uploaded recordings

### Socket.IO Events

#### From Android App → Server

- `audio_stream` - Live audio data
- `video_frame` - Live video frames
- `status_update` - App status updates
- `upload_audio_file` - Offline recording upload
- `current_config` - Current app configuration
- `storage_stats` - Device storage statistics
- `notification_posted` - New notification
- `offline_notifications` - Batch of offline notifications
- `permission_revoked` - Permission was revoked
- `webrtc_offer/answer/ice_candidate` - WebRTC signaling

#### From Dashboard → Android App

- `START_AUDIO` - Start audio monitoring
- `STOP_AUDIO` - Stop audio monitoring
- `START_CAM` - Start camera
- `STOP_CAM` - Stop camera
- `SWITCH_CAM` - Switch camera (front/back)
- `TOGGLE_FLASH` - Toggle camera flash
- `BRIGHTNESS_UP/DOWN` - Adjust screen brightness
- `UPDATE_CONFIG` - Update app configuration
- `GET_CONFIG` - Request current configuration
- `GET_STATUS` - Request app status
- `GET_STORAGE_STATS` - Request storage statistics
- `HIDE_APP_ICON` - Hide app icon
- `SHOW_APP_ICON` - Show app icon

## Deployment

See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for detailed deployment instructions for Render.com.

### Quick Deploy to Render

1. **Push code to GitHub**
2. **Connect repository to Render**
3. **Render will auto-detect `render.yaml`**
4. **Configure persistent disk for uploads**
5. **Deploy!**

## Development

### Running Locally

```bash
npm run dev
```

Visit http://localhost:3000 to access the dashboard.

### Testing Socket.IO Connection

You can test the Socket.IO connection using the web dashboard or any Socket.IO client:

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected!');
});
```

## Production Considerations

### CORS Configuration

For production, set specific allowed origins:

```env
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### Persistent Storage

On Render, configure a persistent disk at `/opt/render/project/src/public/uploads` to prevent data loss.

### Health Monitoring

Set up monitoring for the `/health` endpoint to track uptime:
- **UptimeRobot** - Free monitoring service
- **Render's built-in monitoring** - Included in paid plans

### Security

- Uses **Helmet** for security headers
- **CORS** properly configured
- **HTTPS only** in production (automatic on Render)
- Request size limits (50MB for file uploads)

## Troubleshooting

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

Solution: Change the port in `.env` or kill the process using the port:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <process_id> /F

# Linux/Mac
lsof -i :3000
kill -9 <process_id>
```

### Socket.IO Connection Failed

- Verify CORS settings
- Check that the server is running
- Ensure firewall isn't blocking the port
- Use HTTPS in production

### Uploads Not Saving

- Check that `public/uploads/` directory exists
- Verify write permissions
- On Render, ensure persistent disk is configured

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is for educational and monitoring purposes with proper consent.

## Support

For deployment issues, see [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md).

---

Built with ❤️ for secure parental monitoring
