// Store current page data
let currentPageData = null;

// Function to fetch page content from sydneyzeroturn API
async function fetchPageContent(url) {
  try {
    const response = await fetch(`https://www.bing.com/sydneyzeroturn?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.text();
    return data;
  } catch (error) {
    console.error('Error fetching page content:', error);
    return null;
  }
}

// Log when the background script loads
console.log('Background script loaded');

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked, tab:', tab.url);
  
  if (tab.url.includes("app.team-gpt.com") || tab.url.includes("platform.openai.com/playground")) {
    try {
      console.log('Sending message to content script');
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: "downloadChat",
        timestamp: new Date().toISOString()
      });
      console.log('Response from content script:', response);
    } catch (error) {
      console.error('Error sending message to content script:', error);
      // Try injecting the content script manually if it failed
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Content script injected, retrying message');
        await chrome.tabs.sendMessage(tab.id, { 
          action: "downloadChat",
          timestamp: new Date().toISOString()
        });
      } catch (retryError) {
        console.error('Error injecting content script:', retryError);
      }
    }
  } else {
    console.log('Not a Team-GPT URL, ignoring click');
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background script:', message);
  
  if (message.action === "getPageData") {
    // Try to get page content from sydneyzeroturn first
    fetchPageContent(message.url).then(content => {
      if (content) {
        currentPageData = { url: message.url, content };
        sendResponse({ success: true, data: currentPageData });
      } else {
        // If API fails, request content directly from the page
        chrome.tabs.sendMessage(sender.tab.id, { 
          action: "Page.GetData",
          url: message.url
        });
      }
    });
    return true; // Will respond asynchronously
  }
  
  console.log('Message received in background script:', message);
  console.log('From:', sender);
  
  if (message.error) {
    console.error('Error from content script:', message.error);
  }
  
  if (message.success) {
    console.log('Success message from content script:', message.success);
  }
});
