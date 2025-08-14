# 🚀 Sigalit Project - Fly.io Deployment Guide

This guide will help you deploy the Sigalit project to Fly.io with SQLite database support.

## 📋 Prerequisites

1. **Fly.io Account**: Sign up at [fly.io](https://fly.io)
2. **Fly CLI**: Install the Fly.io command-line tool
3. **Docker**: Ensure Docker is running on your machine

## 🔧 Installation

### 1. Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Login to Fly.io
```bash
fly auth login
```

## 🚀 Quick Deployment

### Option 1: Automated Deployment (Recommended)
```bash
# Make the deployment script executable
chmod +x deploy-fly.sh

# Run the deployment script
./deploy-fly.sh
```

### Option 2: Manual Deployment
```bash
# Create the app
fly apps create sigalit-dror --org personal

# Create persistent volume for SQLite database
fly volumes create sigalit_data --size 1 --region fra

# Deploy the application
fly deploy
```

## 📁 Project Structure for Fly.io

```
LocalSites/sigalit-backend/
├── app.js                 # Main application (updated for Fly.io)
├── package.json           # Node.js dependencies
├── public/                # Frontend files
├── fly.toml              # Fly.io configuration
├── Dockerfile            # Docker configuration
├── .dockerignore         # Docker exclusions
├── deploy-fly.sh         # Deployment script
└── sigalit.db            # SQLite database (will be mounted)
```

## 🔍 Configuration Files

### fly.toml
- **App Name**: `sigalit-dror`
- **Region**: `fra` (Frankfurt)
- **Memory**: 512MB
- **CPU**: 1 shared core
- **Port**: 8080
- **Health Check**: `/health` endpoint

### Dockerfile
- **Base Image**: Node.js 18 Alpine
- **SQLite Support**: Installed via Alpine package manager
- **Data Directory**: `/data` (mounted volume)
- **Health Check**: Built-in container health monitoring

## 💾 Database Configuration

### SQLite Database
- **Local Development**: Uses `./sigalit.db`
- **Production (Fly.io)**: Uses `/data/sigalit.db`
- **Persistence**: Stored in Fly.io volume `sigalit_data`
- **Size**: 1GB volume allocated

### Database Migration
The application automatically:
1. Creates tables if they don't exist
2. Initializes the database schema
3. Preserves data between deployments

## 🌐 Health Monitoring

### Health Check Endpoint
```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-14T08:56:00.000Z",
  "database": "connected",
  "environment": "production"
}
```

## 📊 Deployment Commands

### Check Status
```bash
fly status
```

### View Logs
```bash
fly logs
```

### Open App
```bash
fly open
```

### Scale Application
```bash
# Scale to 1 instance (always running)
fly scale count 1

# Scale to 0 instances (sleep when not in use)
fly scale count 0
```

### Monitor Resources
```bash
fly dashboard
```

## 🔒 Security & Environment

### Environment Variables
- `NODE_ENV`: Set to `production`
- `PORT`: Set to `8080`

### CORS Configuration
- Enabled for web access
- Configured for production use

### Database Security
- SQLite database is private to the container
- No external database connections
- Data encrypted at rest (Fly.io infrastructure)

## 🚨 Troubleshooting

### Common Issues

#### 1. Database Connection Errors
```bash
# Check database volume
fly volumes list

# Verify volume attachment
fly status
```

#### 2. Health Check Failures
```bash
# Check application logs
fly logs

# Verify database file exists
fly ssh console
ls -la /data/
```

#### 3. Deployment Failures
```bash
# Check build logs
fly logs --build

# Verify Docker build locally
docker build -t sigalit-test .
```

### Debug Commands
```bash
# SSH into the running container
fly ssh console

# Check database status
fly ssh console -C "sqlite3 /data/sigalit.db 'SELECT 1;'"

# View application files
fly ssh console -C "ls -la /app/"
```

## 📈 Scaling & Performance

### Resource Limits
- **Memory**: 512MB (can be increased)
- **CPU**: 1 shared core
- **Storage**: 1GB volume

### Auto-scaling
- **Auto-stop**: Enabled (saves costs)
- **Auto-start**: Enabled (responds to traffic)
- **Min instances**: 0 (sleeps when not in use)

### Performance Optimization
- **Static files**: Served efficiently via Express
- **Database**: SQLite with better-sqlite3 (high performance)
- **Caching**: Built-in Node.js optimizations

## 💰 Cost Optimization

### Free Tier
- **3 shared-cpu-1x 256mb apps**
- **3GB persistent volume storage**
- **160GB outbound data transfer**

### Cost Control
- **Auto-stop machines**: Saves when not in use
- **Efficient resource usage**: Optimized for small workloads
- **Volume sizing**: Only allocate what you need

## 🔄 Updates & Maintenance

### Deploy Updates
```bash
# Deploy latest changes
fly deploy

# Rollback if needed
fly deploy --image-label <previous-version>
```

### Database Backups
```bash
# Download database from volume
fly volumes download sigalit_data

# Or backup via SSH
fly ssh console -C "cp /data/sigalit.db /tmp/backup.db"
```

## 📞 Support

### Fly.io Support
- **Documentation**: [fly.io/docs](https://fly.io/docs)
- **Community**: [fly.io/community](https://fly.io/community)
- **Status**: [fly.io/status](https://fly.io/status)

### Project Support
- **Issues**: GitHub repository issues
- **Documentation**: This guide and project README

## ✅ Deployment Checklist

- [ ] Fly CLI installed and authenticated
- [ ] App created on Fly.io
- [ ] Volume created for database
- [ ] Application deployed successfully
- [ ] Health check passing
- [ ] Database accessible
- [ ] Frontend loading correctly
- [ ] All API endpoints working

---

**Happy Deploying! 🚀**

Your Sigalit project is now ready for production deployment on Fly.io with full SQLite database support.
