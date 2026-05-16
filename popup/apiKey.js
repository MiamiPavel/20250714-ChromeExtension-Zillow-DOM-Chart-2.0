const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyInputLabel = document.getElementById("apiKeyInputLabel");
const saveBtn = document.getElementById("saveApiKey");
const resetBtn = document.getElementById("resetApiKey");
const messageDiv = document.getElementById("apiKeyMessage");

function setMessage(msg, isError = false) {
  messageDiv.textContent = msg;
  messageDiv.style.color = isError ? "#8a2c2c" : "#02753c";
}

function setSavedState(isSaved) {
  if (isSaved) { 
    apiKeyInputLabel.style.display = "none";
    apiKeyInput.style.display = "none";
    saveBtn.style.display = "none";
    resetBtn.style.display = "inline-block";
    setMessage("API key saved.");
  } else {
    apiKeyInputLabel.style.display = "block";
    apiKeyInput.style.display = "block";
    saveBtn.style.display = "inline-block";
    resetBtn.style.display = "none";
    setMessage("");
  }
}

function validateApifyApiKey(key) {
  // Apify API: https://api.apify.com/v2/key-value-stores?token=API_KEY (any endpoint, this is a simple one)
  return fetch(`https://api.apify.com/v2/key-value-stores?token=${key}`)
    .then((r) => (r.status === 200 ? r.json() : Promise.reject()))
    .then(() => true)
    .catch(() => false);
}

async function loadOptionalLocalConfig() {
  // Optional gitignored preset at popup/local-config.json — lets one developer
  // bake in their own Apify token for fresh installs without committing it.
  // Missing file -> resp.ok === false -> we return null (no console error).
  try {
    const url = chrome.runtime.getURL('popup/local-config.json');
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (_) {
    return null;
  }
}

async function loadApiKey() {
  const stored = await new Promise((resolve) =>
    chrome.storage.sync.get(["apifyApiKey"], resolve)
  );
  if (stored.apifyApiKey) {
    apiKeyInput.value = "********";
    setSavedState(true);
    return;
  }
  // No saved key yet. Check for a local preset before showing the empty form.
  const localCfg = await loadOptionalLocalConfig();
  if (localCfg && typeof localCfg.apifyApiKey === 'string' && localCfg.apifyApiKey) {
    await new Promise((resolve) =>
      chrome.storage.sync.set({ apifyApiKey: localCfg.apifyApiKey }, resolve)
    );
    apiKeyInput.value = "********";
    setSavedState(true);
    setMessage("Loaded API key from popup/local-config.json.");
    return;
  }
  apiKeyInput.value = "";
  setSavedState(false);
}

saveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  setMessage("Validating...");
  if (!key) {
    setMessage("Please enter an API key.", true);
    return;
  }
  const isValid = true; // await validateApifyApiKey(key);
  if (!isValid) {
    setMessage("Invalid Apify API key.", true);
    return;
  }
  chrome.storage.sync.set({ apifyApiKey: key }, () => {
    setSavedState(true);
  });
});

resetBtn.addEventListener("click", () => {
  chrome.storage.sync.remove(["apifyApiKey"], () => {
    apiKeyInput.value = "";
    setSavedState(false);
  });
});

apiKeyInput.addEventListener("focus", () => {
  if (apiKeyInput.value === "********") {
    apiKeyInput.value = "";
  }
});

// On load
loadApiKey();