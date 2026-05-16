function getSearchResults() {
  return new Promise((resolve, reject) => {
    const input = { searchUrls: [{ url: location.href }] };
    chrome.runtime.sendMessage(
      {
        action: "runApifyActor",
        actorId: "maxcopell~zillow-scraper", 
        input: input,
      },
      (response) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(response.error || "Search failed");
        }
      }
    );
  });
}

function getDetails(data) {
  return new Promise((resolve, reject) => {
    // Use all detailUrls from data.results
    const input = { startUrls: data.results.map(result => ({ url: result.detailUrl })) };
    chrome.runtime.sendMessage(
      {
        action: "runApifyActor",
        actorId: "maxcopell~zillow-detail-scraper", 
        input: input,
      },
      (response) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(response.error || "Failed to get details");
        }
      }
    );
  });
}

function downloadCSV(data) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const date = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0');
    const time = String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0');

filename: `${date}-${time}.csv`,
    chrome.runtime.sendMessage(
      {
        action: "downloadCSV",
        data: data,
        filename: `${date}-${time}.csv`,
      },
      (response) => {
        // If you want to check for errors, you can add error handling here
        resolve();
      }
    );
  });
}

function addGetDataButton() {
  if (!location.href.includes("searchQueryState")) return;
  const actionBar = $(".search-page-action-bar").parent();

  if (actionBar.length === 0) return;
  if (actionBar.find(".get-data-btn").length > 0) return;

  const saveSearchButton = actionBar.find(".save-search-button");
  const $parent = $("<div>").css({ position: "relative" });
  const $button = saveSearchButton.clone().text("Get Data");
  $parent.append($button);
  $button
    .addClass("get-data-btn")
    .css({
      marginLeft: "1em",
      minWidth: "fit-content",
    })
    .on("click", async function (e) {
      $(".get-data-progress-popup").remove();
      $(this).prop('disabled', true);
      const stepLabels = [
        "Searching...",
        "Getting Details...",
        "Downloading file...",
      ];
      const popup = new ProgressPopup(stepLabels, $(this));
      try {
        const searchData = await getSearchResults();
        popup.completeStep(0, `Found ${searchData.results.length} results`);
        const detailsData = await getDetails(searchData);
        popup.completeStep(1, "Obtained all details");
        await downloadCSV(detailsData.results);
        popup.completeStep(2, "Downloaded");
        popup.close();
      } catch (err) {
        // Determine which step failed
        if (typeof err === "string" && err.includes("detail")) {
          popup.showError(1, err);
        } else if (typeof err === "string" && err.includes("Search")) {
          popup.showError(0, err);
        } else if (typeof err === "string" && err.includes("Download")) {
          popup.showError(2, err);
        } else {
          // Fallback: show error on the first step
          popup.showError(0, err || "Unknown error");
        }
        $(this).prop('disabled', false);
      }
    });
  actionBar.append($parent);
}

const observer = new MutationObserver(addGetDataButton);
observer.observe(document.body, { childList: true, subtree: true });

addGetDataButton();

function pick(obj, keys) {
  return Object.fromEntries(
    keys.filter((key) => key in obj).map((key) => [key, obj[key]])
  );
}
