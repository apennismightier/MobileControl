const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const sessions = new Map();

function generateSessionId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on("connection", (ws) => {
  ws.sessionId = null;
  ws.role = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type } = msg;

    if (type === "create_session") {
      let sessionId = generateSessionId();
      while (sessions.has(sessionId)) sessionId = generateSessionId();
      sessions.set(sessionId, { host: ws, controller: null });
      ws.sessionId = sessionId;
      ws.role = "host";
      send(ws, { type: "session_created", sessionId });
    }

    else if (type === "join_session") {
      const { sessionId } = msg;
      const session = sessions.get(sessionId);
      if (!session) { send(ws, { type: "error", message: "Session not found" }); return; }
      if (session.controller) { send(ws, { type: "error", message: "Session full" }); return; }
      session.controller = ws;
      ws.sessionId = sessionId;
      ws.role = "controller";
      send(session.host, { type: "controller_joined" });
      send(ws, { type: "joined_session", sessionId });
    }

    else if (["offer", "answer", "ice_candidate"].includes(type)) {
      const session = sessions.get(ws.sessionId);
      if (!session) return;
      const target = ws.role === "host" ? session.controller : session.host;
      send(target, msg);
    }
  });

  ws.on("close", () => {
    if (!ws.sessionId) return;
    const session = sessions.get(ws.sessionId);
    if (!session) return;
    if (ws.role === "host") {
      send(session.controller, { type: "host_disconnected" });
      sessions.delete(ws.sessionId);
    } else if (ws.role === "controller") {
      send(session.host, { type: "controller_disconnected" });
      session.controller = null;
    }
  });
});

console.log(`Signaling server running on port ${PORT}`);
