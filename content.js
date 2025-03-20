// Store current page data
let currentPageData = {
  url: window.location.href,
  content: ''
};

// Function to extract page content
function extractPageContent() {
  // Get all text content from the page
  const content = document.body.innerText;
  // Remove extra whitespace and normalize
  return content.replace(/\s+/g, ' ').trim();
}

// Listen for page change messages via postMessage
window.addEventListener('message', async (event) => {
  // Verify origin for security
  if (event.source !== window) return;

  const message = event.data;
  if (message.type === 'TabStripModelChange') {
    // Update current page data
    currentPageData = {
      url: window.location.href,
      content: extractPageContent()
    };
    
    // Request content from sydneyzeroturn API
    chrome.runtime.sendMessage({
      action: "getPageData",
      url: currentPageData.url
    }, response => {
      if (response && response.success) {
        currentPageData = response.data;
      }
    });
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle Page.GetData requests
  if (request.action === "Page.GetData") {
    const content = extractPageContent();
    sendResponse({ success: true, content });
    return true;
  }
  
  console.log('Message received in content script:', request);
  if (request.action === "downloadChat") {
    try {
      downloadChatAsMarkdown();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error in downloadChatAsMarkdown:', error);
      chrome.runtime.sendMessage({ error: error.message });
      sendResponse({ success: false, error: error.message });
    }
  }
  // Return true to indicate we'll send a response asynchronously
  return true;
});

function downloadChatAsMarkdown() {
  console.log('Starting downloadChatAsMarkdown');
  
  // Determine which platform we're on
  const isTeamGPT = window.location.href.includes('app.team-gpt.com');
  const isOpenAI = window.location.href.includes('platform.openai.com/playground');
  
  let title, modelName, messages = [];
  
  if (isTeamGPT) {
    // Team-GPT specific extraction
    const titleElement = document.querySelector('[data-test-id="thread-name"]') || document.querySelector('h1');
    title = titleElement ? titleElement.textContent.trim() : 'Team-GPT Chat Export';
    
    const modelElement = document.querySelector('[data-test-id="chat-settings-btn"]');
    modelName = modelElement ? modelElement.textContent.trim() : '';
    
    const messageElements = document.querySelectorAll('[data-test-id="chat-msg"]');
    console.log('Found message elements:', messageElements.length);
    
    // Process Team-GPT messages
    messageElements.forEach((element, index) => {
      console.log(`Processing message ${index + 1}`);
      // Get timestamp
      const timestampElement = element.querySelector('.text-xs.text-muted-foreground');
      const timestamp = timestampElement ? timestampElement.textContent.trim() : '';
      
      // Get user name
      const userElement = element.querySelector('.text-sm.font-semibold.leading-5');
      const user = userElement ? userElement.textContent.trim() : '';
      
      // Get message content from the prose div, preserving formatting
      const contentElement = element.querySelector('.prose.break-words');
      let content = '';
      
      if (contentElement) {
        content = elementToMarkdown(contentElement);
      }
      
      // Skip empty messages
      if (content) {
        // Format message with user and timestamp using Obsidian's span syntax
        const isAssistant = user.toLowerCase().includes('team-gpt');
        const coloredUser = isAssistant ? 
          `<span style="color:#00ff00;">${user}</span>` : // Green for Team-GPT
          user; // No color modification for user messages
        
        const header = `${coloredUser} - ${timestamp}`;
        
        // Add extra newlines around code blocks for better formatting
        const formattedContent = content.replace(/```/g, '\n```');
        messages.push(`## ${header}\n\n${formattedContent}`);
      }
    });
  } else if (isOpenAI) {
    // OpenAI Playground specific extraction
    title = 'OpenAI Playground Chat Export';
    
    // Get model from the model selector button
    const modelElement = document.querySelector('[data-color="secondary"][data-variant="bare"]');
    modelName = modelElement ? modelElement.textContent.trim() : '';
    
    // Get messages from the conversation container
    const conversationContainer = document.querySelector('._5taum[data-comparing="false"]');
    if (conversationContainer) {
      // Find all message blocks
      const messageBlocks = document.querySelectorAll('.OLOUn');
      console.log('Found OpenAI message blocks:', messageBlocks.length);
      
      messageBlocks.forEach((block, index) => {
        // Skip system message blocks
        if (block.querySelector('._5bfa-')) {
          return;
        }

        // Get role indicator
        const roleElement = block.querySelector('.v9phc');
        if (!roleElement) {
          return;
        }

        const role = roleElement.textContent.trim().toLowerCase();
        const timestamp = new Date().toLocaleTimeString();
        
        // Get message content from the ProseMirror editor
        const contentElement = block.querySelector('.tiptap.ProseMirror');
        if (contentElement) {
          let content = contentElement.textContent.trim();
          
          // Skip empty messages
          if (content) {
            const user = role === 'user' ? 'User' : 'Assistant';
            const header = `${user} - ${timestamp}`;
            
            // Format the content, handling any special characters or line breaks
            content = content
              .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
              .split('\n')
              .map(line => line.trim()) // Trim each line
              .join('\n');
            
            messages.push(`## ${header}\n\n${content}`);
          }
        }
      });
      
      console.log('Processed OpenAI messages:', messages.length);
    } else {
      console.error('Could not find OpenAI conversation container');
    }
    
  } else {
    console.error('Unsupported platform');
    return;
  }
  
  // Helper function to convert elements to markdown
  function elementToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    switch (node.nodeName) {
      case 'H1': return `\n# ${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      case 'H2': return `\n## ${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      case 'H3': return `\n### ${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      case 'H4': return `\n#### ${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      
      case 'PRE':
        // First check if this is a Team-GPT code block
        const codeblock = node.querySelector('.codeblock');
        let language = '';
        let code = '';
        
        if (codeblock) {
          // Get language from the header span or prism-code class
          const langSpan = codeblock.querySelector('.bg-zinc-800 span.text-xs');
          const prismPre = codeblock.querySelector('pre.prism-code');
          
          if (!prismPre) {
            return node.textContent.trim();
          }
          
          // Try to get language from header first, then fallback to prism class
          language = langSpan ? 
            langSpan.textContent.trim().toLowerCase() : 
            (prismPre.className.match(/language-(\w+)/)?.[1] || '');
          
          // Process each line of code
          const codeLines = [];
          const tokenLines = prismPre.querySelectorAll('.token-line');
          
          if (tokenLines.length > 0) {
            // Handle token-line based code blocks (Team-GPT style)
            tokenLines.forEach(line => {
              // Get all text content except line numbers
              const lineContent = Array.from(line.childNodes)
                .filter(node => {
                  // Filter out line numbers and their containers
                  return !(
                    node.classList?.contains('select-none') ||
                    node.classList?.contains('mx-4') ||
                    (node.textContent.trim().match(/^\d+$/) && node.classList?.contains('bg-black'))
                  );
                })
                .map(node => {
                  // For text nodes, preserve exact content
                  if (node.nodeType === Node.TEXT_NODE) {
                    return node.textContent;
                  }
                  
                  // For element nodes, check style and class
                  const style = node.getAttribute('style');
                  const isNewline = style?.includes('display: inline-block');
                  
                  // Handle token spans
                  if (node.classList?.contains('token')) {
                    // For newline tokens, return actual newline
                    if (isNewline) {
                      return '\n';
                    }
                    // For other tokens (comments, keywords, etc), preserve content
                    return node.textContent;
                  }
                  
                  // For non-token spans with newline style
                  if (isNewline) {
                    return '\n';
                  }
                  
                  // For all other elements, preserve exact content
                  return node.textContent;
                })
                .join('') // Join all parts
                .replace(/^\s+/, '') // Remove leading whitespace
                .replace(/[ \t]+$/, '') // Remove trailing spaces/tabs but keep newlines
                .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines to max double
                .replace(/^\n+|\n+$/g, ''); // Remove leading/trailing newlines from each line
              
              // Always push the line content to preserve exact empty lines
              codeLines.push(lineContent);
            });
            
            // Join lines with newlines and ensure proper ending
            code = codeLines.join('\n').trimRight() + '\n';
          } else {
            // Fallback for simple code blocks
            code = prismPre.textContent.trim();
          }
          
          // Preserve indentation
          const indentedLines = code.split('\n');
          const minIndent = Math.min(...indentedLines
            .filter(line => line.trim())
            .map(line => line.match(/^\s*/)[0].length));
          
          code = indentedLines
            .map(line => line.slice(minIndent))
            .join('\n');
        } else {
          code = node.textContent.trim();
        }
        
        // Add extra newlines for better markdown formatting
        return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
      
      case 'CODE':
        // If this code element is not inside a PRE, it's inline code
        if (!node.closest('pre')) {
          const code = node.textContent
            .replace(/`/g, '\\`') // Escape any backticks in the code
            .trim();
          return `\`${code}\``;
        }
        return node.textContent;
      
      case 'A':
        const href = node.getAttribute('href');
        return href ? `[${node.textContent}](${href})` : node.textContent;
      
      case 'STRONG':
      case 'B':
        return `**${Array.from(node.childNodes).map(elementToMarkdown).join('')}**`;
      
      case 'EM':
      case 'I':
        return `*${Array.from(node.childNodes).map(elementToMarkdown).join('')}*`;
      
      case 'P':
        return `\n${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      
      case 'UL':
        return `\n${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      
      case 'OL':
        return `\n${Array.from(node.childNodes).map((child, i) => {
          if (child.nodeName === 'LI') {
            return `${i + 1}. ${Array.from(child.childNodes).map(elementToMarkdown).join('')}\n`;
          }
          return elementToMarkdown(child);
        }).join('')}\n`;
      
      case 'LI':
        if (node.parentNode.nodeName === 'OL') return '';
        return `- ${Array.from(node.childNodes).map(elementToMarkdown).join('')}\n`;
      
      case 'SPAN':
        // Preserve color spans
        const style = node.getAttribute('style');
        if (style?.includes('color:')) {
          return node.outerHTML;
        }
        return Array.from(node.childNodes).map(elementToMarkdown).join('');
      
      default:
        return Array.from(node.childNodes).map(elementToMarkdown).join('');
    }
  }

  // Create markdown content with metadata including model info and tags
  const date = new Date().toISOString().split('T')[0];
  
  // Create model tag - convert model name to lowercase, remove spaces and special chars
  const modelTag = modelName ? 
    `#model/${modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 
    '#model/unknown';
  
  // Create topic tag from title
  let topicTag = title
    .toLowerCase()
    // Remove common words, suffixes, and special characters
    .replace(/\b(chat|export|with|the|a|an|and|or|but|in|on|at|to|for|of)\b/g, '')
    .replace(/chat export$/i, '')
    .replace(/team-?gpt/i, '')
    // Convert remaining text to tag format
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Ensure we have a valid topic tag
  topicTag = topicTag || 'general';
  
  // Build YAML frontmatter for better Obsidian compatibility
  const yamlFrontmatter = [
    '---',
    `date: ${date}`,
    `model: ${modelName || 'unknown'}`,
    `topic: ${topicTag}`,
    'tags:',
    `  - ${modelTag.slice(1)}`, // Remove # from tag
    `  - topic/${topicTag}`,
    '---',
    ''
  ].join('\n');
  
  const markdownContent = `${yamlFrontmatter}\n# ${title}\n\n${messages.join('\n\n---\n\n')}`;
  console.log('Created markdown content');

  // Create blob and download
  const blob = new Blob([markdownContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  console.log('Created blob URL');
  
  // Create download link and trigger download
  const a = document.createElement('a');
  a.href = url;
  const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${date}.md`;
  a.download = filename;
  console.log('Triggering download:', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('Download complete');
}
