const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

const scoreboardFile = path.join(__dirname, "globalScoreboard.json");
let globalScoreboard = {};
if (fs.existsSync(scoreboardFile)) {
    try {
        const data = fs.readFileSync(scoreboardFile, "utf8");
        globalScoreboard = JSON.parse(data);
    } catch (err) {
        console.error("Error reading scoreboard file:", err);
    }
}
function saveGlobalScoreboard() {
    fs.writeFile(scoreboardFile, JSON.stringify(globalScoreboard, null, 2), err => {
        if (err) console.error("Error writing scoreboard file:", err);
    });
}

// Game Constants
const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const DEFAULT_PADDLE_WIDTH = 20;
const DEFAULT_PADDLE_HEIGHT = 100;
const DEFAULT_LEFT_PADDLE_X = 50;
const DEFAULT_RIGHT_PADDLE_X = 730;
const DEFAULT_BALL_SIZE = 20;
const DEFAULT_BRICK_WIDTH = 40;
const DEFAULT_BRICK_HEIGHT = 20;
const DEFAULT_BRICK_COLUMNS = 5;
const DEFAULT_BRICK_ROWS = 20;
const DEFAULT_BRICK_GAP = 5;
const DEFAULT_PADDLE_SPEED = 15;
const DEFAULT_BALL_SPEED = 5;
const MAX_BOUNCE_ANGLE = 75 * Math.PI / 180;

const rooms = {};

function createRoom() {
    return {
        players: {},
        spectators: [],
        playersReady: { player1: false, player2: false },
        gameStarted: false,
        paused: false,
        settings: {
            ballSpeed: DEFAULT_BALL_SPEED,
            paddleHeight: DEFAULT_PADDLE_HEIGHT,
            brickRows: DEFAULT_BRICK_ROWS,
            gameMode: "classic"
        },
        gameState: {
            leftPaddle: { y: 250, height: DEFAULT_PADDLE_HEIGHT },
            rightPaddle: { y: 250, height: DEFAULT_PADDLE_HEIGHT },
            ball: { x: DEFAULT_CANVAS_WIDTH / 2, y: DEFAULT_CANVAS_HEIGHT / 2, vx: DEFAULT_BALL_SPEED, vy: DEFAULT_BALL_SPEED },
            scores: { left: 0, right: 0 },
            bricks: [],
            powerUps: []
        },
        scoreboard: { player1Wins: 0, player2Wins: 0 },
        chatHistory: []
    };
}

function initBricks(settings) {
    let bricks = [];
    const brickRows = settings.brickRows || DEFAULT_BRICK_ROWS;
    let startX = (DEFAULT_CANVAS_WIDTH / 2) - (DEFAULT_BRICK_COLUMNS * (DEFAULT_BRICK_WIDTH + DEFAULT_BRICK_GAP)) / 2;
    let startY = 50;
    for (let row = 0; row < brickRows; row++) {
        for (let col = 0; col < DEFAULT_BRICK_COLUMNS; col++) {
            bricks.push({
                x: startX + col * (DEFAULT_BRICK_WIDTH + DEFAULT_BRICK_GAP),
                y: startY + row * (DEFAULT_BRICK_HEIGHT + DEFAULT_BRICK_GAP),
                intact: true
            });
        }
    }
    return bricks;
}

function resetBall(gameState, ballSpeed) {
    gameState.ball.x = DEFAULT_CANVAS_WIDTH / 2;
    gameState.ball.y = DEFAULT_CANVAS_HEIGHT / 2;
    gameState.ball.vx = -gameState.ball.vx || ballSpeed;
}

function updateAvailableRooms() {
    const availableRooms = [];
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const count = (room.players.player1 ? 1 : 0) + (room.players.player2 ? 1 : 0);
        availableRooms.push({ roomId, count });
    }
    io.emit("availableRooms", availableRooms);
}

function sendNotification(roomId, message, type = "info") {
    io.to(roomId).emit("notification", { message, type });
}

setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (!room.gameStarted) continue;
        if (room.paused) {
            io.to(roomId).emit("gamePaused", true);
            continue;
        } else {
            io.to(roomId).emit("gamePaused", false);
        }
        let gameState = room.gameState;
        gameState.ball.x += gameState.ball.vx;
        gameState.ball.y += gameState.ball.vy;
        if (gameState.ball.y - DEFAULT_BALL_SIZE / 2 < 0 || gameState.ball.y + DEFAULT_BALL_SIZE / 2 > DEFAULT_CANVAS_HEIGHT) {
            gameState.ball.vy *= -1;
        }
        if (
            gameState.ball.x - DEFAULT_BALL_SIZE / 2 < DEFAULT_LEFT_PADDLE_X + DEFAULT_PADDLE_WIDTH &&
            gameState.ball.y > gameState.leftPaddle.y &&
            gameState.ball.y < gameState.leftPaddle.y + gameState.leftPaddle.height
        ) {
            let relativeIntersectY = (gameState.leftPaddle.y + gameState.leftPaddle.height / 2) - gameState.ball.y;
            let normalizedRelativeIntersectionY = relativeIntersectY / (gameState.leftPaddle.height / 2);
            let bounceAngle = normalizedRelativeIntersectionY * MAX_BOUNCE_ANGLE;
            let currentSpeed = Math.sqrt(gameState.ball.vx ** 2 + gameState.ball.vy ** 2);
            let newSpeed = Math.min(currentSpeed * 1.1, room.settings.ballSpeed * 2);
            gameState.ball.vx = newSpeed * Math.cos(bounceAngle);
            gameState.ball.vy = -newSpeed * Math.sin(bounceAngle);
            io.to(roomId).emit("playSound", "hit");
        }
        if (
            gameState.ball.x + DEFAULT_BALL_SIZE / 2 > DEFAULT_RIGHT_PADDLE_X &&
            gameState.ball.y > gameState.rightPaddle.y &&
            gameState.ball.y < gameState.rightPaddle.y + gameState.rightPaddle.height
        ) {
            let relativeIntersectY = (gameState.rightPaddle.y + gameState.rightPaddle.height / 2) - gameState.ball.y;
            let normalizedRelativeIntersectionY = relativeIntersectY / (gameState.rightPaddle.height / 2);
            let bounceAngle = normalizedRelativeIntersectionY * MAX_BOUNCE_ANGLE;
            let currentSpeed = Math.sqrt(gameState.ball.vx ** 2 + gameState.ball.vy ** 2);
            let newSpeed = Math.min(currentSpeed * 1.1, room.settings.ballSpeed * 2);
            gameState.ball.vx = -newSpeed * Math.cos(bounceAngle);
            gameState.ball.vy = -newSpeed * Math.sin(bounceAngle);
            io.to(roomId).emit("playSound", "hit");
        }
        gameState.bricks.forEach(brick => {
            if (
                brick.intact &&
                gameState.ball.x + DEFAULT_BALL_SIZE / 2 > brick.x &&
                gameState.ball.x - DEFAULT_BALL_SIZE / 2 < brick.x + DEFAULT_BRICK_WIDTH &&
                gameState.ball.y + DEFAULT_BALL_SIZE / 2 > brick.y &&
                gameState.ball.y - DEFAULT_BALL_SIZE / 2 < brick.y + DEFAULT_BRICK_HEIGHT
            ) {
                brick.intact = false;
                gameState.ball.vy = -gameState.ball.vy;
                let currentSpeed = Math.sqrt(gameState.ball.vx ** 2 + gameState.ball.vy ** 2);
                let newSpeed = Math.max(currentSpeed * 0.9, room.settings.ballSpeed);
                let angle = Math.atan2(gameState.ball.vy, gameState.ball.vx);
                gameState.ball.vx = newSpeed * Math.cos(angle);
                gameState.ball.vy = newSpeed * Math.sin(angle);
                if (Math.random() < 0.2) {
                    const powerType = Math.random() < 0.5 ? "slowBall" : "paddleShrink";
                    const powerUp = {
                        type: powerType,
                        x: brick.x,
                        y: brick.y,
                        duration: 5000,
                        active: true
                    };
                    gameState.powerUps.push(powerUp);
                    io.to(roomId).emit("powerUpSpawned", powerUp);
                }
                if (room.settings.gameMode === "cooperative") {
                    if (gameState.score === undefined) gameState.score = 0;
                    gameState.score++;
                } else {
                    if (gameState.ball.vx > 0) {
                        gameState.scores.left++;
                    } else {
                        gameState.scores.right++;
                    }
                }
            }
        });
        if (gameState.ball.x - DEFAULT_BALL_SIZE / 2 < 0 || gameState.ball.x + DEFAULT_BALL_SIZE / 2 > DEFAULT_CANVAS_WIDTH) {
            resetBall(gameState, room.settings.ballSpeed);
        }
        for (const powerUp of gameState.powerUps) {
            if (powerUp.active) {
                const dx = gameState.ball.x - powerUp.x;
                const dy = gameState.ball.y - powerUp.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < (DEFAULT_BALL_SIZE / 2 + 10)) {
                    powerUp.active = false;
                    if (powerUp.type === "slowBall") {
                        if (!gameState.ball.slowed) {
                            gameState.ball.vx = (gameState.ball.vx > 0 ? 1 : -1) * (Math.abs(gameState.ball.vx) / 2);
                            gameState.ball.vy = (gameState.ball.vy > 0 ? 1 : -1) * (Math.abs(gameState.ball.vy) / 2);
                            gameState.ball.slowed = true;
                            io.to(roomId).emit("playSound", "powerup");
                            setTimeout(() => {
                                gameState.ball.vx = (gameState.ball.vx > 0 ? 1 : -1) * room.settings.ballSpeed;
                                gameState.ball.vy = (gameState.ball.vy > 0 ? 1 : -1) * room.settings.ballSpeed;
                                gameState.ball.slowed = false;
                                io.to(roomId).emit("powerUpReverted", { type: "slowBall" });
                            }, powerUp.duration);
                        }
                    }
                    if (powerUp.type === "paddleShrink") {
                        if (gameState.ball.x < DEFAULT_CANVAS_WIDTH / 2) {
                            let newHeight = Math.max(gameState.rightPaddle.height - 30, 50);
                            gameState.rightPaddle.height = newHeight;
                            io.to(roomId).emit("powerUpReverted", { type: "paddleShrink", player: "Team B", newHeight });
                            setTimeout(() => {
                                gameState.rightPaddle.height = room.settings.paddleHeight;
                                io.to(roomId).emit("powerUpReverted", { type: "paddleShrink", player: "Team B", newHeight: room.settings.paddleHeight });
                            }, powerUp.duration);
                        } else {
                            let newHeight = Math.max(gameState.leftPaddle.height - 30, 50);
                            gameState.leftPaddle.height = newHeight;
                            io.to(roomId).emit("powerUpReverted", { type: "paddleShrink", player: "Team A", newHeight });
                            setTimeout(() => {
                                gameState.leftPaddle.height = room.settings.paddleHeight;
                                io.to(roomId).emit("powerUpReverted", { type: "paddleShrink", player: "Team A", newHeight: room.settings.paddleHeight });
                            }, powerUp.duration);
                        }
                    }
                }
            }
        }
        io.to(roomId).emit("gameState", gameState);

        let bricksLeft = gameState.bricks.filter(brick => brick.intact).length;
        if (bricksLeft === 0) {
            room.gameStarted = false;
            let winnerNickname;
            if (room.settings.gameMode === "cooperative") {
                winnerNickname = "Cooperative Win!";
            } else {
                if (gameState.scores.left > gameState.scores.right) {
                    winnerNickname = room.players.player1.nickname;
                    room.scoreboard.player1Wins++;
                    globalScoreboard[winnerNickname] = (globalScoreboard[winnerNickname] || 0) + 1;
                } else if (gameState.scores.right > gameState.scores.left) {
                    winnerNickname = room.players.player2.nickname;
                    room.scoreboard.player2Wins++;
                    globalScoreboard[winnerNickname] = (globalScoreboard[winnerNickname] || 0) + 1;
                } else {
                    winnerNickname = "Draw";
                }
            }
            io.to(roomId).emit("gameOver", { winner: winnerNickname, roomScoreboard: room.scoreboard });
            io.emit("globalScoreboardUpdate", globalScoreboard);
            saveGlobalScoreboard();
        }
    }
}, 30);

io.on("connection", socket => {
    console.log("A player connected:", socket.id);

    socket.on("chatMessage", message => {
        const nickname = socket.data.nickname || "Anonymous";
        const timestamp = new Date().toLocaleTimeString();
        const msgObj = { nickname, message, timestamp };
        if (socket.data.roomId && rooms[socket.data.roomId]) {
            rooms[socket.data.roomId].chatHistory.push(msgObj);
            if (rooms[socket.data.roomId].chatHistory.length > 50) {
                rooms[socket.data.roomId].chatHistory.shift();
            }
        }
        io.to(socket.data.roomId).emit("chatMessage", msgObj);
    });

    socket.on("typing", () => {
        const nickname = socket.data.nickname || "Anonymous";
        socket.to(socket.data.roomId).emit("typing", { nickname });
    });

    socket.on("getRooms", () => {
        const availableRooms = [];
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const count = (room.players.player1 ? 1 : 0) + (room.players.player2 ? 1 : 0);
            availableRooms.push({ roomId, count });
        }
        socket.emit("availableRooms", availableRooms);
    });

    socket.on("getGlobalScoreboard", () => {
        socket.emit("globalScoreboardUpdate", globalScoreboard);
    });

    socket.on("updateSettings", settings => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];
        room.settings = { ...room.settings, ...settings };
        io.to(roomId).emit("settingsUpdated", room.settings);
    });

    socket.on("joinRoom", ({ roomId, nickname, settings }) => {
        socket.data.roomId = roomId;
        socket.data.nickname = nickname;
        if (!rooms[roomId]) {
            rooms[roomId] = createRoom();
            if (settings) {
                rooms[roomId].settings = { ...rooms[roomId].settings, ...settings };
            }
            rooms[roomId].gameState.bricks = initBricks(rooms[roomId].settings);
            if (rooms[roomId].settings.gameMode === "cooperative") {
                rooms[roomId].gameState.score = 0;
            }
        }
        let room = rooms[roomId];
        socket.emit("chatHistory", room.chatHistory);
        const count = (room.players.player1 ? 1 : 0) + (room.players.player2 ? 1 : 0);
        if (room.settings.gameMode === "cooperative") {
            if (!room.players.player1) {
                room.players.player1 = { id: socket.id, nickname };
                socket.emit("playerRole", "Player 1");
            } else if (!room.players.player2) {
                room.players.player2 = { id: socket.id, nickname };
                socket.emit("playerRole", "Player 2");
            } else {
                room.spectators.push({ id: socket.id, nickname });
                socket.emit("playerRole", "Spectator");
            }
        } else if (room.settings.gameMode === "team") {
            if (count < 2) {
                if (!room.players.player1) {
                    room.players.player1 = { id: socket.id, nickname };
                    socket.emit("playerRole", "Player 1");
                } else {
                    room.players.player2 = { id: socket.id, nickname };
                    socket.emit("playerRole", "Player 2");
                }
            } else {
                room.spectators.push({ id: socket.id, nickname });
                socket.emit("playerRole", "Spectator");
            }
        } else {
            if (count < 2) {
                if (!room.players.player1) {
                    room.players.player1 = { id: socket.id, nickname };
                    socket.emit("playerRole", "Player 1");
                } else {
                    room.players.player2 = { id: socket.id, nickname };
                    socket.emit("playerRole", "Player 2");
                }
            } else {
                room.spectators.push({ id: socket.id, nickname });
                socket.emit("playerRole", "Spectator");
            }
        }
        socket.join(roomId);
        io.to(roomId).emit("playerInfo", {
            player1: room.players.player1 ? room.players.player1.nickname : null,
            player2: room.players.player2 ? room.players.player2.nickname : null,
            spectators: room.spectators.map(s => s.nickname)
        });
        socket.emit("gameState", room.gameState);
        updateAvailableRooms();
        io.to(roomId).emit("notification", { message: `${nickname} joined the room.`, type: "info" });
    });

    socket.on("playerReady", player => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];
        if (player === "player1" && room.players.player1 && socket.id === room.players.player1.id) {
            room.playersReady.player1 = true;
        } else if (player === "player2" && room.players.player2 && socket.id === room.players.player2.id) {
            room.playersReady.player2 = true;
        }
        if (room.playersReady.player1 && room.playersReady.player2 && !room.gameStarted) {
            room.gameStarted = true;
            room.paused = false;
            room.gameState.bricks = initBricks(room.settings);
            if (room.settings.gameMode === "cooperative") {
                room.gameState.score = 0;
            } else {
                room.gameState.scores = { left: 0, right: 0 };
            }
            room.gameState.ball = { x: DEFAULT_CANVAS_WIDTH / 2, y: DEFAULT_CANVAS_HEIGHT / 2, vx: room.settings.ballSpeed, vy: room.settings.ballSpeed };
            io.to(socket.data.roomId).emit("gameStart", true);
            io.to(socket.data.roomId).emit("notification", { message: "Game Started!", type: "success" });
        }
    });

    socket.on("movePaddle", ({ player, direction }) => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];
        let gameState = room.gameState;
        if (player === "left" && room.players.player1 && socket.id === room.players.player1.id) {
            gameState.leftPaddle.y += direction * DEFAULT_PADDLE_SPEED;
            gameState.leftPaddle.y = Math.max(0, Math.min(DEFAULT_CANVAS_HEIGHT - gameState.leftPaddle.height, gameState.leftPaddle.y));
        } else if (player === "right" && room.players.player2 && socket.id === room.players.player2.id) {
            gameState.rightPaddle.y += direction * DEFAULT_PADDLE_SPEED;
            gameState.rightPaddle.y = Math.max(0, Math.min(DEFAULT_CANVAS_HEIGHT - gameState.rightPaddle.height, gameState.rightPaddle.y));
        }
        io.to(roomId).emit("gameState", gameState);
    });

    socket.on("togglePause", () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];
        room.paused = !room.paused;
        io.to(roomId).emit("gamePaused", room.paused);
    });

    socket.on("playAgain", () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];
        room.playersReady = { player1: false, player2: false };
        room.gameState.leftPaddle.y = 250;
        room.gameState.rightPaddle.y = 250;
        room.gameState.leftPaddle.height = room.settings.paddleHeight;
        room.gameState.rightPaddle.height = room.settings.paddleHeight;
        if (room.settings.gameMode === "cooperative") {
            room.gameState.score = 0;
        } else {
            room.gameState.scores = { left: 0, right: 0 };
        }
        room.gameState.ball = { x: DEFAULT_CANVAS_WIDTH / 2, y: DEFAULT_CANVAS_HEIGHT / 2, vx: room.settings.ballSpeed, vy: room.settings.ballSpeed };
        room.gameState.bricks = initBricks(room.settings);
        room.paused = false;
        io.to(roomId).emit("gameReset", room.gameState);
        io.to(roomId).emit("gameStart", false);
    });

    socket.on("leaveRoom", () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            let room = rooms[roomId];
            let nickname = socket.data.nickname;
            if (room.players.player1 && socket.id === room.players.player1.id) {
                delete room.players.player1;
                room.playersReady.player1 = false;
            } else if (room.players.player2 && socket.id === room.players.player2.id) {
                delete room.players.player2;
                room.playersReady.player2 = false;
            } else {
                room.spectators = room.spectators.filter(s => s.id !== socket.id);
            }
            if (!room.players.player1 && !room.players.player2 && room.spectators.length === 0) {
                delete rooms[roomId];
            } else {
                room.gameStarted = false;
                io.to(roomId).emit("gameStart", false);
                io.to(roomId).emit("playerInfo", {
                    player1: room.players.player1 ? room.players.player1.nickname : null,
                    player2: room.players.player2 ? room.players.player2.nickname : null,
                    spectators: room.spectators.map(s => s.nickname)
                });
            }
            socket.leave(roomId);
            socket.data.roomId = null;
            socket.emit("leftRoom");
            updateAvailableRooms();
            sendNotification(roomId, `${nickname} left the room.`, "info");
        }
    });

    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms[roomId]) {
            let room = rooms[roomId];
            if (room.players.player1 && socket.id === room.players.player1.id) {
                delete room.players.player1;
                room.playersReady.player1 = false;
            } else if (room.players.player2 && socket.id === room.players.player2.id) {
                delete room.players.player2;
                room.playersReady.player2 = false;
            } else {
                room.spectators = room.spectators.filter(s => s.id !== socket.id);
            }
            room.gameStarted = false;
            io.to(roomId).emit("gameStart", false);
            io.to(roomId).emit("playerInfo", {
                player1: room.players.player1 ? room.players.player1.nickname : null,
                player2: room.players.player2 ? room.players.player2.nickname : null,
                spectators: room.spectators.map(s => s.nickname)
            });
            updateAvailableRooms();
            sendNotification(roomId, `${socket.data.nickname} disconnected.`, "warning");
        }
        console.log("A player disconnected:", socket.id);
    });
});

server.listen(3000, "127.0.0.1", () => {
    console.log("Server running on http://127.0.0.1:3000");
});