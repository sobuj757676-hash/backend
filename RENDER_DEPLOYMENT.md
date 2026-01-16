# Deploy to Render.com - Complete Guide

This guide will walk you through deploying your Parental Control Backend to Render.com.

## Prerequisites

- A GitHub account
- A Render.com account (free tier available)
- Your backend code pushed to a GitHub repository

## Step 1: Prepare Your Repository

1. **Ensure your backend code is in a Git repository**
   ```bash
   cd backend
   git init
   git add .
   git commit -m "Prepare backend for Render deployment"
   ```

2. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/yourusername/your-repo-name.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Create a New Web Service on Render

### Option A: Using Blueprint (Recommended)

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New" → "Blueprint"**
3. **Connect your GitHub repository**
4. **Select the repository** containing your backend
5. **Render will detect `render.yaml`** and configure everything automatically
6. **Click "Apply"** to create the service

### Option B: Manual Setup

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New" → "Web Service"**
3. **Connect your GitHub repository**
4. **Configure the following settings**:
   - **Name**: `parental-control-backend` (or your preferred name)
   - **Region**: Choose closest to your users (e.g., Oregon, Frankfurt, Singapore)
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: If backend is in a subdirectory, specify it (e.g., `backend`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid if needed)

## Step 3: Configure Environment Variables

In your Render service settings, add the following environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Sets the environment to production |
| `PORT` | `10000` | Port for the server (Render default) |
| `ALLOWED_ORIGINS` | (Optional) | Comma-separated list of allowed origins for CORS. Leave empty to allow all origins. Example: `https://yourdomain.com,https://app.yourdomain.com` |

> [!NOTE]
> Render automatically sets the `PORT` environment variable, so the server will listen on the correct port.

## Step 4: Configure Persistent Disk (Important!)

The backend stores uploaded audio recordings. To persist these across deployments:

1. **Go to your service** → **"Disks"** tab
2. **Add Disk**:
   - **Name**: `uploads`
   - **Mount Path**: `/opt/render/project/src/public/uploads`
   - **Size**: `1 GB` (Free tier allows up to 1GB)
3. **Save**

> [!IMPORTANT]
> Without a persistent disk, all uploaded recordings will be lost when the service restarts!

## Step 5: Deploy

1. **Render will automatically deploy** when you push to GitHub
2. **Monitor the build logs** in the Render dashboard
3. **Wait for deployment to complete** (usually 2-5 minutes)

## Step 6: Verify Deployment

Once deployed, test your backend:

1. **Get your Render URL**: `https://your-app-name.onrender.com`
2. **Test the health endpoint**: 
   ```bash
   curl https://your-app-name.onrender.com/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-01-16T...",
     "uptime": 123.45,
     "version": "1.0.0"
   }
   ```

3. **Visit the dashboard**: Open `https://your-app-name.onrender.com` in your browser

## Step 7: Update Android App

Update your Android app to connect to the Render backend:

1. **Open RemoteConfigManager.kt** or wherever you define the backend URL
2. **Update the Socket.IO URL**:
   ```kotlin
   private const val SOCKET_URL = "https://your-app-name.onrender.com"
   ```
3. **Rebuild and test the Android app**

## Important Notes

### Free Tier Limitations

> [!WARNING]
> Render's free tier has the following limitations:
> - **Spin down after 15 minutes of inactivity** - The first request after inactivity may take 30-60 seconds
> - **750 hours/month** - Shared across all free services
> - **1GB persistent disk** - Enough for ~100-200 audio recordings
> - **100GB bandwidth/month**

### Keeping Your Service Awake (Optional)

To prevent spin-down, you can use a service like:
- **UptimeRobot** (free) - Ping your endpoint every 5 minutes
- **Cron-job.org** (free) - Schedule health check requests

Configure it to ping: `https://your-app-name.onrender.com/health`

### Custom Domain (Optional)

1. **Go to your service** → **"Settings"** → **"Custom Domain"**
2. **Add your domain**: `api.yourdomain.com`
3. **Update DNS** with the provided CNAME record
4. **Update ALLOWED_ORIGINS** environment variable to include your custom domain

## Troubleshooting

### Build Fails

- Check the build logs in Render dashboard
- Ensure `package.json` is present in the root directory
- Verify Node version compatibility (requires Node >= 18)

### Connection Issues from Android App

- Verify the Socket.IO URL is correct (include `https://`)
- Check CORS settings - ensure Android app origin is allowed
- Test health endpoint first to confirm server is running

### Recordings Not Persisting

- Ensure persistent disk is configured correctly
- Check mount path: `/opt/render/project/src/public/uploads`
- Verify disk size has not exceeded limit

### Socket.IO Connection Fails

- Ensure you're using `https://` (not `http://` or `ws://`)
- Socket.IO will automatically use WebSocket over HTTPS
- Check that CORS origins are configured correctly

### Server Won't Start

- Check environment variables are set correctly
- Review logs for specific error messages
- Ensure PORT is not hardcoded anywhere

## Monitoring & Logs

- **View Logs**: Render Dashboard → Your Service → "Logs" tab
- **Real-time logs**: Click "Live Logs" for streaming output
- **Health checks**: Render automatically monitors `/health` endpoint

## Updating Your Backend

When you push changes to GitHub:
1. **Render auto-deploys** from your connected branch
2. **Zero downtime** - Render keeps old version running during deploy
3. **Rollback available** - Can revert to previous deployments

## Security Best Practices

1. **Use HTTPS only** - Render provides free SSL certificates
2. **Set specific CORS origins** in production instead of allowing all
3. **Keep dependencies updated**: `npm audit` and `npm update`
4. **Monitor logs** for suspicious activity

## Support & Resources

- **Render Documentation**: https://render.com/docs
- **Socket.IO Documentation**: https://socket.io/docs/v4/
- **Your Backend Health**: `https://your-app-name.onrender.com/health`
- **Your Dashboard**: `https://your-app-name.onrender.com`

## Next Steps

After successful deployment:

1. ✅ Test all features from the Android app
2. ✅ Verify audio recording upload and playback
3. ✅ Test real-time monitoring features
4. ✅ Monitor disk usage in Render dashboard
5. ✅ Set up automated backups if needed
6. ✅ Consider upgrading to paid plan for better performance

---

**Your backend is now ready for production use!** 🎉
