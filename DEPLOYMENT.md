# Agri Vaahan (ಅಗ್ರಿ ವಾಹನ) • Cloud Deployment Guide

This guide walks you through deploying **Agri Vaahan** online for **free** with working live scrapers (Chromium headless) and continuous, zero-headache upgrades.

---

## Recommended Free Host: Hugging Face Spaces (Docker)

### Why Hugging Face Spaces is the Best Choice for this App:
1. **100% Free Forever**: No credit card required.
2. **Generous Specs**: **16 GB RAM** and **2 vCPUs** on the free tier (standard free tiers like Render only offer 512 MB, which often crashes when Chromium opens).
3. **Full Chromium Support**: Our `Dockerfile` installs `chromium` and `chromium-driver` seamlessly.
4. **Instant Upgrades**: Hosted on Git. Whenever you edit code or add features, a simple `git push` automatically rebuilds and updates the live site in under 2 minutes.
5. **Instant HTTPS**: Gives you a clean public URL (e.g., `https://yourusername-agri-vaahan.hf.space`).

---

## 3-Minute Deployment Steps

### Step 1: Create the Space on Hugging Face
1. Go to [huggingface.co](https://huggingface.co) and sign in (or create a free account).
2. Click your profile icon at top right → **New Space** (or visit [huggingface.co/new-space](https://huggingface.co/new-space)).
3. Fill in:
   - **Space name**: `agri-vaahan`
   - **License**: `mit`
   - **Select the Space SDK**: Choose **Docker** → **Blank**
   - **Space hardware**: Keep the default **CPU basic • 2 vCPU • 16 GB RAM • Free**
   - **Visibility**: Public (or Private if you prefer)
4. Click **Create Space**.

---

### Step 2: Initialize Git and Push Your Project
Open PowerShell or your terminal in this workspace (`m:\KSAMB\e-marukatte`):

```powershell
# 1. Initialize git
git init -b main

# 2. Add all files (the preconfigured .gitignore keeps .venv and raw CSVs out)
git add .

# 3. Create your first commit
git commit -m "Deploy Agri Vaahan terminal"

# 4. Link your Hugging Face space repository (replace YOUR_USERNAME with your Hugging Face username)
git remote add space https://huggingface.co/spaces/YOUR_USERNAME/agri-vaahan

# 5. Push to Hugging Face
git push -u space main
```

*(When prompted for credentials, use your Hugging Face username and an Access Token from **Settings → Access Tokens** with `write` permission).*

---

### Step 3: That's It!
Hugging Face will automatically:
1. Build the Docker container.
2. Install Chromium, fonts, Python packages, and DuckDB.
3. Start the FastAPI server on port 7860.
4. Provide you with a live web link!

---

## How to Update or Add Features Later (Zero-Headache Upgrades)

Whenever you add new charts, indicators, or fix anything in your local files, you simply run:

```powershell
git add .
git commit -m "Added technical indicator / UI improvement"
git push
```

Hugging Face detects the push, rebuilds the container, and updates the live site with zero downtime.

---

## Alternative: Render (Docker Web Service)

If you prefer deploying via GitHub to [Render.com](https://render.com):
1. Push this folder to a GitHub repository.
2. On Render Dashboard: **New +** → **Web Service** → Connect your GitHub repo.
3. Choose **Docker** as the Environment.
4. Set the free plan.
5. In Environment Variables, set `PORT=10000` (Render will bind automatically).
*(Note: Because Render Free limits RAM to 512 MB, heavy multi-month concurrent scraping should be scheduled via GitHub Actions to prevent OOM).*

