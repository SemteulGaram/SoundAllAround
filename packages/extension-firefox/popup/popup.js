// popup/popup.js
let port = browser.runtime.connect({ name: 'popup' });
let latency = 0;
let isMaster = false;

port.onMessage.addListener(msg => {
  switch (msg.type) {
    case 'clientId':
      document.getElementById('clientId').textContent = `내 ID: ${msg.id}`;
      break;
    case 'connectionStatus':
      isMaster = msg.isMaster;
      document.getElementById('status').textContent = `연결 상태: ${msg.status}`;
      document.getElementById('messageInput').disabled = msg.status !== 'connected';
      document.getElementById('send').disabled = msg.status !== 'connected';
      // 마스터일 경우에만 비디오 컨트롤 표시
      document.getElementById('videoControls').style.display = 
        (msg.status === 'connected' && isMaster) ? 'block' : 'none';
      break;
    case 'message':
      const messagesDiv = document.getElementById('messages');
      messagesDiv.innerHTML += `<div>받은 메시지: ${msg.data}</div>`;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      break;
    case 'latencyUpdate':
      latency = msg.latency;
      document.getElementById('latency').textContent = `지연시간: ${latency.toFixed(1)}ms`;
      break;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('connect').addEventListener('click', () => {
    const peerId = document.getElementById('peerId').value;
    if (!peerId) return;
    
    isMaster = true; // 연결을 시작하는 쪽이 마스터
    port.postMessage({
      type: 'connect',
      peerId: peerId
    });
  });

  document.getElementById('send').addEventListener('click', () => {
    const message = document.getElementById('messageInput').value;
    if (!message) return;

    port.postMessage({
      type: 'send',
      message: message
    });

    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML += `<div>보낸 메시지: ${message}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    document.getElementById('messageInput').value = '';
  });

  document.getElementById('syncVideo').addEventListener('click', () => {
    port.postMessage({
      type: 'startVideoSync'
    });
  });
});
