# TaskFlow — Multi-Container DevOps & Infrastructure Demonstration

A polished, lightweight, self-contained SaaS web application engineered specifically for demonstrating **Docker containerization, container-to-container networking, service discovery, isolated service architectures, and persistent named volumes**.

---

## 1. Architecture Overview

```
                                  HOST BROWSER
                         (e.g., http://<SERVER_IP>:8080)
                                       │
                                       │ Published Port (8080:80)
                                       ▼
                       ┌───────────────────────────────┐
                       │        taskflow-nginx         │
                       │   Static Frontend & Proxy     │
                       │          (Port 80)            │
                       └───────────────┬───────────────┘
                                       │
                                       │ http://backend:3000
                                       │ (Custom Docker Bridge Network)
                                       ▼
                       ┌───────────────────────────────┐
                       │       taskflow-backend        │
                       │     Node.js / Express API     │
                       │          (Port 3000)          │
                       └───────────────┬───────────────┘
                                       │
                                       │ mongodb://mongodb:27017/taskflow
                                       │ (MongoDB Wire Protocol)
                                       ▼
                       ┌───────────────────────────────┐
                       │       taskflow-mongodb        │
                       │           MongoDB 8           │
                       │         (Port 27017)          │
                       └───────────────┬───────────────┘
                                       │
                                       │ Mount: /data/db
                                       ▼
                       ┌───────────────────────────────┐
                       │      taskflow-mongo-data      │
                       │   (Persistent Named Volume)   │
                       └───────────────────────────────┘
```

---

## 2. Technology Stack & Container Responsibilities

| Container / Component | Image / Base | Internal Port | Host Published | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **`taskflow-nginx`** | `nginx:alpine` | `80` | **`8080:80`** | Serves static frontend assets (HTML/CSS/JS) and acts as reverse proxy routing `/api/*` to the backend. |
| **`taskflow-backend`** | `node:20-alpine` | `3000` | *None* | Express REST API that handles business logic, input validation, and database operations. |
| **`taskflow-mongodb`** | `mongo:8` | `27017` | *None* | Document database storing task records persistently. |
| **`taskflow-network`** | Docker Bridge | -- | -- | Provides internal DNS service discovery and isolated container communication. |
| **`taskflow-mongo-data`**| Named Volume | -- | -- | Retains MongoDB database files across container lifecycles and rebuilds. |

---

## 3. Directory Structure

```text
taskflow-docker-demo/
├── frontend/
│   ├── index.html        # Modern SaaS UI dashboard with live container status
│   ├── styles.css        # Responsive dark-theme styling, cards, and badges
│   └── app.js            # Frontend logic, API integration, and telemetry
├── backend/
│   ├── package.json      # Dependencies (express, mongoose, cors, dotenv)
│   ├── server.js         # Minimal REST API (/api/health, /api/tasks, seed)
│   ├── Dockerfile        # Production-grade Node.js Alpine image (non-root)
│   └── .dockerignore     # Build context optimization
├── nginx/
│   ├── nginx.conf        # Static asset serving & reverse proxy configuration
│   └── Dockerfile        # Optional standalone Nginx image build
├── compose.yaml          # Standard Docker Compose definition
├── docker-compose.yml    # Backward-compatible Compose configuration
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore rules
└── README.md             # Demonstration documentation & commands
```

---

## 4. How Containers Communicate (Service Discovery)

1. **Host-to-Nginx**: The host machine maps port `8080` to Nginx container port `80`.
2. **Nginx-to-Backend**: Nginx sends API requests to `http://backend:3000/api/`. Docker's embedded DNS server resolves the hostname `backend` to the internal IP address of the backend container.
3. **Backend-to-MongoDB**: The backend connects using `mongodb://mongodb:27017/taskflow`. Docker resolves `mongodb` to the internal IP address of the MongoDB container.
4. **No Hardcoded IPs**: All connections use Docker service names. Container IP addresses can change upon restart without breaking communication.

### Why Backend & MongoDB Are Not Exposed to the Host
- **Principle of Least Privilege**: Only the public-facing gateway (Nginx) needs to be reachable by external clients.
- **Security Isolation**: MongoDB and the backend remain unexposed on the host's network interfaces, preventing unauthorized external access.

---

## 5. Host Browser Access & Virtualization Setup

The application is accessible from your physical host machine's browser via HTTP port **8080**.

### Option A: Bridged / Directly Reachable VM
If your Linux VM is configured with Bridged Networking:
1. Find your VM's IP address:
   ```bash
   ip addr show
   ```
2. Open your physical host browser:
   ```text
   http://<VM_IP_ADDRESS>:8080
   ```

### Option B: NAT Virtualization with Port Forwarding
If your Linux VM uses NAT (VirtualBox, VMware, KVM, UTM, or WSL2):
1. Configure port forwarding in your VM hypervisor settings:
   - **Host Port**: `8080`
   - **Guest Port**: `8080`
2. Open your host browser:
   ```text
   http://localhost:8080
   ```

### Firewall Rule (RHEL / CentOS / Rocky Linux / Fedora)
If your Linux host runs `firewalld`, permit traffic on port 8080:
```bash
sudo firewall-cmd --zone=public --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

---

## 6. Demonstration Walkthrough (Step-by-Step Script)

Use this structured sequence during your presentation:

### Step 1: Inspect the Project Files
```bash
cd taskflow-docker-demo
ls -la
```

### Step 2: Build the Container Images
Demonstrates building the backend image using Dockerfile layer caching:
```bash
docker-compose build
# or: docker compose build
```

### Step 3: Start the Multi-Container Stack
Starts Nginx, Backend, and MongoDB in detached mode:
```bash
docker-compose up -d
# or: docker compose up -d
```

### Step 4: Verify Running Containers & Health Checks
Show all 3 containers running with port exposure details:
```bash
docker-compose ps
# or: docker compose ps
```

### Step 5: View Real-Time Container Logs
Show logs across the stack or per individual container:
```bash
# All logs
docker-compose logs

# Backend logs
docker-compose logs backend

# Nginx logs
docker-compose logs nginx

# MongoDB logs
docker-compose logs mongodb
```

### Step 6: Inspect Docker Custom Network & Service Discovery
Show the custom bridge network, IPAM allocation, and attached containers:
```bash
docker network inspect taskflow-network
```

### Step 7: Inspect the Persistent Named Volume
Demonstrate the volume that holds MongoDB data independently of the container lifecycle:
```bash
docker volume ls
docker volume inspect taskflow-mongo-data
```

### Step 8: Interact with the UI in the Browser
1. Open `http://<SERVER_IP>:8080` in your host browser.
2. Observe the live architecture status nodes (`nginx:80 -> backend:3000 -> mongodb:27017 -> volume:data`).
3. Click **"Seed Demo Data"** or use **"Create Task"** to add several tasks with varying priorities.
4. Verify the tasks render on the dashboard and are saved to MongoDB.

---

## 7. Data Persistence Demonstration

A key DevOps concept is that **Container Lifecycle $\neq$ Data Lifecycle**.

### Test 1: Recreate the Backend Container
1. Destroy the backend container:
   ```bash
   docker stop taskflow-backend && docker rm taskflow-backend
   ```
2. Recreate and start it:
   ```bash
   docker-compose up -d backend
   ```
3. Refresh the browser at `http://<SERVER_IP>:8080`.
4. Notice all tasks and stats remain completely intact.

### Test 2: Recreate the MongoDB Container (Volume Persistence)
1. Stop and forcefully remove the MongoDB container:
   ```bash
   docker stop taskflow-mongodb && docker rm taskflow-mongodb
   ```
2. Verify the container is gone:
   ```bash
   docker ps -a
   ```
3. Recreate the MongoDB container using the existing named volume:
   ```bash
   docker-compose up -d mongodb
   ```
4. Wait 3 seconds for MongoDB initialization and refresh the browser.
5. **Result**: All task records remain fully intact because they reside in `taskflow-mongo-data`, not in the ephemeral container filesystem.

---

## 8. Tear Down Commands

### Stop Containers (Preserve Volume Data)
```bash
docker-compose down
```

### Clean Everything (Including Named Volume)
```bash
docker-compose down -v
```

---

## 9. Troubleshooting & FAQ

- **Port 8080 already in use**:
  Edit `.env` or run with `NGINX_PORT=8888 docker-compose up -d`.
- **Backend cannot reach MongoDB**:
  Ensure both containers are on `taskflow-network`. Test internal resolution with `docker exec -it taskflow-backend ping mongodb`.
- **Browser cannot reach the VM**:
  Verify the firewall permits port 8080 (`sudo firewall-cmd --list-ports`) and verify your hypervisor's port forwarding settings.
