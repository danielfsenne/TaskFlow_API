// Encaminha /api e o Socket.IO para o backend, evitando CORS no desenvolvimento.
// Use API_URL para apontar para outra porta: API_URL=http://localhost:3100 npm start
const target = process.env.API_URL || 'http://localhost:3000';

module.exports = {
  '/api': { target, secure: false, changeOrigin: true },
  '/socket.io': { target, secure: false, changeOrigin: true, ws: true },
};
