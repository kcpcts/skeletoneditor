class WebsiteEditor {
  constructor() {
    this.isDragModeEnabled = false;
    this.draggedElement = null;
    this.selectedElement = null;
    this.originalStyles = new Map();
    this.history = [];
    this.historyIndex = -1;
    this.mouseRadius = 10; // Radius of influence in pixels
    this.mouseMoveThrottled = this.throttle(this.handleMouseProximity.bind(this), 16);
    
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
          sendResponse(this.undo());
          break;
        case 'redo':
          sendResponse(this.redo());
          break;
        case 'updateStyle':
          this.updateSelectedElementStyle(request.property, request.value);
          break;
      }
    });

    document.addEventListener('mousemove', this.mouseMoveThrottled);
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
      // Remove all border overlays
      document.querySelectorAll('.border-overlay').forEach(overlay => overlay.remove());
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
      const finalLeft = this.draggedElement.style.left;
      const finalTop = this.draggedElement.style.top;
      
      // Only add to history if the element actually moved
      if (finalLeft !== `${this.initialElementX}px` || finalTop !== `${this.initialElementY}px`) {
        this.addToHistory({
          element: this.draggedElement,
          oldStyles: {
            left: `${this.initialElementX}px`,
            top: `${this.initialElementY}px`
          },
          newStyles: {
            left: finalLeft,
            top: finalTop
          }
        });
      }
      
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
      
      // Return the current styles for preview update
      return {
        styles: action.oldStyles
      };
    }
    return null;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const action = this.history[this.historyIndex];
      this.applyStyles(action.element, action.newStyles);
      this.saveState();
      
      // Return the current styles for preview update
      return {
        styles: action.newStyles
      };
    }
    return null;
  }

  applyStyles(element, styles) {
    // Handle each style property appropriately
    Object.entries(styles).forEach(([property, value]) => {
      if (property === 'color') {
        element.style.setProperty('color', value, 'important');
      } else {
        element.style[property] = value;
      }
    });
  }

  saveState() {
    chrome.storage.local.set({
      history: this.history,
      historyIndex: this.historyIndex
    });
  }

  selectElement(element) {
    // If clicking the same element that's already selected, deselect it
    if (this.selectedElement === element) {
      this.selectedElement.classList.remove('editor-selected');
      this.selectedElement = null;
      
      // Notify popup that element is deselected
      chrome.runtime.sendMessage({
        action: 'elementSelected',
        details: null
      });
      return;
    }
    
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
    if (property === 'color') {
      oldStyles[property] = this.selectedElement.style.getPropertyValue('color');
    } else {
      oldStyles[property] = this.selectedElement.style[property];
    }
    
    // Apply new style
    if (property === 'color') {
      this.selectedElement.style.setProperty('color', value, 'important');
    } else {
      this.selectedElement.style[property] = value;
    }
    
    // Add to history
    const newStyles = {};
    newStyles[property] = value;
    
    this.addToHistory({
      element: this.selectedElement,
      oldStyles: oldStyles,
      newStyles: newStyles
    });
  }

  handleMouseProximity(e) {
    if (!this.isDragModeEnabled) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Get all elements that could have outlines, excluding already selected elements
    document.querySelectorAll('*:not(.editor-selected)').forEach(element => {
      const rect = element.getBoundingClientRect();
      
      // Calculate distance from mouse to nearest edge of element
      const distanceX = Math.max(rect.left - mouseX, 0, mouseX - rect.right);
      const distanceY = Math.max(rect.top - mouseY, 0, mouseY - rect.bottom);
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      // Add or remove proximity class based on distance
      if (distance <= this.mouseRadius) {
        element.classList.add('in-mouse-range');
      } else {
        element.classList.remove('in-mouse-range');
      }
    });
  }

  // Utility function to throttle mouse move events
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }
}

// Initialize the editor
const editor = new WebsiteEditor(); 