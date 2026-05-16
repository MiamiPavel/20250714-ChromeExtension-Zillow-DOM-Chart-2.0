importScripts('apify-utils.js');

// State management via storage
const STORAGE_KEYS = {
  STATE: 'scrapingState',
  PROGRESS: 'scrapingProgress',
  RESULTS: 'scrapingResults',
  ERROR: 'scrapingError'
};

const STATES = {
  IDLE: 'IDLE',
  SEARCHING: 'SEARCHING',
  DETAILS: 'DETAILS',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR'
};

// Initialize state if not present
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [STORAGE_KEYS.STATE]: STATES.IDLE,
    [STORAGE_KEYS.PROGRESS]: null,
    [STORAGE_KEYS.RESULTS]: null,
    [STORAGE_KEYS.ERROR]: null
  });
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  chrome.runtime.sendMessage({
    type: 'TAB_CHANGED',
    url: tab.url,
    tabId: tab.id
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    chrome.runtime.sendMessage({
      type: 'TAB_CHANGED',
      url: tab.url,
      tabId: tabId
    }).catch(() => {});
  }
});

let pendingChartData = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createChartTab') {
    pendingChartData = message.data;
    chrome.tabs.create({ url: chrome.runtime.getURL("chart.html") });
  }
  
  if (message.action === 'getChartData') {
    sendResponse({data: pendingChartData});
    pendingChartData = null; // Clear after use
  }

  if (message.action === 'START_SCRAPE') {
    startScraping(message.url);
  }

  if (message.action === 'RESET_SCRAPE') {
    resetState();
  }
});

async function resetState() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.STATE]: STATES.IDLE,
    [STORAGE_KEYS.PROGRESS]: null,
    [STORAGE_KEYS.RESULTS]: null,
    [STORAGE_KEYS.ERROR]: null
  });
}

async function updateState(state, progress = null, results = null, error = null) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.STATE]: state,
      [STORAGE_KEYS.PROGRESS]: progress,
      [STORAGE_KEYS.RESULTS]: results,
      [STORAGE_KEYS.ERROR]: error
    });
  } catch (e) {
    console.error("Failed to update state in storage:", e);
    // If quota exceeded, try to save just the error state without results
    if (e.message.includes("Quota") || e.message.includes("quota")) {
        try {
            await chrome.storage.local.set({
                [STORAGE_KEYS.STATE]: STATES.ERROR,
                [STORAGE_KEYS.PROGRESS]: null,
                [STORAGE_KEYS.RESULTS]: null,
                [STORAGE_KEYS.ERROR]: "Storage quota exceeded. Please clear extension data or reduce result size."
            });
        } catch (innerE) {
            console.error("Critical: Failed to save even the error state:", innerE);
        }
    }
  }
}

async function startScraping(url) {
  try {
    await updateState(STATES.SEARCHING, { step: 0, message: "Searching..." });

    const searchData = await getSearchResults(url);
    
    await updateState(STATES.DETAILS, { 
      step: 0, 
      message: `Found ${searchData.results.length} results`, 
      detailsCount: 0 
    });

    const detailsData = await getDetails(searchData, async (progress) => {
      if (progress && typeof progress.itemCount === 'number') {
        await updateState(STATES.DETAILS, { 
          step: 1, 
          message: `Getting Details... (${progress.itemCount} scraped)`,
          detailsCount: progress.itemCount
        });
      }
    });

    await updateState(STATES.COMPLETED, { step: 1, message: "Obtained all details" }, detailsData.results);
    playBeep();

  } catch (err) {
    console.error("Scraping error:", err);
    let errorMsg = err.message || "Unknown error";
    let step = 0;
    
    if (errorMsg.includes("detail")) step = 1;
    else if (errorMsg.includes("Search")) step = 0;
    
    await updateState(STATES.ERROR, { step: step, message: errorMsg }, null, errorMsg);
  }
}

function getSearchResults(href) {
  return new Promise(async (resolve, reject) => {
    const input = { searchUrls: [{ url: href }] };
    try {
      const result = await handleApifyRequest({
        action: "runApifyActor",
        actorId: "maxcopell~zillow-scraper",
        input: input,
      });
      if (result.success) {
        resolve(result.data);
      } else {
        reject(new Error(result.error || "Search failed"));
      }
    } catch (error) {
      reject(error);
    }
  });
}

function getDetails(data, onProgress) {
  return new Promise(async (resolve, reject) => {
    const input = {
      startUrls: data.results.map((result) => ({ url: result.detailUrl })),
    };
    try {
      const result = await handleApifyRequest({
        action: "runApifyActor",
        actorId: "maxcopell~zillow-detail-scraper",
        input: input,
      }, onProgress);
      if (result.success) {
        resolve(result.data);
      } else {
        reject(new Error(result.error || "Details fetch failed"));
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Audio handling via offscreen document
async function playBeep() {
  if (await chrome.offscreen.hasDocument()) {
    chrome.runtime.sendMessage({ type: 'play-beep' });
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Notification beep for completed task',
  });

  chrome.runtime.sendMessage({ type: 'play-beep' });
  
  // Close document after a delay
  setTimeout(() => {
    chrome.offscreen.closeDocument();
  }, 3000);
}
