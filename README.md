```markdown
# DevOps Quality Tool – Backend

This is the backend server for the DevOps Quality Tool. It serves an API that provides a health check and will later handle analysis of GitHub repositories.

## 🧰 Tech Stack

- Node.js 22+
- Express
- TypeScript
- Nodemon (dev)
- CORS enabled for local frontend access

## 🔧 Setup

1. **Install dependencies**
   ```bash
   npm run dev
   ```
2. **Start the development server**
   ```bash
    npm run dev
   ```
3. Open your browser and go to `http://localhost:4000/health` to check the health status.

# DevOps Quality Tool – SonarQube Setup
    ```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:lts
npm install -g sonar-scanner

    ```
