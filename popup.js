class PopupUI {
  constructor() {
    this.dragTool = document.getElementById('dragTool');
    this.undoBtn = document.getElementById('undoBtn');
    this.redoBtn = document.getElementById('redoBtn');
    this.universalEditor = document.getElementById('universalEditor');
    this.elementPreview = document.getElementById('elementPreview');
    this.elementTag = document.getElementById('elementTag');
    this.elementClasses = document.getElementById('elementClasses');
    
    this.initialize();
    this.initializeTools();
  }
  
  initialize() {
    this.setupDragTool();
    this.setupHistoryControls();
    this.setupMessageListener();
    this.checkForSelectedElement();
    this.checkDragModeState();
  }
  
  checkDragModeState() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getDragModeState'
      }, (response) => {
        if (response && response.enabled) {
          this.dragTool.classList.add('active');
          this.dragTool.textContent = 'Disable Editor Mode';
        }
      });
    });
  }
  
  setupDragTool() {
    this.dragTool.addEventListener('click', () => {
      this.dragTool.classList.toggle('active');
      const isActive = this.dragTool.classList.contains('active');
      
      this.dragTool.textContent = isActive ? 'Disable Editor Mode' : 'Enable Editor Mode';
      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleDragMode',
          enabled: isActive
        });
      });
    });
  }
  
  setupHistoryControls() {
    this.undoBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'undo' }, (response) => {
          // Update preview with the new state if available
          if (response && response.styles) {
            Object.entries(response.styles).forEach(([property, value]) => {
              if (this.previewContainer) {
                if (property === 'color') {
                  this.previewContainer.style.setProperty('color', value, 'important');
                } else {
                  this.previewContainer.style[property] = value;
                }
              }
            });
          }
        });
      });
    });
    
    this.redoBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'redo' }, (response) => {
          // Update preview with the new state if available
          if (response && response.styles) {
            Object.entries(response.styles).forEach(([property, value]) => {
              if (this.previewContainer) {
                if (property === 'color') {
                  this.previewContainer.style.setProperty('color', value, 'important');
                } else {
                  this.previewContainer.style[property] = value;
                }
              }
            });
          }
        });
      });
    });
  }
  
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'elementSelected') {
        console.log('Element selected:', request.details); // Debug log
        this.updateUniversalEditor(request.details);
      }
    });
  }
  
  checkForSelectedElement() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getSelectedElementDetails'
      }, (response) => {
        if (response) {
          this.updateUniversalEditor(response);
        }
      });
    });
  }
  
  updateUniversalEditor(details) {
    if (!details) {
      // Handle deselection
      this.universalEditor.classList.remove('visible');
      this.elementPreview.innerHTML = '<div class="initial-message">Alt/Option + Click on an element to edit it</div>';
      return;
    }
    
    console.log('Updating UI with details:', details);
    this.universalEditor.classList.add('visible');
    
    // Clear the preview area
    this.elementPreview.innerHTML = '';
    
    if (details.html) {
      // Create a container for the preview with original styles
      const previewContainer = document.createElement('div');
      previewContainer.className = 'element-preview-container';
      
      // Apply the original element's styles to maintain appearance
      Object.entries(details.styles).forEach(([property, value]) => {
        // Skip dimension styles that might cause overflow
        if (!['width', 'height'].includes(property)) {
          previewContainer.style[property] = value;
        }
      });

      // Set the actual content
      previewContainer.innerHTML = details.html;
      this.elementPreview.appendChild(previewContainer);

      // Store the preview container for later updates
      this.previewContainer = previewContainer;
    } else {
      // Show the initial message if no element is selected
      const message = document.createElement('div');
      message.className = 'initial-message';
      message.textContent = 'Alt/Option + Click on an element to edit it';
      this.elementPreview.appendChild(message);
    }

    // Initialize tool values based on current styles
    this.initializeToolValues(details.styles);
  }

  initializeToolValues(styles) {
    if (!styles) return;

    // Set font family
    const fontFamily = document.getElementById('fontFamily');
    if (fontFamily && styles.fontFamily) {
      fontFamily.value = styles.fontFamily.split(',')[0].replace(/['"]/g, '') || 'inherit';
    }

    // Set font size
    const fontSize = document.getElementById('fontSize');
    if (fontSize && styles.fontSize) {
      const size = parseInt(styles.fontSize);
      fontSize.value = size || 16;
      document.getElementById('fontSizeValue').textContent = `${size}px`;
    }

    // Set font weight
    const fontWeight = document.getElementById('fontWeight');
    if (fontWeight && styles.fontWeight) {
      fontWeight.value = styles.fontWeight;
    }

    // Set colors
    const textColor = document.getElementById('textColor');
    if (textColor && styles.color) {
      textColor.value = this.rgbToHex(styles.color);
    }

    const bgColor = document.getElementById('backgroundColor');
    if (bgColor && styles.backgroundColor) {
      bgColor.value = this.rgbToHex(styles.backgroundColor);
    }

    // Helper function to convert RGB to HEX
    this.rgbToHex = (rgb) => {
      // Handle rgba strings
      const rgbValues = rgb.match(/\d+/g);
      if (!rgbValues) return '#000000';
      
      const r = parseInt(rgbValues[0]);
      const g = parseInt(rgbValues[1]);
      const b = parseInt(rgbValues[2]);
      
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    };
  }

  initializeTools() {
    // Text controls
    this.setupToolControl('fontFamily', 'change', 'fontFamily');
    this.setupToolControl('fontSize', 'input', 'fontSize', (value) => `${value}px`);
    this.setupToolControl('fontWeight', 'change', 'fontWeight');
    
    // Color controls
    this.setupToolControl('textColor', 'input', 'color');
    this.setupToolControl('backgroundColor', 'input', 'backgroundColor');
    
    // Spacing controls
    this.setupToolControl('padding', 'input', 'padding', (value) => `${value}px`);
    this.setupToolControl('margin', 'input', 'margin', (value) => `${value}px`);
    this.setupToolControl('lineHeight', 'input', 'lineHeight', (value) => value/100);
    
    // Accessibility controls
    this.setupToolControl('textAlign', 'change', 'textAlign');
    this.setupToolControl('letterSpacing', 'change', 'letterSpacing');
    this.setupToolControl('contrast', 'input', 'filter', (value) => `contrast(${value}%)`);

    // Update value displays for sliders
    ['fontSize', 'padding', 'margin', 'lineHeight', 'contrast'].forEach(id => {
      const slider = document.getElementById(id);
      const valueDisplay = document.getElementById(`${id}Value`);
      slider.addEventListener('input', () => {
        let displayValue = slider.value;
        if (id === 'lineHeight') displayValue = (displayValue/100).toFixed(2);
        valueDisplay.textContent = displayValue + (id === 'contrast' ? '%' : 'px');
      });
    });
  }

  setupToolControl(id, event, styleProperty, valueTransform = (v) => v) {
    const control = document.getElementById(id);
    control.addEventListener(event, () => {
      const value = valueTransform(control.value);
      // Update preview
      if (this.previewContainer) {
        this.previewContainer.style[styleProperty] = value;
      }
      // Update actual element
      this.updateElementStyle(styleProperty, value);
    });
  }

  updateElementStyle(property, value) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateStyle',
        property: property,
        value: value
      });
    });
  }
}

// Initialize the popup UI
const popup = new PopupUI(); 