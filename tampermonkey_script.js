// ==UserScript==
// @name         ChatGPT ➜ Markdown Copy
// @namespace    https://github.com/strickvl/openai-markdown-chat-share
// @version      0.3
// @description  Add copy buttons to ChatGPT that capture conversations and research reports in Markdown.
// @author       Alex Strick van Linschoten
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// @grant        GM_log
// @require      https://cdn.jsdelivr.net/npm/turndown@7.1.2/dist/turndown.min.js
// ==/UserScript==

/**
 * ChatGPT → Markdown Copy
 * -------------------------------------------------------------
 * v0.3
 */
(function () {
    "use strict";
  
    // DEBUG helper
    function debug(msg, obj) {
      if (obj) {
        console.log(`[ChatGPT Copy] ${msg}`, obj);
        GM_log(`[ChatGPT Copy] ${msg}`, JSON.stringify(obj));
      } else {
        console.log(`[ChatGPT Copy] ${msg}`);
        GM_log(`[ChatGPT Copy] ${msg}`);
      }
    }
  
    debug("Script loaded");
  
    /*───────────────────────────────────────────────*/
    /*  CONFIG & UTILITIES                          */
    /*───────────────────────────────────────────────*/
    // Configure TurndownService
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      fence: "```"
    });
    
    // Global to collect citation links
    let citationLinks = [];
    let adjacentCitations = [];
    
    // Enhance link formatting with custom rule for better spacing
    turndown.addRule('links', {
      filter: ['a'],
      replacement: function (content, node) {
        // Get link URL and text
        const href = node.getAttribute('href');
        
        // Skip blob URLs (images)
        if (href && href.startsWith('blob:')) {
          return content;
        }
        
        // Don't process empty links
        if (!href || href === '#' || href === '') {
          return content;
        }
        
        // Check if this is a citation link (has a small badge class or is inline-flex)
        const isCitation = node.classList.contains('ms-1') || 
                           node.parentElement?.classList.contains('ms-1') ||
                           href.includes('#:~:text=') || 
                           node.innerHTML.includes('inline-flex');
        
        if (isCitation) {
          try {
            // Extract domain from URL for citation
            let domain = '';
            try {
              domain = href.includes('://') ? new URL(href).hostname : href;
            } catch (e) {
              domain = href.split('/')[2] || href;
            }
            
            // Look for adjacent citation siblings
            if (node.nextElementSibling && 
                node.nextElementSibling.tagName === 'A' && 
                (node.nextElementSibling.classList.contains('ms-1') || 
                 node.nextElementSibling.innerHTML.includes('inline-flex'))) {
              // This is part of a group of citations
              if (!adjacentCitations.length) {
                // Start a new group
                adjacentCitations.push({ domain, href });
                // Return a placeholder for the start of the group
                return `[[CITATION_GROUP_START]]`;
              } else {
                // Add to existing group
                adjacentCitations.push({ domain, href });
                return ''; // Don't output anything for middle elements
              }
            } else if (adjacentCitations.length > 0) {
              // This is the last element in a group
              adjacentCitations.push({ domain, href });
              
              // Create a group marker with all adjacent citations
              const groupId = citationLinks.length;
              citationLinks.push([...adjacentCitations]);
              
              // Reset the group tracking
              adjacentCitations = [];
              
              // Return a placeholder for the entire group
              return `[[CITATION_GROUP${groupId}]]`;
            } else {
              // This is a standalone citation
              const citationId = citationLinks.length;
              citationLinks.push({ domain, href });
              return `[[CITATION${citationId}]]`;
            }
          } catch (e) {
            // Fallback if parsing fails
            debug("Citation parsing error", e);
            return `[${content}](${href})`;
          }
        } else if (adjacentCitations.length > 0) {
          // If we were collecting citations but hit a non-citation link,
          // flush the collected citations
          const groupId = citationLinks.length;
          citationLinks.push([...adjacentCitations]);
          
          // Reset the group tracking
          adjacentCitations = [];
          
          // Return a placeholder for the group plus this link
          return `[[CITATION_GROUP${groupId}]][${content}](${href})`;
        }
        
        // Regular link formatting
        return `[${content}](${href})`;
      }
    });
    
    // Add a filter rule to handle the end of document and flush any pending citations
    turndown.addRule('documentEnd', {
      filter: function(node) {
        // Apply to body or last paragraph to ensure we catch the end
        return node.tagName === 'BODY' || node.tagName === 'DIV';
      },
      replacement: function(content) {
        // Check if we have any pending citations to flush
        if (adjacentCitations.length > 0) {
          const groupId = citationLinks.length;
          citationLinks.push([...adjacentCitations]);
          
          // Reset the collection
          adjacentCitations = [];
          
          // Add the placeholder at the end
          return content + `[[CITATION_GROUP${groupId}]]`;
        }
        
        return content;
      }
    });
    
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  
    /*───────────────────────────────────────────────*/
    /*  SCRAPE CHAT → MD                            */
    /*───────────────────────────────────────────────*/
    function scrapeConversation() {
      debug("Scraping conversation");
      
      // Try multiple selectors to find conversation turns
      const selectors = [
        'div[data-testid^="conversation-turn-"]',   // New format div
        'article[data-testid^="conversation-turn-"]', // New format article
        'div[data-message-author-role]',            // Elements with direct role attribute
        'article[data-message-author-role]',        // Articles with direct role attribute
        '.text-message',                            // Message containers
        '.min-h-[20px]',                            // Minimal height message containers
        '.markdown',                                // Markdown content containers
        'main .flex.flex-col.items-center > div'    // General conversation container children
      ];
      
      let blocks = [];
      
      // Try each selector until we find some conversation blocks
      for (const selector of selectors) {
        blocks = document.querySelectorAll(selector);
        debug(`Trying selector "${selector}" - found ${blocks.length} elements`);
        
        if (blocks.length > 0) {
          debug(`Using selector: ${selector}`);
          break;
        }
      }
      
      // Fallback: If no blocks found with specific selectors, try a more generic approach
      if (blocks.length === 0) {
        // Look for any elements that might contain markdown content or message text
        debug("Using fallback approach to find conversation elements");
        
        // First try to find the main conversation container
        const mainThread = document.querySelector('main div[class*="flex-col"]');
        if (mainThread) {
          // Look for direct children that are likely conversation turns
          blocks = mainThread.querySelectorAll(':scope > div');
          debug(`Found ${blocks.length} potential blocks via main thread approach`);
        }
        
        // If that didn't work, try to find all markdown elements and work backwards
        if (blocks.length === 0) {
          const markdownElements = document.querySelectorAll('.markdown');
          debug(`Found ${markdownElements.length} markdown elements`);
          
          if (markdownElements.length > 0) {
            // For each markdown element, find its closest conversation block container
            blocks = Array.from(markdownElements).map(el => {
              // Look for parent with a minimum height constraint (likely a message container)
              return el.closest('div[class*="min-h-"]') || el.closest('div[class*="flex"]') || el.parentElement;
            }).filter(el => el !== null);
            
            // Remove duplicates
            blocks = [...new Set(blocks)];
            debug(`Found ${blocks.length} unique conversation blocks via markdown elements`);
          }
        }
      }
      
      debug(`Found ${blocks.length} conversation blocks`);
      
      const msgs = [];
  
      blocks.forEach((block, index) => {
        // Reset citation collection for each block
        citationLinks = [];
        adjacentCitations = [];
        
        // Get the role information - multiple attempts based on possible DOM structures
        let role = block.getAttribute('data-message-author-role') ||
                   block.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
                   
        // If no role attribute is found, try to determine role based on content structure
        if (!role) {
          if (block.querySelector('.markdown') || block.classList.contains('markdown')) {
            role = 'assistant';
          } else if (block.querySelector('.whitespace-pre-wrap') || block.classList.contains('whitespace-pre-wrap')) {
            role = 'user';
          } else if (block.querySelectorAll('p, ul, ol, pre, code').length > 0) {
            // If it has rich text elements, it's likely the assistant
            role = 'assistant';
          } else {
            // Try to determine role by position (odd indices are assistant in typical chat)
            role = index % 2 === 0 ? 'user' : 'assistant';
          }
        }
        
        debug(`Block ${index} assigned role: ${role}`);
        
        let content = "";
        
        if (role === "assistant") {
          // Special case: Check for deep research results
          const deepResearchResult = block.querySelector('.deep-research-result');
          
          if (deepResearchResult) {
            debug(`Found deep research result in block ${index}`);
            content = turndown.turndown(deepResearchResult.innerHTML).trim();
            
            // Post-process to fix link formatting and spacing issues
            content = postProcessMarkdown(content);
            
            debug(`Extracted deep research content (length: ${content.length})`);
          } else {
            // Regular assistant messages have a markdown element
            const markdown = block.querySelector('.markdown') || block;
            if (markdown) {
              // Use innerHTML if it's a content container, or textContent if it's just text
              const hasRichContent = markdown.querySelectorAll('p, code, pre, ol, ul, table').length > 0;
              content = hasRichContent 
                ? turndown.turndown(markdown.innerHTML).trim() 
                : markdown.textContent.trim();
                
              content = postProcessMarkdown(content);
              debug(`Extracted assistant content (length: ${content.length})`);
            } else {
              debug(`Block ${index} (assistant) has no content element`);
            }
          }
          
          // Another special case: Check for content in the "border-token-border-sharp" container
          if (!content || content.length < 100) {
            const borderContainer = block.querySelector('.border-token-border-sharp');
            if (borderContainer) {
              const borderMarkdown = borderContainer.querySelector('.markdown');
              if (borderMarkdown) {
                // Reset citations for this section
                citationLinks = [];
                adjacentCitations = [];
                
                let borderContent = turndown.turndown(borderMarkdown.innerHTML).trim();
                borderContent = postProcessMarkdown(borderContent);
                debug(`Extracted border container content (length: ${borderContent.length})`);
                
                // If this is substantially longer than what we already have, use it
                if (borderContent.length > (content.length * 1.5)) {
                  content = borderContent;
                } else if (content) {
                  // Append if we already have some content
                  content += "\n\n---\n\n" + borderContent;
                } else {
                  content = borderContent;
                }
              }
            }
          }
        } else if (role === "user") {
          // User messages can be found in various containers
          const userContent = 
            block.querySelector('.whitespace-pre-wrap') || 
            block.querySelector('p') ||
            block;
            
          if (userContent) {
            // User content is typically plain text
            content = userContent.textContent.trim();
            debug(`Extracted user content (length: ${content.length})`);
          } else {
            debug(`Block ${index} (user) has no content element`);
          }
        }
        
        if (content) {
          msgs.push({ role, content });
        }
      });
  
      debug(`Extracted ${msgs.length} messages`);
      return msgs;
    }
    
    // Extract content from a deep research report
    function scrapeResearchReport(researchElement) {
      debug("Scraping research report");
      
      // Reset citation collection
      citationLinks = [];
      adjacentCitations = [];
      
      // Extract content
      let content = turndown.turndown(researchElement.innerHTML).trim();
      
      // Post-process to fix link formatting and spacing issues
      content = postProcessMarkdown(content);
      
      debug(`Extracted research content (length: ${content.length})`);
      
      return content;
    }
    
    // Post-process markdown to fix common link formatting issues
    function postProcessMarkdown(markdown) {
      if (!markdown) return "";
      
      // Fix spacing around links
      let processed = markdown
        // First, replace any group start markers (should be rare, but handle edge cases)
        .replace(/\[\[CITATION_GROUP_START\]\]/g, '')
        
        // Replace citation groups with properly formatted links
        .replace(/\[\[CITATION_GROUP(\d+)\]\]/g, (match, id) => {
          const group = citationLinks[parseInt(id, 10)];
          if (!group || !Array.isArray(group)) return match;
          
          // Format each citation and join them with spaces
          const citations = group.map(citation => {
            return `([${citation.domain}](${citation.href}))`;
          }).join(' ');
          
          return ` ${citations}`;
        })
        
        // Replace individual citations
        .replace(/\[\[CITATION(\d+)\]\]/g, (match, id) => {
          const citation = citationLinks[parseInt(id, 10)];
          // Handle both single citations and incorrectly formatted groups
          if (!citation) return match;
          if (Array.isArray(citation)) {
            const citations = citation.map(c => {
              return `([${c.domain}](${c.href}))`;
            }).join(' ');
            return ` ${citations}`;
          }
          return ` ([${citation.domain}](${citation.href}))`;
        })
        
        // Fix domain links without citation brackets
        .replace(/\[([a-z0-9-]+\.[a-z0-9-]+(?:\.[a-z0-9-]+)*)\]\((https?:\/\/[^\s)]+)\)/g, (match, domain, url) => {
          // Only add parentheses if this isn't already in parentheses
          if (match.startsWith('(') && match.endsWith(')')) return match;
          return `([${domain}](${url}))`;
        })
        
        // Fix URLs that are directly adjacent to words with no space
        .replace(/(\w)(\[.+?\]\(.+?\))/g, '$1 $2')
        
        // Ensure a space between sentences and links
        .replace(/\.(\[)/g, '. $1')
        
        // Add space after commas before links
        .replace(/,(\[)/g, ', $1')
        
        // Ensure space between links
        .replace(/\)(\[)/g, ') $1')
        
        // Remove any double parentheses
        .replace(/\(\((\[[^\]]+\]\([^)]+\))\)\)/g, '($1)')
        
        // Ensure space after links
        .replace(/\)([a-zA-Z0-9])/g, ') $1')
        
        // Remove any potential double spaces
        .replace(/  +/g, ' ');
                
      // Ensure proper spacing around parentheses with links
      processed = processed
        .replace(/\(\s+\(/g, '(')
        .replace(/\)\s+\)/g, ')')
        .replace(/\)\s*\(/g, ') (')
        .replace(/\(\s*\)/g, '()');
      
      return processed;
    }
  
    function toMarkdown(convo) {
      const out = ["# ChatGPT Conversation", ""];
      convo.forEach((t) => {
        const emoji = t.role === "user" ? "🧑" : "🤖";
        out.push(`## ${emoji} ${cap(t.role)}`, "", t.content, "", "---", "");
      });
      return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
  
    /*───────────────────────────────────────────────*/
    /*  BANNER                                      */
    /*───────────────────────────────────────────────*/
    function banner(msg, kind = "info", dur = 4000) {
      debug(`Banner: ${msg} (${kind})`);
      const c = { info: "#2563eb", success: "#15803d", error: "#dc2626" }[kind];
      const el = Object.assign(document.createElement("div"), {
        textContent: msg,
      });
      el.style.cssText = `position:fixed;top:0;left:0;right:0;padding:8px 12px;font:14px system-ui,sans-serif;color:#fff;background:${c};z-index:99999;text-align:center`;
      document.body.appendChild(el);
      if (dur) setTimeout(() => el.remove(), dur);
    }
  
    /*───────────────────────────────────────────────*/
    /*  BUTTON CREATION                             */
    /*───────────────────────────────────────────────*/
    function createButtons(idSuffix = "inline") {
      debug(`Creating buttons with suffix: ${idSuffix}`);
      
      // Create container for the copy button
      const container = document.createElement("div");
      container.className = "chatgpt-copy-buttons-container";
      container.style.display = "flex";
      
      // Create Copy button
      const copyBtn = document.createElement("button");
      copyBtn.id = `chatgpt-copy-btn-${idSuffix}`;
      copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
      copyBtn.title = "Copy conversation as Markdown to clipboard";
      copyBtn.setAttribute("aria-label", "Copy conversation as Markdown");
      copyBtn.className = "chatgpt-copy-btn";
      
      copyBtn.onclick = async () => {
        try {
          banner("Preparing markdown…", "info", 1500);
          const convo = scrapeConversation();
          if (!convo.length) throw new Error("No messages detected on screen.");
          const md = toMarkdown(convo);
          
          // Copy to clipboard
          await navigator.clipboard.writeText(md);
          banner("Copied to clipboard!", "success");
        } catch (e) {
          console.error(e);
          banner(e.message, "error", 6000);
        }
      };
      
      container.appendChild(copyBtn);
      
      return container;
    }
    
    // Create a copy button for a research report
    function createResearchCopyButton(researchElement, position = 'top') {
      debug(`Creating ${position} copy button for research report`);
      
      // Create unique class for this button position
      const containerClass = `chatgpt-research-buttons-${position}`;
      
      // Check if this report already has buttons in this position
      if (researchElement.querySelector(`.${containerClass}`)) {
        return;
      }
      
      // Create container for buttons
      const container = document.createElement("div");
      container.className = `chatgpt-research-buttons-container ${containerClass}`;
      
      // Set position-specific styles
      let positionStyles = '';
      if (position === 'top') {
        positionStyles = `
          top: 8px;
          right: 8px;
        `;
      } else if (position === 'bottom') {
        positionStyles = `
          bottom: 8px;
          right: 8px;
        `;
      }
      
      // Style the container
      container.style.cssText = `
        display: flex;
        gap: 6px;
        position: absolute;
        ${positionStyles}
        z-index: 1000;
      `;
      
      // Create Copy button
      const copyBtn = document.createElement("button");
      copyBtn.className = `chatgpt-research-copy-btn`;
      copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
      copyBtn.title = "Copy this research report as Markdown";
      copyBtn.style.cssText = `
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        width: 28px;
        height: 28px;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      
      copyBtn.addEventListener('mouseover', () => {
        copyBtn.style.opacity = '1';
      });
      
      copyBtn.addEventListener('mouseout', () => {
        copyBtn.style.opacity = '0.8';
      });
      
      // Add click event for copy button
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          banner("Preparing research report…", "info", 1500);
          
          // Get research content
          const content = scrapeResearchReport(researchElement);
          if (!content) {
            throw new Error("Could not extract research report content");
          }
          
          // Build markdown
          let md = "# ChatGPT Research Report\n\n";
          md += content;
          
          // Copy to clipboard
          await navigator.clipboard.writeText(md);
          banner("Copied to clipboard!", "success");
        } catch (e) {
          console.error(e);
          banner(e.message, "error", 6000);
        }
      });
      
      container.appendChild(copyBtn);
      
      return container;
    }
    
    // Add copy buttons to research reports only (top and bottom)
    function addResearchCopyButtons() {
      debug("Adding copy buttons to research reports");
      
      // Find all deep research reports
      const researchReports = document.querySelectorAll('.deep-research-result');
      debug(`Found ${researchReports.length} research reports`);
      
      researchReports.forEach((report) => {
        // Make sure the report has a relative position for absolute positioning of the buttons
        if (!report.style.position || report.style.position === 'static') {
          report.style.position = 'relative';
        }
        
        // Check for existing button containers
        const hasTopButtons = report.querySelector('.chatgpt-research-buttons-top');
        const hasBottomButtons = report.querySelector('.chatgpt-research-buttons-bottom');
        
        // Add top buttons if needed
        if (!hasTopButtons) {
          const topBtns = createResearchCopyButton(report, 'top');
          if (topBtns) {
            report.appendChild(topBtns);
            debug("Added top copy button to research report");
          }
        }
        
        // Add bottom buttons if needed
        if (!hasBottomButtons) {
          const bottomBtns = createResearchCopyButton(report, 'bottom');
          if (bottomBtns) {
            report.appendChild(bottomBtns);
            debug("Added bottom copy button to research report");
          }
        }
      });
    }
  
    /*───────────────────────────────────────────────*/
    /*  TARGET CONTAINER DETECTION                  */
    /*───────────────────────────────────────────────*/
    function directChildFor(parent, descendant) {
      let node = descendant;
      while (node && node.parentElement !== parent) {
        node = node.parentElement;
      }
      return node && node.parentElement === parent ? node : null;
    }

    function findButtonTarget() {
      debug("Finding button target");
      
      // Option 1: Use the footer action row so the copy button participates in layout.
      const composerActions = document.querySelector('[data-testid="composer-footer-actions"]');
      if (composerActions) {
        debug("Found composer actions container");
        const trailingActions = composerActions.querySelector('[data-testid="composer-trailing-actions"]');
        const trailingActionsChild = trailingActions ? directChildFor(composerActions, trailingActions) : null;
        return { 
          element: composerActions, 
          before: trailingActionsChild,
          method: trailingActionsChild ? 'insert-before' : 'append',
          position: 'composer-footer'
        };
      }

      // Option 2: Try the trailing actions as a compact fallback.
      const trailingActions = document.querySelector('[data-testid="composer-trailing-actions"]');
      if (trailingActions) {
        debug("Found trailing actions container");
        return {
          element: trailingActions,
          method: 'prepend',
          position: 'trailing-actions'
        };
      }

      // Option 3: Try conversation header actions
      const headerActions = document.getElementById('conversation-header-actions');
      if (headerActions) {
        debug("Found conversation header actions");
        return { 
          element: headerActions, 
          method: 'append', 
          position: 'header'
        };
      }

      // Option 4: Use the floating button as fallback
      debug("No suitable target found, will use floating button");
      return null;
    }
  
    /*───────────────────────────────────────────────*/
    /*  INJECTION LOGIC                             */
    /*───────────────────────────────────────────────*/
    function dumpUIElements() {
      // Dump useful elements for debugging
      debug("Dumping UI Elements for debugging");
      
      // Look for IDs
      const elementsWithId = document.querySelectorAll("[id]");
      debug(`Found ${elementsWithId.length} elements with IDs`);
      if (elementsWithId.length < 50) { // Don't log too many
        const ids = Array.from(elementsWithId).map(el => el.id);
        debug("Element IDs:", ids);
      }
      
      // Look for important data-testid elements
      const testIdElements = document.querySelectorAll("[data-testid]");
      debug(`Found ${testIdElements.length} elements with data-testid`);
      if (testIdElements.length < 50) {
        const testIds = Array.from(testIdElements).map(el => el.getAttribute("data-testid"));
        debug("Test IDs:", testIds);
      }
      
      // Check for specific elements we're targeting
      const potentialTargets = [
        "composer-footer-actions",
        "composer-trailing-actions",
        "thread-bottom", 
        "thread-bottom-container",
        "conversation-turn"
      ];
      
      potentialTargets.forEach(id => {
        const el = document.querySelector(`[data-testid="${id}"], [data-testid^="${id}"]`);
        debug(`Element '${id}': ${el ? "Found" : "Not found"}`);
      });
      
      // Additional debugging info
      debug(`Found ${document.querySelectorAll('.deep-research-result').length} research reports`);
      debug(`Found ${document.querySelectorAll('.markdown').length} markdown elements`);
      
      // Debug conversation blocks
      debug(`Testing conversation block selectors`);
      const conversationSelectors = [
        'div[data-testid^="conversation-turn-"]',
        'article[data-testid^="conversation-turn-"]',
        'div[data-message-author-role]',
        'article[data-message-author-role]',
        '.min-h-[20px]',
        '.whitespace-pre-wrap'
      ];
      
      conversationSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          debug(`Selector "${selector}": ${elements.length} elements`);
        } catch (e) {
          debug(`Error with selector "${selector}": ${e.message}`);
        }
      });
    }
    
    function injectButton() {
      // Check if already injected
      if (document.querySelector(".chatgpt-copy-btn")) {
        debug("Button already exists, skipping injection");
        return;
      }
      
      dumpUIElements();
      
      const target = findButtonTarget();
      if (target && target.element) {
        debug(`Injecting buttons with method: ${target.method}, position: ${target.position}`);
        const buttonsContainer = createButtons("inline");
        
        // Apply styling based on where we're inserting the buttons
        if (target.position === 'composer-footer') {
          buttonsContainer.style.marginLeft = "6px";
          buttonsContainer.style.marginRight = "6px";
          if (target.before && target.before.parentElement === target.element) {
            target.element.insertBefore(buttonsContainer, target.before);
          } else {
            target.element.appendChild(buttonsContainer);
          }
        } else if (target.position === 'trailing-actions') {
          buttonsContainer.style.marginRight = "6px";
          target.element.prepend(buttonsContainer);
        } else if (target.position === 'relative') {
          buttonsContainer.style.marginLeft = "8px";
          target.element.appendChild(buttonsContainer);
        } else if (target.position === 'header') {
          buttonsContainer.style.marginLeft = "8px";
          target.element.appendChild(buttonsContainer);
        }
      } else if (!document.querySelector("#chatgpt-copy-btn-float")) {
        debug("Injecting floating copy button");
        // Fallback floating button (visible even if no target found)
        const floatBtns = createButtons("float");
        floatBtns.style.position = "fixed";
        floatBtns.style.top = "64px";
        floatBtns.style.right = "12px";
        floatBtns.style.zIndex = "9999";
        document.body.appendChild(floatBtns);
      }
      
      // Also add copy buttons to research reports
      addResearchCopyButtons();
    }
  
    // Add global styles for our buttons
    GM_addStyle(`
      .chatgpt-copy-buttons-container {
        display: flex !important;
        align-items: center !important;
        flex: 0 0 auto !important;
      }
      
      .chatgpt-copy-btn {
        color: white !important;
        border: none !important;
        border-radius: 8px !important;
        width: 32px !important;
        height: 32px !important;
        padding: 0 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24) !important;
        transition: background 0.2s ease, box-shadow 0.2s ease !important;
        z-index: 9999 !important;
      }

      .chatgpt-copy-btn {
        background: #1e88e5 !important;
      }

      .chatgpt-copy-btn:hover {
        background: #1976d2 !important;
        box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23) !important;
      }

      .chatgpt-copy-btn svg {
        width: 16px !important;
        height: 16px !important;
      }
      
      /* Research buttons container */
      .chatgpt-research-buttons-container {
        display: flex !important;
        gap: 6px !important;
        position: absolute !important;
        z-index: 1000 !important;
        transition: opacity 0.2s ease !important;
      }
      
      /* Position-specific styles */
      .chatgpt-research-buttons-top {
        top: 8px !important;
        right: 8px !important;
      }
      
      .chatgpt-research-buttons-bottom {
        bottom: 8px !important;
        right: 8px !important;
      }
      
      /* Research buttons */
      .chatgpt-research-copy-btn {
        border: none !important;
        border-radius: 4px !important;
        width: 28px !important;
        height: 28px !important;
        padding: 6px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0.8 !important;
        transition: opacity 0.2s ease !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        color: white !important;
      }

      .chatgpt-research-copy-btn {
        background: #1e88e5 !important;
      }

      .chatgpt-research-copy-btn:hover {
        opacity: 1 !important;
        background: #1976d2 !important;
      }

      .chatgpt-research-copy-btn svg {
        width: 12px !important;
        height: 12px !important;
      }
      
      /* Make sure research reports have position relative for button placement */
      .deep-research-result {
        position: relative !important;
        padding-bottom: 40px !important; /* Add padding to make room for bottom buttons */
      }
      
      /* Hide buttons by default, show on hover */
      .deep-research-result:not(:hover) .chatgpt-research-buttons-container {
        opacity: 0.3 !important;
      }
      
      .deep-research-result:hover .chatgpt-research-buttons-container {
        opacity: 0.9 !important;
      }
    `);
  
    // Delay initial injection to ensure DOM is loaded
    setTimeout(() => {
      debug("Starting initial injection");
      injectButton();
      
      // Observe SPA mutations + periodic retry (covers nav changes)
      debug("Setting up mutation observer");
      const obs = new MutationObserver((mutations) => {
        // Always check for new research reports
        addResearchCopyButtons();
        
        // Only re-inject main button if not present
        if (!document.querySelector(".chatgpt-copy-btn")) {
          debug(`Mutation observed (${mutations.length} changes) - button not found, re-injecting`);
          injectButton();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      
      // Regular retry as additional safety
      const retry = setInterval(() => {
        if (!document.querySelector(".chatgpt-copy-btn")) {
          debug("Retry timer fired - button not found, re-injecting");
          injectButton();
        } else {
          debug("Button found, clearing retry interval");
          clearInterval(retry);
        }
        
        // Always try to add research copy buttons
        addResearchCopyButtons();
      }, 3000);
      
      // Clear retry after reasonable timeout
      setTimeout(() => {
        clearInterval(retry);
        debug("Cleared retry interval due to timeout");
      }, 30000);
      
    }, 2000);
  
})();
