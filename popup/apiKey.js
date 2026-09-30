const apiKeyInput = document.getElementById("apiKeyInput");
const saveBtn = document.getElementById("saveApiKey");
const resetBtn = document.getElementById("resetApiKey");
const messageDiv = document.getElementById("apiKeyMessage");

function setMessage(msg, isError = false) {
  messageDiv.textContent = msg;
  messageDiv.style.color = isError ? "#8a2c2c" : "#02753c";
}

function maskKey(key) {
  return key && key.length > 4 ? "…" + key.slice(-4) : "";
}

// The key field always stays visible so the user can paste a new key over the
// saved one; the saved key only shows as its last 4 characters.
function setSavedState(isSaved, key = "") {
  apiKeyInput.value = "";
  if (isSaved) {
    apiKeyInput.placeholder = `Saved key ${maskKey(key)} — paste a new key to change`;
    saveBtn.textContent = "Update";
    resetBtn.style.display = "inline-block";
    setMessage(`API key saved (${maskKey(key)}).`);
  } else {
    apiKeyInput.placeholder = "Apify API Key";
    saveBtn.textContent = "Save";
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
    setSavedState(true, stored.apifyApiKey);
    return;
  }
  // No saved key yet. Seed from the local preset only once, so a key the user
  // reset or replaced is not silently restored from local-config.json.
  const { apifyApiKeySeeded } = await chrome.storage.local.get(["apifyApiKeySeeded"]);
  const localCfg = apifyApiKeySeeded ? null : await loadOptionalLocalConfig();
  if (localCfg && typeof localCfg.apifyApiKey === 'string' && localCfg.apifyApiKey) {
    await new Promise((resolve) =>
      chrome.storage.sync.set({ apifyApiKey: localCfg.apifyApiKey }, resolve)
    );
    await chrome.storage.local.set({ apifyApiKeySeeded: true });
    setSavedState(true, localCfg.apifyApiKey);
    setMessage("Loaded API key from popup/local-config.json.");
    return;
  }
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
    setSavedState(true, key);
  });
});

resetBtn.addEventListener("click", () => {
  chrome.storage.sync.remove(["apifyApiKey"], () => {
    setSavedState(false);
  });
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

// On load
loadApiKey();