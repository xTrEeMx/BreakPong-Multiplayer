const socket = io("https://breakpong-server.onrender.com", {
    transports: ["websocket", "polling"]
});

const lobbyDiv = document.getElementById("lobby");
const roomsList = document.getElementById("roomsList");
const refreshRoomsBtn = document.getElementById("refreshRooms");
const createRoomBtn = document.getElementById("createRoom");

const gameContainer = document.getElementById("gameContainer");
const statusP = document.getElementById("status");
const scoreP = document.getElementById("score");
const roomScoreboardDiv = document.getElementById("roomScoreboard");
const globalScoreboardDiv = document.getElementById("globalScoreboard");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const pauseButton = document.getElementById("pauseButton");
const readyButton = document.getElementById("readyButton");

const upButton = document.getElementById("upButton");
const downButton = document.getElementById("downButton");

const toastContainer = document.getElementById("toastContainer");

const hitSound = new Audio("sounds/hit.wav");
const powerUpSound = new Audio("sounds/powerup.wav");

function playSoundEffect(audio) {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => console.log("Audio play error:", error));
    }
}

const chatModal = document.getElementById("chatModal");
const settingsModal = document.getElementById("settingsModal");
const chatToggle = document.getElementById("chatToggle");
const settingsToggle = document.getElementById("settingsToggle");
const closeChat = document.getElementById("closeChat");
const closeSettings = document.getElementById("closeSettings");

const chatMessagesDiv = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChat");

const ballSpeedInput = document.getElementById("ballSpeed");
const paddleHeightInput = document.getElementById("paddleHeight");
const brickRowsInput = document.getElementById("brickRows");
const gameModeSelect = document.getElementById("gameMode");
const updateSettingsBtn = document.getElementById("updateSettings");

chatToggle.onclick = () => {
    chatModal.style.display = "block";
    clearChatNotification();
};
settingsToggle.onclick = () => { settingsModal.style.display = "block"; };
closeChat.onclick = () => { chatModal.style.display = "none"; };
closeSettings.onclick = () => { settingsModal.style.display = "none"; };
window.onclick = event => {
    if (event.target === chatModal) chatModal.style.display = "none";
    if (event.target === settingsModal) settingsModal.style.display = "none";
};

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toastContainer.removeChild(toast);
    }, 3500);
}

let unreadMessages = 0;
function updateChatNotification() {
    chatToggle.innerText = unreadMessages > 0 ? `Chat (${unreadMessages})` : "Chat";
}
function clearChatNotification() {
    unreadMessages = 0;
    updateChatNotification();
}

const PADDLE_WIDTH = 20, BALL_SIZE = 20;
const LEFT_PADDLE_X = 50, RIGHT_PADDLE_X = 730;

let gameState = {
    leftPaddle: { y: 250 },
    rightPaddle: { y: 250 },
    ball: { x: canvas.width / 2, y: canvas.height / 2 },
    scores: { left: 0, right: 0 },
    bricks: [],
    powerUps: []
};

let playerRole = "";
let myNickname = "";
let gameStarted = false;
let gamePaused = false;
let currentRoom = null;
let playerInfo = { player1: "", player2: "" };
let roomScoreboard = { player1Wins: 0, player2Wins: 0 };
let globalScoreboard = {};

function updateRoomScoreboard() {
    roomScoreboardDiv.innerText = `Room Scoreboard: ${roomScoreboard.player1Wins} - ${roomScoreboard.player2Wins}`;
}
function updateGlobalScoreboard(data) {
    let html = "";
    for (const [nickname, wins] of Object.entries(data)) {
        html += `<div>${nickname}: ${wins}</div>`;
    }
    globalScoreboardDiv.innerHTML = html;
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameState.bricks.forEach(brick => {
        if (brick.intact) {
            ctx.fillStyle = "#E74C3C";
            ctx.fillRect(brick.x, brick.y, 40, 20);
            ctx.strokeStyle = "#C0392B";
            ctx.strokeRect(brick.x, brick.y, 40, 20);
        }
    });
    gameState.powerUps.forEach(pu => {
        if (pu.active) {
            ctx.fillStyle = pu.type === "slowBall" ? "#3498DB" : "#9B59B6";
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, 10, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.fillStyle = "#fff";
    ctx.fillRect(LEFT_PADDLE_X, gameState.leftPaddle.y, PADDLE_WIDTH, parseInt(paddleHeightInput.value) || 100);
    ctx.fillRect(RIGHT_PADDLE_X, gameState.rightPaddle.y, PADDLE_WIDTH, parseInt(paddleHeightInput.value) || 100);
    ctx.fillStyle = "#F1C40F";
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    if (playerRole === "Player 1") {
        if (gameModeSelect.value === "cooperative") {
            scoreP.innerText = `${myNickname} (You) & Partner: ${gameState.score || 0}`;
        } else if (gameModeSelect.value === "team") {
            scoreP.innerText = `Team A: ${gameState.scores.left} | Team B: ${gameState.scores.right}`;
        } else {
            scoreP.innerText = `${myNickname} (You): ${gameState.scores.left} | ${playerInfo.player2 || "Waiting..."}: ${gameState.scores.right}`;
        }
    } else if (playerRole === "Player 2") {
        if (gameModeSelect.value === "cooperative") {
            scoreP.innerText = `Partner & ${myNickname} (You): ${gameState.score || 0}`;
        } else if (gameModeSelect.value === "team") {
            scoreP.innerText = `Team A: ${gameState.scores.left} | Team B: ${gameState.scores.right}`;
        } else {
            scoreP.innerText = `${playerInfo.player1 || "Waiting..."}: ${gameState.scores.left} | ${myNickname} (You): ${gameState.scores.right}`;
        }
    } else {
        if (gameModeSelect.value === "cooperative") {
            scoreP.innerText = `Score: ${gameState.score || 0}`;
        } else if (gameModeSelect.value === "team") {
            scoreP.innerText = `Team A: ${gameState.scores.left} | Team B: ${gameState.scores.right}`;
        } else {
            scoreP.innerText = `Score: ${gameState.scores.left} - ${gameState.scores.right}`;
        }
    }
}

function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

// Lobby functions
socket.on("availableRooms", rooms => {
    roomsList.innerHTML = "";
    if (rooms.length === 0) {
        roomsList.innerText = "No rooms available. Create a new one.";
        return;
    }
    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "room";
        card.innerText = `${room.roomId} (${room.count}/2)`;
        const joinBtn = document.createElement("button");
        joinBtn.innerText = "Join";
        joinBtn.disabled = room.count >= 2;
        joinBtn.onclick = () => joinRoom(room.roomId);
        card.appendChild(joinBtn);
        roomsList.appendChild(card);
    });
});
refreshRoomsBtn.onclick = () => socket.emit("getRooms");
createRoomBtn.onclick = () => {
    const roomId = "room_" + Math.random().toString(36).substring(2, 7);
    joinRoom(roomId);
};
function joinRoom(roomId) {
    myNickname = prompt("Enter your nickname:", "Player") || "Player";
    socket.emit("joinRoom", { roomId, nickname: myNickname });
    currentRoom = roomId;
    lobbyDiv.style.display = "none";
    gameContainer.style.display = "block";
    readyButton.style.display = "block";
}
readyButton.onclick = () => {
    socket.emit("playerReady", playerRole === "Player 1" ? "player1" : "player2");
    readyButton.style.display = "none";
};
pauseButton.onclick = () => {
    socket.emit("togglePause");
};
document.getElementById("leaveRoomButton").onclick = () => {
    socket.emit("leaveRoom");
};
socket.on("leftRoom", () => {
    currentRoom = null;
    lobbyDiv.style.display = "block";
    gameContainer.style.display = "none";
    const playAgainBtn = document.getElementById("playAgainBtn");
    if (playAgainBtn) playAgainBtn.remove();
});
sendChatBtn.onclick = () => {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit("chatMessage", msg);
        chatInput.value = "";
    }
};
socket.on("chatMessage", data => {
    const messageElem = document.createElement("div");
    messageElem.innerText = `[${data.timestamp}] ${data.nickname}: ${data.message}`;
    chatMessagesDiv.appendChild(messageElem);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    if (chatModal.style.display !== "block") {
        unreadMessages++;
        updateChatNotification();
        showToast(`New message from ${data.nickname}`);
    }
});
updateSettingsBtn.onclick = () => {
    const newSettings = {
        ballSpeed: parseInt(ballSpeedInput.value),
        paddleHeight: parseInt(paddleHeightInput.value),
        brickRows: parseInt(brickRowsInput.value),
        gameMode: gameModeSelect.value
    };
    socket.emit("updateSettings", newSettings);
};
socket.on("settingsUpdated", settings => {
    alert("Settings updated!");
});
socket.on("playSound", soundType => {
    if (soundType === "hit") playSoundEffect(hitSound);
    else if (soundType === "powerup") playSoundEffect(powerUpSound);
});
socket.on("playerRole", role => {
    playerRole = role;
    statusP.innerText = `${role} connected`;
});
socket.on("playerInfo", info => {
    playerInfo = info;
});
socket.on("gameState", state => {
    gameState = state;
});
socket.on("gameStart", start => {
    gameStarted = start;
    statusP.innerText = gameStarted ? "Game Started!" : "Waiting for players...";
});
socket.on("gamePaused", paused => {
    gamePaused = paused;
    pauseButton.innerText = gamePaused ? "Continue" : "Pause";
});
socket.on("gameOver", data => {
    gameStarted = false;
    let winMsg = data.winner === "Draw" ? "It's a draw! Play again?" : `${data.winner} wins! Play again?`;
    statusP.innerText = winMsg;
    if (data.roomScoreboard) {
        roomScoreboard = data.roomScoreboard;
        updateRoomScoreboard();
    }
    const playAgainBtn = document.createElement("button");
    playAgainBtn.id = "playAgainBtn";
    playAgainBtn.innerText = "Play Again";
    playAgainBtn.style.position = "absolute";
    playAgainBtn.style.top = "60%";
    playAgainBtn.style.left = "50%";
    playAgainBtn.style.transform = "translate(-50%, -50%)";
    playAgainBtn.style.padding = "15px 30px";
    playAgainBtn.style.fontSize = "20px";
    playAgainBtn.style.background = "#27AE60";
    playAgainBtn.style.color = "#fff";
    playAgainBtn.style.border = "none";
    playAgainBtn.style.cursor = "pointer";
    document.body.appendChild(playAgainBtn);
    playAgainBtn.onclick = () => {
        socket.emit("playAgain");
        playAgainBtn.remove();
        readyButton.style.display = "block";
        statusP.innerText = "Waiting for players to be ready...";
    };
});
socket.on("globalScoreboardUpdate", scoreboard => {
    globalScoreboard = scoreboard;
    updateGlobalScoreboard(globalScoreboard);
});
upButton.onclick = () => {
    if (!gameStarted || gamePaused || playerRole === "Spectator") return;
    socket.emit("movePaddle", { player: playerRole === "Player 1" ? "left" : "right", direction: -1 });
};
downButton.onclick = () => {
    if (!gameStarted || gamePaused || playerRole === "Spectator") return;
    socket.emit("movePaddle", { player: playerRole === "Player 1" ? "left" : "right", direction: 1 });
};
document.addEventListener("keydown", e => {
    if (!gameStarted || gamePaused || playerRole === "Spectator") return;
    if ((e.key === "w" || e.key === "ArrowUp") && playerRole === "Player 1") {
        socket.emit("movePaddle", { player: "left", direction: -1 });
    }
    if ((e.key === "s" || e.key === "ArrowDown") && playerRole === "Player 1") {
        socket.emit("movePaddle", { player: "left", direction: 1 });
    }
    if ((e.key === "w" || e.key === "ArrowUp") && playerRole === "Player 2") {
        socket.emit("movePaddle", { player: "right", direction: -1 });
    }
    if ((e.key === "s" || e.key === "ArrowDown") && playerRole === "Player 2") {
        socket.emit("movePaddle", { player: "right", direction: 1 });
    }
});
socket.emit("getGlobalScoreboard");

gameLoop();