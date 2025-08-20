# Docker Deployment Guide

This guide explains how to run the Event Concierge Backend using Docker with Bun runtime.

## 🚀 Quick Start

### 1. Environment Setup

Copy the docker environment template:
```bash
cp .env.docker .env
```

Edit `.env` with your actual configuration values:
- AWS credentials for S3 and SES
- Twilio credentials for WhatsApp
- JWT secret (make it long and random for production)
- Other service configurations

### 2. Build and Run

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 3. Access Services

- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/docs
- **Health Check**: http://localhost:3001/health
- **Database Health**: http://localhost:3001/db-health
- **MongoDB**: mongodb://localhost:27017
- **MongoDB UI** (optional): http://localhost:8081

## 🛠️ Development Commands

```bash
# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Stop and remove volumes (⚠️ this will delete database data)
docker-compose down -v

# Rebuild only backend
docker-compose up --build backend

# Run with MongoDB Express UI
docker-compose --profile tools up
```

## 📊 Database Management

### Initialize Database
The database is automatically initialized with indexes for optimal performance.

### Run Prisma Commands
```bash
# Generate Prisma client
docker-compose exec backend bun run prisma:generate

# Push schema changes
docker-compose exec backend bun run prisma:push

# Run setup script (create initial data)
docker-compose exec backend bun run setup

# Create dummy users for testing
docker-compose exec backend bun run create-dummy-users
```

### Access MongoDB Shell
```bash
# Connect to MongoDB
docker-compose exec mongo mongosh event-concierge

# Or connect as admin
docker-compose exec mongo mongosh -u admin -p password --authenticationDatabase admin
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MongoDB connection string | `mongodb://mongo:27017/event-concierge` |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3/SES | Required |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Required |
| `AWS_REGION` | AWS region | `ap-south-1` |
| `AWS_S3_BUCKET` | S3 bucket name | Required |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Optional |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Optional |
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Backend port | `3001` |

### MongoDB Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_ROOT_USERNAME` | MongoDB admin username | `admin` |
| `MONGO_ROOT_PASSWORD` | MongoDB admin password | `password` |

## 🏗️ Production Deployment

### Security Considerations

1. **Change default passwords**:
   ```bash
   MONGO_ROOT_PASSWORD=your-secure-password
   JWT_SECRET=your-very-long-random-jwt-secret-key
   ```

2. **Use environment-specific URLs**:
   ```bash
   APP_URL=https://yourdomain.com
   SES_FROM_EMAIL=noreply@yourdomain.com
   ```

3. **Enable MongoDB authentication**:
   Update the `DATABASE_URL` to include credentials:
   ```bash
   DATABASE_URL=mongodb://app:password@mongo:27017/event-concierge
   ```

### Performance Optimization

1. **Resource limits** (add to docker-compose.yaml):
   ```yaml
   backend:
     deploy:
       resources:
         limits:
           cpus: '0.5'
           memory: 512M
   ```

2. **MongoDB optimization**:
   ```yaml
   mongo:
     command: mongod --wiredTigerCacheSizeGB 0.25
   ```

## 🔍 Troubleshooting

### Common Issues

1. **Port conflicts**:
   ```bash
   # Check if ports are in use
   lsof -i :3001
   lsof -i :27017
   ```

2. **Permission errors**:
   ```bash
   # Fix file permissions
   chmod +x scripts/mongo-init.js
   ```

3. **Database connection issues**:
   ```bash
   # Check MongoDB logs
   docker-compose logs mongo
   
   # Test database connection
   docker-compose exec backend bun run prisma:validate
   ```

4. **Build cache issues**:
   ```bash
   # Clear build cache
   docker-compose build --no-cache backend
   ```

### Health Checks

The services include health checks:
- **Backend**: HTTP check on `/health`
- **MongoDB**: MongoDB ping command

Check health status:
```bash
docker-compose ps
```

## 📝 Logs and Monitoring

```bash
# Follow all logs
docker-compose logs -f

# Backend logs only
docker-compose logs -f backend

# MongoDB logs only
docker-compose logs -f mongo

# Last 100 lines
docker-compose logs --tail=100 backend
```

## 🧹 Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove containers, volumes, and images
docker-compose down -v --rmi all

# Clean up Docker system
docker system prune -f
```