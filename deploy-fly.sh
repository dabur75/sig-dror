#!/bin/bash

# Sigalit Project Fly.io Deployment Script
# This script deploys the project to Fly.io with SQLite database support

set -e

echo "🚀 Starting Sigalit deployment to Fly.io..."

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Please install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if user is logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io first:"
    echo "   fly auth login"
    exit 1
fi

echo "✅ Fly CLI authenticated"

# Create the app if it doesn't exist
if ! fly apps list | grep -q "sigalit-dror"; then
    echo "📱 Creating Fly.io app: sigalit-dror"
    fly apps create sigalit-dror --org personal
else
    echo "✅ App sigalit-dror already exists"
fi

# Create volume for SQLite database if it doesn't exist
if ! fly volumes list | grep -q "sigalit_data"; then
    echo "💾 Creating persistent volume for SQLite database"
    fly volumes create sigalit_data --size 1 --region fra
else
    echo "✅ Volume sigalit_data already exists"
fi

# Copy local database to a temporary location for deployment
echo "📋 Preparing database for deployment..."
if [ -f "sigalit.db" ]; then
    echo "✅ Local database found, will be deployed"
    # The database will be copied during Docker build
else
    echo "⚠️  No local database found, will create empty database on first run"
fi

# Deploy the application
echo "🚀 Deploying to Fly.io..."
fly deploy

# Check deployment status
echo "🔍 Checking deployment status..."
fly status

# Show app URL
echo "🌐 Your app is available at:"
fly open

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Visit your app URL to verify it's working"
echo "   2. Check logs: fly logs"
echo "   3. Scale if needed: fly scale count 1"
echo "   4. Monitor: fly dashboard"
