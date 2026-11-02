

const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Fighting Game Server is running!");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

function send(socket, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;

    do {
        code = "";
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function removePlayer(socket) {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    socket.roomCode = null;

    if (!room) return;

    room.players = room.players.filter(p => p !== socket);

    for (const player of room.players) {
        send(player, { type: "player_left" });
    }

    if (room.players.length === 0) {
        rooms.delete(code);
    }
}

wss.on("connection", socket => {
    socket.roomCode = null;

    socket.on("message", raw => {
        let msg;

        try {
            msg = JSON.parse(raw.toString());
        } catch {
            send(socket, {
                type: "error",
                message: "Invalid message"
            });
            return;
        }

        if (msg.type === "create_room") {
            if (socket.roomCode) removePlayer(socket);

            const code = makeCode();

            rooms.set(code, {
                players: [socket]
            });

            socket.roomCode = code;

            send(socket, {
                type: "room_created",
                room_code: code
            });
        }

        else if (msg.type === "join_room") {
            if (socket.roomCode) removePlayer(socket);

            const code = String(msg.room_code || "")
                .trim()
                .toUpperCase();

            const room = rooms.get(code);

            if (!room) {
                send(socket, {
                    type: "error",
                    message: "Room not found"
                });
                return;
            }

            if (room.players.length >= 2) {
                send(socket, {
                    type: "error",
                    message: "Room is full"
                });
                return;
            }

            room.players.push(socket);
            socket.roomCode = code;

            send(socket, {
                type: "room_joined",
                room_code: code
            });

            for (const player of room.players) {
                send(player, { type: "player_joined" });
            }
        }

        else if (msg.type === "game_data") {
            const code = socket.roomCode;
            const room = rooms.get(code);

            if (!room || !room.players.includes(socket)) return;

            for (const player of room.players) {
                if (player !== socket) {
                    send(player, {
                        type: "game_data",
                        data: msg.data || {}
                    });
                }
            }
        }

        else if (msg.type === "leave_room") {
            removePlayer(socket);
        }
    });

    socket.on("close", () => {
        removePlayer(socket);
    });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Fighting Game Server running on port " + PORT);
});
