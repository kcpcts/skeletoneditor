class WebsiteEditor {
  constructor() {
    this.isDragModeEnabled = false;
    this.draggedElement = null;
    this.selectedElement = null;
    this.originalStyles = new Map();
    this.history = [];
    this.historyIndex = -1;
    
    this.initialize();
  }

  initialize() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'toggleDragMode':
          this.toggleDragMode(request.enabled);
          break;
        case 'getSelectedElementDetails':
          sendResponse(this.getSelectedElementDetails());
          break;
        case 'getDragModeState':
          sendResponse({ enabled: this.isDragModeEnabled });
          break;
        case 'undo':
          this.undo();
          break;
        case 'redo':
          this.redo();
          break;
        case 'updateStyle':
          this.updateSelectedElementStyle(request.property, request.value);
          break;
      }
    });
  }

  toggleDragMode(enabled) {
    this.isDragModeEnabled = enabled;
    
    if (enabled) {
      document.body.classList.add('drag-mode-enabled');
      document.body.style.cursor = 'grab';
      this.addDragListeners();
      this.preventClicks();
    } else {
      document.body.classList.remove('drag-mode-enabled');
      document.body.style.cursor = 'default';
      this.removeDragListeners();
      this.allowClicks();
    }
  }

  preventClicks() {
    document.addEventListener('click', this.handleClick, true);
  }

  allowClicks() {
    document.removeEventListener('click', this.handleClick, true);
  }

  handleClick = (e) => {
    if (this.isDragModeEnabled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  addDragListeners() {
    document.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  removeDragListeners() {
    document.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  handleMouseDown(e) {
    if (!this.isDragModeEnabled) return;
    
    if (e.altKey) {
      // Alt + Click to select element for editing
      this.selectElement(e.target);
      e.preventDefault();
      return;
    }
    
    this.draggedElement = e.target;
    
    // Store original styles
    if (!this.originalStyles.has(this.draggedElement)) {
      this.originalStyles.set(this.draggedElement, {
        position: this.draggedElement.style.position,
        zIndex: this.draggedElement.style.zIndex,
        transition: this.draggedElement.style.transition,
        left: this.draggedElement.style.left,
        top: this.draggedElement.style.top
      });
    }

    // Make element draggable
    this.draggedElement.style.position = 'relative';
    this.draggedElement.style.zIndex = '1000';
    this.draggedElement.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    
    // Get current position or default to 0
    const currentLeft = parseInt(this.draggedElement.style.left) || 0;
    const currentTop = parseInt(this.draggedElement.style.top) || 0;
    
    // Store initial mouse position and current element offset
    this.initialMouseX = e.clientX;
    this.initialMouseY = e.clientY;
    this.initialElementX = currentLeft;
    this.initialElementY = currentTop;
    
    e.preventDefault();
  }

  handleMouseMove(e) {
    if (!this.isDragModeEnabled || !this.draggedElement) return;

    // Calculate the distance moved from the initial click
    const deltaX = e.clientX - this.initialMouseX;
    const deltaY = e.clientY - this.initialMouseY;

    // Apply the movement relative to the initial position
    const newX = this.initialElementX + deltaX;
    const newY = this.initialElementY + deltaY;

    this.draggedElement.style.left = `${newX}px`;
    this.draggedElement.style.top = `${newY}px`;
  }

  handleMouseUp() {
    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      document.body.style.cursor = 'grab';
      this.draggedElement = null;
    }
  }

  // Add to history
  addToHistory(action) {
    // Remove any future history if we're not at the latest point
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(action);
    this.historyIndex++;
    this.saveState();
  }

  undo() {
    if (this.historyIndex >= 0) {
      const action = this.history[this.historyIndex];
      this.applyStyles(action.element, action.oldStyles);
      this.historyIndex--;
      this.saveState();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const action = this.history[this.historyIndex];
      this.applyStyles(action.element, action.newStyles);
      this.saveState();
    }
  }

  applyStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  saveState() {
    chrome.storage.local.set({
      history: this.history,
      historyIndex: this.historyIndex
    });
  }

  selectElement(element) {
    // Remove selection from previous element
    if (this.selectedElement) {
      this.selectedElement.classList.remove('editor-selected');
    }
    
    this.selectedElement = element;
    element.classList.add('editor-selected');
    
    // Get the details immediately
    const details = this.getSelectedElementDetails();
    
    // Notify popup that element is selected
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      details: details
    }, (response) => {
      console.log('Selection message sent:', details); // Debug log
    });
  }

  getSelectedElementDetails() {
    if (!this.selectedElement) return null;
    
    try {
      const styles = window.getComputedStyle(this.selectedElement);
      const rect = this.selectedElement.getBoundingClientRect();
      
      // Get all relevant styles
      const relevantStyles = {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
        fontFamily: styles.fontFamily,
        padding: styles.padding,
        margin: styles.margin,
        border: styles.border,
        borderRadius: styles.borderRadius,
        display: styles.display,
        textAlign: styles.textAlign,
        lineHeight: styles.lineHeight,
        fontWeight: styles.fontWeight,
        width: rect.width + 'px',
        height: rect.height + 'px'
      };
      
      return {
        tagName: this.selectedElement.tagName,
        classes: Array.from(this.selectedElement.classList),
        styles: relevantStyles,
        html: this.selectedElement.innerHTML,
        dimensions: {
          width: rect.width,
          height: rect.height
        }
      };
    } catch (error) {
      console.error('Error getting element details:', error);
      return null;
    }
  }

  updateSelectedElementStyle(property, value) {
    if (!this.selectedElement) return;
    
    // Store the old styles for history
    const oldStyles = {};
    oldStyles[property] = this.selectedElement.style[property];
    
    // Apply new style
    this.selectedElement.style[property] = value;
    
    // Add to history
    const newStyles = {};
    newStyles[property] = value;
    
    this.addToHistory({
      element: this.selectedElement,
      oldStyles: oldStyles,
      newStyles: newStyles
    });
  }
}

// Initialize the editor
const editor = new WebsiteEditor(); 