const fileInput = document.getElementById('fileUpload');
const uploadBtn = document.getElementById('uploadBtn');
const uploadMsg = document.getElementById('uploadMsg');
const chartContainer = document.getElementById('chartContainer');
let uploadedFileContent = null;

fileInput.addEventListener('change', () => {
  uploadBtn.disabled = fileInput.files.length === 0;
  uploadMsg.textContent = '';
  chartContainer.style.display = 'none';
});

uploadBtn.addEventListener('click', () => {
  if (fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    uploadedFileContent = e.target.result; 
    loadFileContent(uploadedFileContent);
  };
  reader.onerror = function() {
    uploadMsg.textContent = 'Error reading file.';
    uploadMsg.style.color = '#ff5858';
    chartContainer.style.display = 'none';
  };
  reader.readAsText(file);
});

function loadFileContent(uploadedFileContent) {
  const priceHistory = window.parsePriceHistoryCSV(uploadedFileContent); 
    if (!priceHistory.length) {
      uploadMsg.textContent = 'No valid price data found.';
      uploadMsg.style.color = '#ff5858';
      chartContainer.style.display = 'none';
      return;
    }
    uploadMsg.textContent = 'File uploaded!';
    uploadMsg.style.color = '#00d26a';
    chartContainer.style.display = 'block';
    // Remove previous chart if exists
    if (window._chartInstance) {
      window._chartInstance.destroy();
      window._chartInstance = null;
    }
    // Render chart and keep reference
    window._chartInstance = window.renderPriceChart(priceHistory);
    // Return the parsed data so it can be tracked
    return priceHistory;
}


window.addEventListener('load', () => {
  // Standalone mode (HTML export opened outside the extension): auto-load the embedded CSV.
  if (typeof window._injectedCSV === 'string' && window._injectedCSV.length > 0) {
    // The upload/export/publish controls don't make sense once data is baked into the file.
    const hide = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    };
    hide('uploadSection');
    hide('exportHtmlBtn');
    hide('publishGhPagesBtn');
    if (typeof window._injectedZillowSearchUrl === 'string' && window._injectedZillowSearchUrl) {
      window.zillowSearchUrl = window._injectedZillowSearchUrl;
    }
    loadFileContent(window._injectedCSV);
    return;
  }
  // Extension mode: ask the service worker for any pending CSV passed via createChartTab.
  // Even with no CSV, the service worker may return lastSearchUrl so manual uploads
  // can still show the banner.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'getChartData' }, (response) => {
      if (response && typeof response.searchUrl === 'string' && response.searchUrl) {
        window.zillowSearchUrl = response.searchUrl;
        // Refresh the banner in case the user already triggered a manual upload
        // before this async callback resolved.
        if (typeof window.updateZillowSearchUrlSection === 'function') {
          window.updateZillowSearchUrlSection();
        }
      }
      if (response && response.data) {
        loadFileContent(response.data);
      }
    });
  }
});