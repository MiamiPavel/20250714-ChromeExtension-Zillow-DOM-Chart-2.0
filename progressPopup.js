class ProgressPopup {
  constructor(stepLabels, $parent) {
    this.$popup = $("<div>").addClass("get-data-progress-popup").css({
      right: 0,
      border: "none",
      borderRadius: "4px",
      padding: "1em",
      color: "#222",
      zIndex: 99999,
      fontFamily: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
      minWidth: "max-content",
      pointerEvents: "auto",
      transition: "box-shadow 0.2s",
      height: "fit-content",
    });
    this.$steps = stepLabels.map((label, i) =>
      this._createStep(label, i)
    );
    this.$steps.forEach(($step) => this.$popup.append($step));
    this.$errorMsg = $("<div>")
      .addClass("progress-error")
      .css({
        color: "#e74c3c",
        fontWeight: 500,
        marginTop: "10px",
        display: "none",
        alignItems: "center",
      })
      .append(
        $("<span>").html("&#x2716;").css({
          marginRight: "8px",
          fontSize: "14px",
          verticalAlign: "middle",
        })
      )
      .append($("<span>").addClass("progress-error-text"));
    this.$popup.append(this.$errorMsg);
    this.errorOccurred = false;
    $parent.after(this.$popup);

    // Inject styles for spinner
    if (!document.getElementById('progress-popup-styles')) {
      const style = document.createElement('style');
      style.id = 'progress-popup-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .progress-spinner {
          border-top-color: #3498db !important;
          animation: spin 1s linear infinite;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Start first step as loading
    this.setLoading(0);
  }
  
  setLoading(idx) {
    if (this.$steps[idx]) {
      this.$steps[idx].find(".progress-check").addClass("progress-spinner");
    }
  }

  updateStep(idx, text) {
    if (this.$steps[idx]) {
      this.$steps[idx].find(".progress-text").text(text);
    }
  }

  _createStep(label, index) {
    return $("<div>")
      .css({
        display: index === 0 ? "flex" : "none",
        alignItems: "center",
        marginTop: index === 0 ? "0" : "1em",
      })
      .append(
        $("<span>")
          .addClass("progress-check")
          .css({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 100%)",
            color: "#7b8baf",
            fontSize: "14px",
            marginRight: "12px",
            boxShadow: "0 1px 4px rgba(44,62,80,0.07)",
            border: "1.5px solid #dbeafe",
          })
          .html("&#x25CB;")
      )
      .append(
        $("<span>")
          .addClass("progress-text")
          .css({
            fontWeight: 500,
            letterSpacing: "0.01em",
          })
          .text(label)
      );
  }
  
  completeStep(idx, doneText) {
    if (this.errorOccurred) return;
    const $step = this.$steps[idx];
    $step.find(".progress-check")
      .removeClass("progress-spinner")
      .html("&#x2714;")
      .css("color", "#27ae60");
      
    if (doneText) $step.find(".progress-text").text(doneText);
    
    if (this.$steps[idx + 1]) {
      this.$steps[idx + 1].css("display", "flex");
      this.setLoading(idx + 1);
    }
    this.$popup.css("height", "fit-content");
  }
  
  showError(idx, message) {
    this.errorOccurred = true;
    const $step = this.$steps[idx];
    $step.find(".progress-check")
      .removeClass("progress-spinner")
      .html("&#x2716;")
      .css("color", "#e74c3c");
    $step.find(".progress-text").text(message);
    this.$errorMsg.find(".progress-error-text").text(message);
    this.$errorMsg.show();
    this.$popup.css("height", "fit-content");
  }
  
  showDownloadOptions(idx, callback) {
    if (this.errorOccurred) return;
    
    const $step = this.$steps[idx];
    $step.css("display", "flex");
    $step.find(".progress-check").html("&#x2699;").css("color", "#3498db");
    
    // Create button container
    const $buttonContainer = $("<div>").css({
      display: "flex",
      gap: "10px",
      marginTop: "10px", 
    });
    
    // Download CSV button
    const $csvButton = $("<button>")
      .text("Download CSV")
      .css({
        padding: "8px 16px",
        borderRadius: "4px",
        border: "1px solid #27ae60",
        background: "#27ae60",
        color: "white",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s",
      })
      .hover(
        function() { $(this).css("background", "#229954"); },
        function() { $(this).css("background", "#27ae60"); }
      )
      .click(() => { 
        callback('csv');
      });
    
    // Load for Chart button
    const $chartButton = $("<button>")
      .text("Load CSV for Chart")
      .css({
        padding: "8px 16px",
        borderRadius: "4px",
        border: "1px solid #3498db",
        background: "#3498db",
        color: "white",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s",
      })
      .hover(
        function() { $(this).css("background", "#2980b9"); },
        function() { $(this).css("background", "#3498db"); }
      )
      .click(() => { 
        callback('chart');
      });
    
    $buttonContainer.append($csvButton, $chartButton);
    $step.after($buttonContainer);
    this.$popup.css("height", "fit-content");
  } 
}