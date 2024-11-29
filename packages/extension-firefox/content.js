// content.js
let videoElement = null;

function initializeVideo() {
  videoElement = document.querySelector('video');
  if (!videoElement) {
    console.warn('No video element found on page');
    return false;
  }
  return true;
}

// background script로부터의 메시지 수신
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'prepareVideo':
      const success = initializeVideo();
      if (success && videoElement) {
        videoElement.currentTime = message.currentTime;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'playVideo':
      if (videoElement) {
        videoElement.play();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'getVideoTime':
      if (videoElement) {
        sendResponse({ 
          success: true, 
          currentTime: videoElement.currentTime 
        });
      } else {
        sendResponse({ success: false });
      }
      break;
  }
  return true; // 비동기 응답을 위해 필요
});
