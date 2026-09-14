# Checkpoint (Anti-Doomscroller) 🧠⚡

> **Answer a question before your next reel, and before you keep chatting.**
> Stop mindless doomscrolling on **Instagram Reels, YouTube Shorts, TikTok, WhatsApp & Snapchat** with AI-generated JEE & NEET practice questions.

---

## 📲 Direct Downloads & Source

| Platform | Link | Setup Guide |
| :--- | :--- | :--- |
| **🌐 Chrome / Edge Extension** | [**👉 Download Extension (.zip)**](https://github.com/sohum123451/Antidoomscroller/raw/main/dist/checkpoint-extension.zip) | [Browser Setup Guide](#-chrome--edge-extension-guide) |
| **🤖 Android App Project** | [**👉 View Android Source Code**](https://github.com/sohum123451/Antidoomscroller/tree/main/checkpoint-android) | [Android Setup Guide](#-android-installation-guide) |

---

## 🌐 Chrome & Edge Extension Guide

### Step 1: Download & Extract
1. Click [**Download Extension (.zip)**](https://github.com/sohum123451/Antidoomscroller/raw/main/dist/checkpoint-extension.zip) to download the ZIP file.
2. Extract the downloaded ZIP file on your computer.

### Step 2: Load into Browser
1. Open Google Chrome at `chrome://extensions` or Microsoft Edge at `edge://extensions`.
2. Enable the **Developer mode** toggle in the top-right / left sidebar.
3. Click **Load unpacked** and select the `reelgate` folder.
4. Click the Checkpoint extension icon in your browser toolbar and click **Sign in with Google**.

---

## 🤖 Android App Guide

The native Android app code is located in the [`checkpoint-android/`](https://github.com/sohum123451/Antidoomscroller/tree/main/checkpoint-android) directory.

### Step 1: Permissions Setup
1. Launch **Checkpoint** on your Android phone.
2. Tap **Enable Accessibility Service** $\rightarrow$ select **Checkpoint Anti-Doomscroller** $\rightarrow$ toggle **ON**.
3. Tap **Enable Display Over Apps** $\rightarrow$ find **Checkpoint** $\rightarrow$ toggle **ON**.
4. Select your syllabus mode (**JEE** or **NEET**) and sign in with Google!

🎉 Now when you open native **Instagram, YouTube Shorts, TikTok, WhatsApp, or Snapchat**, Checkpoint will prompt you with an interactive question gate before you keep scrolling!

---

## ✨ Features

- **🧠 Serverless Gemini AI Backend**: Questions generated on-the-fly using Google Gemini 1.5 Flash Lite and cached in Turso Vector DB.
- **📚 Syllabus Gating**: Full offline fallback for **JEE & NEET** (Physics, Chemistry, Biology, Mathematics).
- **🔒 Multi-User & Google OAuth**: Fast, secure authentication across web extensions and native Android apps.
- **⚡ Zero Interruption**: Keeps questions pre-buffered locally so gates load in 0ms without waiting for network calls.

---

## ⚙️ Backend Architecture

- **Worker API**: `https://checkpoint-api.sohum123451.workers.dev`
- **Database**: Turso LibSQL (Vector Search Deduplication + Multi-User Schemas)
- **AI Model**: `gemini-flash-lite-latest` + `gemini-embedding-001`
