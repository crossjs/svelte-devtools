const toolsPorts = new Map()

chrome.runtime.onConnect.addListener(port => {
  if (port.sender.url.replace('//devtools', '/devtools') == chrome.runtime.getURL('/devtools/panel.html')) {
    port.onMessage.addListener(handleToolsMessage)
  } else {
    // This is not an expected connection, so we just log an error and close it
    console.error('Unexpected connection. Port ', port)
    port.disconnect();
  }
})

function handleToolsMessage(msg, port) {
  switch (msg.type) {
    // 'init' and 'reload' messages do not need to be delivered to content script
    case 'init':
      setup(msg.tabId, port, msg.profilerEnabled)
      break
    case 'reload':
      chrome.tabs.reload(msg.tabId, { bypassCache: true })
      break
    default:
      chrome.tabs.sendMessage(msg.tabId, msg)
      break
  }
}

// Receive messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender) =>
  handlePageMessage(msg, sender.tab.id)
);

function handlePageMessage(msg, tabId) {
  const tools = toolsPorts.get(tabId)
  if (tools) tools.postMessage(msg)
}

function attachScript(tabId, changed) {
  if (
    !toolsPorts.has(tabId) ||
    changed.status != 'loading' ||
    // #if process.env.TARGET === 'firefox'
    !changed.url
    // #else
    false
    // #endif
  )
    return

  chrome.tabs.executeScript(tabId, {
    file: '/privilegedContent.js',
    runAt: 'document_start',
  })
}

function setup(tabId, port, profilerEnabled) {
  chrome.tabs.executeScript(tabId, {
    code: profilerEnabled ? `window.sessionStorage.SvelteDevToolsProfilerEnabled = "true"` : 'delete window.sessionStorage.SvelteDevToolsProfilerEnabled',
    runAt: 'document_start',
  })

  toolsPorts.set(tabId, port)

  port.onDisconnect.addListener(() => {
    toolsPorts.delete(tabId)
    chrome.tabs.onUpdated.removeListener(attachScript)
    // Inform content script that it background closed and it needs to clean up
    chrome.tabs.sendMessage(tabId, {
      type: 'clear',
      tabId: tabId,
    })
  })

  chrome.tabs.onUpdated.addListener(attachScript)
}
