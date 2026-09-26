FROM ubuntu:22.04

# Prevent interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive

# Install Python, pip, and SUMO (for simulation)
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    python3-venv \
    sumo \
    sumo-tools \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# The backend relies on relative paths to the parent directory for Solver and sumo data
# (PROJECT_ROOT = parent of backend/)
# So we structure the container exactly like the local repo

COPY backend/requirements.txt ./backend/
RUN pip3 install --no-cache-dir -r backend/requirements.txt --break-system-packages

# Copy the necessary folders
COPY backend ./backend
COPY Solver ./Solver
COPY sumo ./sumo

# Set working directory to backend
WORKDIR /app/backend

# Expose Flask port
EXPOSE 5050

# Bind to 0.0.0.0 so it's accessible from outside the container
ENV FLASK_HOST=0.0.0.0
ENV FLASK_PORT=5050
ENV SUMO_BINARY=sumo

# Start Flask
CMD ["python3", "app.py"]
