#!/bin/bash

echo "🚀 Starting Sigalit Backend + Frontend Development Server..."
echo "📍 Backend API: http://localhost:4000"
echo "📍 Frontend: http://localhost:4000"
echo ""

# Check if nodemon is installed
if ! command -v nodemon &> /dev/null; then
    echo "📦 Installing nodemon globally..."
    npm install -g nodemon
fi

# Start the server with nodemon
echo "🔄 Starting server with auto-restart..."
nodemon app.js
