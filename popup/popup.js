document.getElementById("openChart").addEventListener("click", async () => {
  // Best-effort: remember the active tab's URL if it looks like a Zillow page.
  // Lets the chart page display "Zillow Search URL: …" and bake it into the
  // export, even when you skip Get Data and upload a CSV manually.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.url === 'string' && tab.url.includes('zillow.com')) {
      chrome.runtime.sendMessage({ action: 'rememberSearchUrl', url: tab.url });
    }
  } catch (_) {
    // tabs.query can fail in obscure cases; not worth blocking the open.
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("chart.html") });
});

function downloadCSV(data) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const date =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const time =
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");

    const filename = `${date}-${time}.csv`;
    downloadCSVWithAPI(data, filename);
  });
}

async function getActiveTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab.url;
  } catch (error) {
    console.error("Error getting active tab:", error);
    return null;
  }
}

// UI State Management
let currentPopup = null;

async function updateUI() {
  const { scrapingState, scrapingProgress, scrapingResults, scrapingError } = await chrome.storage.local.get([
    'scrapingState', 'scrapingProgress', 'scrapingResults', 'scrapingError'
  ]);

  // If we have a popup but state is IDLE, remove it
  if (scrapingState === 'IDLE') {
    if (currentPopup) {
      $(".get-data-progress-popup").remove();
      currentPopup = null;
    }
    $(".get-data-btn").prop("disabled", false);
    return;
  }

  // If we don't have a popup but state is active, create it
  if (!currentPopup) {
    const stepLabels = ["Searching...", "Getting Details..."];
    const $btn = $(".get-data-btn");
    if ($btn.length) {
      currentPopup = new ProgressPopup(stepLabels, $btn);
      $btn.prop("disabled", true);
    } else {
      // Button might not be injected yet if we just opened the popup
      // We'll retry when button is added
      return;
    }
  }

  // Update popup based on state
  if (scrapingState === 'SEARCHING') {
    currentPopup.setLoading(0);
  } else if (scrapingState === 'DETAILS') {
    currentPopup.completeStep(0, scrapingProgress?.message || "Searching...");
    currentPopup.setLoading(1);
    if (scrapingProgress?.detailsCount) {
      currentPopup.updateStep(1, `Getting Details... (${scrapingProgress.detailsCount} scraped)`);
    }
  } else if (scrapingState === 'COMPLETED') {
    currentPopup.completeStep(0, "Found results"); // Fallback text
    currentPopup.completeStep(1, "Obtained all details");
    
    // Show download options if not already shown
    if (currentPopup.$popup.find('button').length === 0) {
       currentPopup.showDownloadOptions(1, async (option) => {
          try {
            if (option === "csv") {
              await downloadCSV(scrapingResults);
              currentPopup.completeStep(1, "Downloaded CSV");
            } else if (option === "chart") {
              await loadCSVForChart(scrapingResults);
              currentPopup.completeStep(1, "Loaded for Chart");
            }
            // After action, maybe reset state?
            // chrome.runtime.sendMessage({ action: 'RESET_SCRAPE' });
          } catch (downloadErr) {
            currentPopup.showError(1, downloadErr || "Download failed");
          }
        });
        
        // Add a "Start Over" button
        const $startOverBtn = $("<button>")
          .text("Start Over")
          .css({
            marginTop: "10px",
            padding: "8px 16px",
            borderRadius: "4px",
            border: "1px solid #95a5a6",
            background: "white",
            color: "#7f8c8d",
            fontSize: "12px",
            cursor: "pointer",
            width: "100%"
          })
          .click(() => {
            chrome.runtime.sendMessage({ action: 'RESET_SCRAPE' });
          });
          
        currentPopup.$popup.append($startOverBtn);
    }
  } else if (scrapingState === 'ERROR') {
    const step = scrapingError?.step || 0;
    const msg = scrapingError?.message || "Unknown error";
    currentPopup.showError(step, msg);
    
    // Add "Try Again" button
    if (currentPopup.$popup.find('.try-again-btn').length === 0) {
        const $tryAgainBtn = $("<button>")
          .addClass('try-again-btn')
          .text("Try Again")
          .css({
            marginTop: "10px",
            padding: "8px 16px",
            borderRadius: "4px",
            border: "1px solid #e74c3c",
            background: "white",
            color: "#e74c3c",
            fontSize: "12px",
            cursor: "pointer",
            width: "100%"
          })
          .click(() => {
            chrome.runtime.sendMessage({ action: 'RESET_SCRAPE' });
          });
        currentPopup.$popup.append($tryAgainBtn);
    }
  }
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.scrapingState || changes.scrapingProgress)) {
    updateUI();
  }
});

async function addGetDataButton() {
  const href = await getActiveTabUrl();
  if (!href || !href.includes("searchQueryState")) return;
  const actionBar = $(".input-button-row").parent();
  if (actionBar.length === 0) return;
  if (actionBar.find(".get-data-btn").length > 0) return;

  const saveSearchButton = $("#openChart");
  const $parent = $("<div>").css({ position: "relative" });
  const $button = saveSearchButton.clone().text("Get Data");
  $parent.append($button);
  $button
    .addClass("get-data-btn")
    .css({
      minWidth: "fit-content",
    })
    .on("click", async function (e) {
      // Start scraping via background script
      chrome.runtime.sendMessage({ action: 'START_SCRAPE', url: href });
    });
  actionBar.append($parent);
  
  // Initial UI update after button is added
  updateUI();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Listen for tab change messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TAB_CHANGED") {
      addGetDataButton();
    }
  });
  addGetDataButton();
});

function pick(obj, keys) {
  return Object.fromEntries(
    keys.filter((key) => key in obj).map((key) => [key, obj[key]])
  );
}
async function loadCSVForChart(results) {
    const csv = formatArray(results);
    chrome.runtime.sendMessage({
      action: 'createChartTab',
      data: csv
    });
  }

// Apify API key entry/save/reset is handled by popup/apiKey.js.
// (The original code had a "Use Pavel API Key" radio that hardcoded a real
// token; removed before pushing this source publicly. Each user supplies
// their own Apify token via the Save button.)