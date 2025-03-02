# Break-Pong Multiplayer

Break-Pong is a real-time multiplayer game that combines elements of **Pong** and **Breakout**. Play with friends, break bricks, and compete for the highest score!

## 🚀 Features
- **Multiplayer support** (via WebSockets)
- **Classic, Team, and Cooperative game modes**
- **Dynamic ball physics & power-ups**
- **Global and room-based leaderboards**
- **Real-time chat with notifications**
- **Mobile-friendly controls**

## 🛠️ Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express, Socket.io
- **Hosting:** Render (WebSocket support)

## 🔧 Installation & Setup
### 1️⃣ Clone the Repository
```sh
git clone https://github.com/YOUR-USERNAME/BreakPong-Multiplayer.git
cd BreakPong-Multiplayer
```

### 2️⃣ Install Dependencies
```sh
npm install
```

### 3️⃣ Start the Server
```sh
npm start
```
The game will be available at `http://localhost:3000`.

## 🌍 Deployment (Render)
### Steps:
1. **Push the project to GitHub**
2. **Go to [Render](https://render.com/)** and create a new Web Service
3. **Connect to your GitHub repo** and set the build command:
   ```sh
   npm install
   ```
4. **Set the start command:**
   ```sh
   node server.js
   ```
5. **Deploy & get your live URL!**

### 🎮 Connect to the WebSocket server
Make sure the **frontend connects to the correct WebSocket URL** in `script.js`:
```js
const socket = io("https://breakpong-server.onrender.com", {
    transports: ["websocket", "polling"]
});
```

## 🕹️ How to Play
1. **Join or create a room**
2. **Wait for an opponent**
3. **Break bricks while keeping the ball in play**
4. **Win by eliminating all bricks or outscoring your opponent!**

## 📜 License
This project is open-source and available under the **MIT License**.

---
### 🎯 Want to contribute?
Feel free to fork the project, submit pull requests, or report issues!

Happy gaming! 🎮🔥
