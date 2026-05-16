 async function handleApifyRequest(request, onProgress) {
  const token = await chrome.storage.sync.get(['apifyApiKey']).then(result => result.apifyApiKey);
  const { actorId, input } = request;
  
  if (!actorId || !token) {
    return { 
      success: false, 
      error: 'Actor ID and token are required' 
    };
  }

  // Start the actor run
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(input || {})
  });

  if (!runResponse.ok) {
    let errorMessage = `Failed to start actor: ${runResponse.status} ${runResponse.statusText}`;
    
    try {
      const errorData = await runResponse.json();
      if (errorData.error && errorData.error.message) {
        errorMessage += ` - ${errorData.error.message}`;
      }
    } catch (e) {
      // If we can't parse the error response, just use the status
    }
    
    if (runResponse.status === 403) {
      errorMessage += '. Check if your API token is valid and has sufficient permissions.';
    } else if (runResponse.status === 401) {
      errorMessage += '. API token is invalid or missing.';
    }
    
    throw new Error(errorMessage);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;

  // Wait for the run to complete
  const result = await waitForRunCompletion(runId, token, 300000, onProgress);
  
  return { 
    success: true, 
    data: result 
  };
}

async function waitForRunCompletion(runId, token, maxWaitTime = 300000, onProgress) { // 5 minutes max
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!statusResponse.ok) {
        // Handle 5xx errors (server errors) by retrying
        if (statusResponse.status >= 500 && statusResponse.status < 600) {
            consecutiveErrors++;
            if (consecutiveErrors > maxConsecutiveErrors) {
                throw new Error(`Failed to check run status: ${statusResponse.status} (too many retries)`);
            }
            console.warn(`Server error ${statusResponse.status}, retrying... (${consecutiveErrors}/${maxConsecutiveErrors})`);
            await new Promise(resolve => setTimeout(resolve, pollInterval * consecutiveErrors)); // Exponential backoff
            continue;
        }
        throw new Error(`Failed to check run status: ${statusResponse.status}`);
      }
      
      // Reset error counter on success
      consecutiveErrors = 0;

      const statusData = await statusResponse.json();
      const status = statusData.data.status;
      const datasetId = statusData.data.defaultDatasetId;

      // Report progress if callback provided
      if (onProgress && status === 'RUNNING' && datasetId) {
        try {
          // Fetch dataset info to get item count
          const dsResp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}`, {
             headers: { 'Authorization': `Bearer ${token}` }
          });
          if (dsResp.ok) {
            const dsData = await dsResp.json();
            if (dsData.data && typeof dsData.data.itemCount === 'number') {
              onProgress({ status, itemCount: dsData.data.itemCount });
            }
          }
        } catch (ignore) {
          // Ignore progress fetch errors to avoid breaking the main loop
        }
      }

      if (status === 'SUCCEEDED') {
        // Get the run results
        const resultResponse = await fetch(`https://api.apify.com/v2/datasets/${statusData.data.defaultDatasetId}/items`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!resultResponse.ok) {
          throw new Error(`Failed to fetch results: ${resultResponse.status}`);
        }

        const results = await resultResponse.json();
        return {
          runId,
          status: 'SUCCEEDED',
          results: results,
          stats: statusData.data.stats
        };
      }

      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return {
          runId,
          status,
          error: statusData.data.statusMessage || `Run ${status.toLowerCase()}`,
          stats: statusData.data.stats
        };
      }

      // Still running, wait and check again
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      // If it's a network error (fetch failed), also retry
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
         consecutiveErrors++;
         if (consecutiveErrors > maxConsecutiveErrors) {
             throw new Error(`Network error polling run status: ${error.message} (too many retries)`);
         }
         console.warn(`Network error, retrying... (${consecutiveErrors}/${maxConsecutiveErrors})`);
         await new Promise(resolve => setTimeout(resolve, pollInterval * consecutiveErrors));
         continue;
      }
      throw new Error(`Error polling run status: ${error.message}`);
    }
  }

  throw new Error(`Run timed out after ${maxWaitTime / 1000} seconds`);
}