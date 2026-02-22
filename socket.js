const jwt = require("jsonwebtoken");

const canManageVip = (payload) => {
  if (!payload) return false;
  return String(payload.role || "").toLowerCase() === "admin";
};

const resolveToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, "");

  const headerToken = socket.handshake?.headers?.authorization;
  if (!headerToken) return "";
  return String(headerToken).replace(/^Bearer\s+/i, "");
};

class SocketService {
  async connect(io) {
    io.on("connection", async (socket) => {
      const token = resolveToken(socket);
      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
          socket.data.user = payload;
          socket.join(`user:${payload.id}`);

          if (canManageVip(payload)) {
            socket.join("vip-admins");
          }
        } catch (_) {
          // token noto'g'ri bo'lsa oddiy ulanish sifatida qoladi
        }
      }

      socket.on("register-user", (data = {}) => {
        const role = String(data.role || "").toLowerCase();
        if (role === "admin") {
          socket.join("vip-admins");
        }
      });

      socket.on("disconnect", async () => {});
    });
  }
}

module.exports = new SocketService();
