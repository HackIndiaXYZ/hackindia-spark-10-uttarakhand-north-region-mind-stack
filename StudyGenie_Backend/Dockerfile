FROM node:22-bookworm

# Install Python + FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --------------------------------------------------
# Install top-level AI dependencies
# --------------------------------------------------

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# --------------------------------------------------
# Install backend dependencies
# --------------------------------------------------

COPY backend/package.json backend/package-lock.json ./backend/

RUN cd backend && npm ci --omit=dev

# --------------------------------------------------
# Install Python dependencies
# --------------------------------------------------

COPY backend/python/requirements.txt ./backend/python/requirements.txt

RUN python3 -m pip install \
    --break-system-packages \
    -r backend/python/requirements.txt

# --------------------------------------------------
# Copy project
# --------------------------------------------------

COPY AI ./AI
COPY backend ./backend

WORKDIR /app/backend

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "start"]