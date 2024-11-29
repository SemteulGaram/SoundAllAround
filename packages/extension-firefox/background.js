// background.js
class WebRTCConnection {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.ws = null;
    this.clientId = null;
    this.timeDiff = 0; // slave일 경우 master와의 시간차
    this.isMaster = false;
    this.lastPingTime = 0;
    this.pingInterval = null;
    
    this.configuration = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    this.ports = new Set(); // 연결된 모든 팝업 포트
    this.initWebSocket();
  }

  initWebSocket() {
    this.ws = new WebSocket('ws://192.168.5.16:3000');

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        case 'clientId':
          this.clientId = message.id;
          this.broadcastToPopups({ type: 'clientId', id: this.clientId });
          break;
        case 'offer':
          await this.handleOffer(message.data, message.sender);
          break;
        case 'answer':
          await this.handleAnswer(message.data);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(message.data);
          break;
      }
    };

    this.ws.onclose = () => {
      // 연결이 끊어지면 재연결 시도
      setTimeout(() => this.initWebSocket(), 5000);
    };
  }

  async initPeerConnection(peerId, isMaster = false) {
    this.isMaster = isMaster;
    
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection(this.configuration);
    
    if (isMaster) {
      this.dataChannel = this.peerConnection.createDataChannel('messageChannel');
      this.setupDataChannel(this.dataChannel);
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          target: peerId,
          data: event.candidate
        }));
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(event.channel);
    };
  }

  setupDataChannel(channel) {
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        case 'ping':
          console.log('Received ping');
          if (!this.isMaster) {
            channel.send(JSON.stringify({
              type: 'pong',
              timestamp: message.timestamp
            }));
          }
          break;
        case 'pong':
          console.log('Received pong');
          if (this.isMaster) {
            const roundTripTime = Date.now() - message.timestamp;
            const oneWayLatency = roundTripTime / 2;
            this.broadcastToPopups({
              type: 'latencyUpdate',
              latency: oneWayLatency
            });
          }
          break;
        case 'chat':
          this.broadcastToPopups({
            type: 'message',
            data: message.data
          });
          break;
      }
    };

    channel.onopen = () => {
      console.log(`Data channel ${this.isMaster ? 'master' : 'slave'} connection opened`);
      this.broadcastToPopups({ type: 'connectionStatus', status: 'connected', isMaster: this.isMaster });
      
      if (this.isMaster) {
        // Master는 주기적으로 ping을 보냄
        this.pingInterval = setInterval(() => {
          if (channel.readyState === 'open') {
            channel.send(JSON.stringify({
              type: 'ping',
              timestamp: Date.now()
            }));
          }
        }, 5000); // 5초마다 ping
      }
    };

    channel.onclose = () => {
      console.log(`Data channel ${this.isMaster ? 'master' : 'slave'} connection closed`);
      this.broadcastToPopups({ type: 'connectionStatus', status: 'disconnected', isMaster: this.isMaster });
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
    };
  }

  async handleOffer(offer, senderId) {
    await this.initPeerConnection(senderId, false);
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    this.ws.send(JSON.stringify({
      type: 'answer',
      target: senderId,
      data: answer
    }));
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate) {
    if (candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async initiateConnection(peerId) {
    await this.initPeerConnection(peerId, true);
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    this.ws.send(JSON.stringify({
      type: 'offer',
      target: peerId,
      data: offer
    }));
  }

  sendMessage(message) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'chat',
        data: message
      }));
    }
  }

  broadcastToPopups(message) {
    console.log('Broadcasting message to popups:', message);
    this.ports.forEach(port => {
      try {
        port.postMessage(message);
      } catch (e) {
        this.ports.delete(port);
      }
    });
  }

  addPort(port) {
    this.ports.add(port);
    // 현재 상태 전송
    if (this.clientId) {
      port.postMessage({ type: 'clientId', id: this.clientId });
    }
    if (this.dataChannel) {
      port.postMessage({
        type: 'connectionStatus',
        status: this.dataChannel.readyState,
        isMaster: this.isMaster
      });
    }
  }

  removePort(port) {
    this.ports.delete(port);
  }

  async sendVideoSyncCommand(currentTime) {
    const startDelay = 3000; // 3초 후 시작
    const startTime = Date.now() + startDelay;
    
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'videoSync',
        currentTime: currentTime,
        startTime: startTime
      }));
    }

    // Master의 비디오 준비
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: 'prepareVideo',
        currentTime: currentTime
      });

      // 정확한 타이밍을 위해 setTimeout 사용
      setTimeout(async () => {
        await browser.tabs.sendMessage(tabs[0].id, {
          type: 'playVideo'
        });
      }, startDelay);
    }
  }

  setupDataChannel(channel) {
    // ... 기존 코드 ...

    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        // ... 기존 case문들 ...
        
        case 'videoSync':
          if (!this.isMaster) {
            this.handleVideoSync(message);
          }
          break;
      }
    };
  }

  async handleVideoSync(message) {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs[0]) return;

    // 비디오 준비
    await browser.tabs.sendMessage(tabs[0].id, {
      type: 'prepareVideo',
      currentTime: message.currentTime
    });

    // 지연시간을 고려한 시작 시간 계산
    const adjustedDelay = message.startTime - Date.now() - this.timeDiff;
    
    setTimeout(async () => {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: 'playVideo'
      });
    }, adjustedDelay);
  }

  // Master의 현재 비디오 시간 가져오기
  async getCurrentVideoTime() {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs[0]) return null;

    const response = await browser.tabs.sendMessage(tabs[0].id, {
      type: 'getVideoTime'
    });

    return response.success ? response.currentTime : null;
  }
}

const webRTCManager = new WebRTCConnection();

// 팝업과의 통신 처리
browser.runtime.onConnect.addListener(port => {
  if (port.name === 'popup') {
    webRTCManager.addPort(port);

    port.onMessage.addListener(msg => {
      switch (msg.type) {
        case 'connect':
          webRTCManager.initiateConnection(msg.peerId);
          break;
        case 'send':
          webRTCManager.sendMessage(msg.message);
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      webRTCManager.removePort(port);
    });
  }
});
