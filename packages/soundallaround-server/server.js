// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = generateClientId();
  clients.set(clientId, ws);

  // 새 클라이언트에게 ID 전송
  ws.send(JSON.stringify({
    type: 'clientId',
    id: clientId
  }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    switch(data.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // 특정 대상에게 메시지 전달
        const targetWs = clients.get(data.target);
        if (targetWs) {
          targetWs.send(JSON.stringify({
            type: data.type,
            sender: clientId,
            data: data.data
          }));
        }
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
  });
});

function generateClientId() {
  return Math.random().toString(36).substr(2, 9);
}

console.log('Signaling server running on ws://localhost:3000');
