# ==============================================================================
# Agri Vaahan (ಅಗ್ರಿ ವಾಹನ) • Dockerfile
# Production-ready, universal container for Hugging Face Spaces, Render, or Railway
# Includes Chromium & Chromedriver for autonomous Krishi Marata Vahini scraping
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PORT=7860

# Install Chromium, Chromedriver, Indian/Kannada fonts, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-noto-core \
    fonts-knda \
    curl \
    ca-certificates \
    && ln -s /usr/bin/chromium /usr/bin/google-chrome || true \
    && rm -rf /var/lib/apt/lists/*

# Set up non-root user (UID 1000) for security & Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

# Install Python dependencies
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code and DuckDB database
COPY --chown=user:user . .

# Ensure DuckDB file and app directory are writable by user 1000 for live scraping
RUN chmod -R 777 /app

# Switch to non-root user
USER user

# Expose default port (7860 for Hugging Face, overridden dynamically by Render/Railway via $PORT)
EXPOSE 7860

# Start Uvicorn web server
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-7860}"]

