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
          this.dragTool.textContent = 'Disable Drag Mode';
        }
      });
    });
  }
  
  setupDragTool() {
    this.dragTool.addEventListener('click', () => {
      this.dragTool.classList.toggle('active');
      const isActive = this.dragTool.classList.contains('active');
      
      this.dragTool.textContent = isActive ? 'Disable Drag Mode' : 'Enable Drag Mode';
      
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
        chrome.tabs.sendMessage(tabs[0].id, { action: 'undo' });
      });
    });
    
    this.redoBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'redo' });
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
    if (!details) return;
    
    console.log('Updating UI with details:', details);
    this.universalEditor.classList.add('visible');
    this.elementTag.textContent = details.tagName.toLowerCase();
    this.elementClasses.textContent = details.classes.join(' ') || 'None';
    
    // Create a container for the preview with original styles
    const previewContainer = document.createElement('div');
    previewContainer.className = 'element-preview-container';
    
    // Apply the original element's styles to maintain appearance
    Object.entries(details.styles).forEach(([property, value]) => {
      previewContainer.style[property] = value;
    });
    
    // Set the actual content
    previewContainer.innerHTML = details.html;
    
    // Clear and update the preview
    this.elementPreview.innerHTML = '';
    this.elementPreview.appendChild(previewContainer);
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