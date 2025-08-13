# DevOps Quality Tool – Backend

This is the backend server for the DevOps Quality Tool. It serves an API that provides a health check and will later handle analysis of GitHub repositories.

---

### Tech Stack

- Node.js 22+
- Express
- TypeScript
- Nodemon (dev)
- CORS enabled for local frontend access

---

## Setup Overview

Open your terminal and run the following commands to set up the full environment:

### Full Setup Script

```bash
# Copy env.sample in .env file
cp .env.sample .env

# Install dependencies
npm install

# Start the development server
npm run dev

# Run SonarQube (via Docker)
docker run -d --name sonarqube -p 9000:9000 sonarqube:lts

# Install Sonar Scanner globally
npm install -g sonar-scanner

# Install ngrok (macOS with Homebrew)
brew install ngrok

# Add ngrok authtoken (replace with your actual token)
ngrok config add-authtoken your_auth_token_here

# Start ngrok tunnel for backend server
ngrok http 4000

# Add ngrok URL to .env file

# Install and start PostgreSQL (macOS with Homebrew)
brew install postgresql
brew services start postgresql

# Get your system username (for .env DB_USER value)
whoami
