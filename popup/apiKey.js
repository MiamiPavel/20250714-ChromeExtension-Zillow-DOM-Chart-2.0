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

function loadApiKey() {
  chrome.storage.sync.get(["apifyApiKey"], (result) => {
    if (result.apifyApiKey) {
      apiKeyInput.value = "********";
      setSavedState(true);
    } else {
      apiKeyInput.value = "";
      setSavedState(false);
    }
  });
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