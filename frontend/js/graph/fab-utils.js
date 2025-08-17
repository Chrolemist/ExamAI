/**
 * Global utility functions for FAB management
 * Provides easy access to the new FAB management system
 */
window.FabUtils = {
  /**
   * Arrange all nodes in a neat grid
   */
  arrangeNodesInGrid() {
    try {
      const controller = NodeBoard.getFabController();
      if (controller) {
        const positions = controller.arrangeInGrid({
          startX: 20,
          startY: 40,
          spacingX: 80,
          spacingY: 80,
          maxColumns: 4
        });
        console.log(`Arranged ${positions.length} nodes in grid layout`);
        return positions;
      } else {
        console.warn('FAB controller not available');
        return [];
      }
    } catch (error) {
      console.error('Failed to arrange nodes in grid:', error);
      return [];
    }
  },

  /**
   * Get info about all registered FABs
   */
  getFabInfo() {
    try {
      const controller = NodeBoard.getFabController();
      if (controller) {
        return controller.getState();
      }
      return null;
    } catch (error) {
      console.error('Failed to get FAB info:', error);
      return null;
    }
  },

  /**
   * Reset a specific FAB to its default position
   */
  resetFabPosition(fabElement) {
    try {
      const controller = NodeBoard.getFabController();
      if (controller) {
        return controller.resetFabPosition(fabElement);
      }
      return false;
    } catch (error) {
      console.error('Failed to reset FAB position:', error);
      return false;
    }
  },

  /**
   * Clear all saved positions (reset to defaults)
   */
  resetAllPositions() {
    try {
      const controller = NodeBoard.getFabController();
      if (controller && controller.positionManager) {
        controller.positionManager.clearAllPositions();
        
        // Reapply default positions to all registered FABs
        const fabs = controller.getAllFabs();
        fabs.forEach(fabInfo => {
          controller.positionManager.applyPosition(fabInfo.element, fabInfo.id);
        });
        
        console.log(`Reset positions for ${fabs.length} FABs`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to reset all positions:', error);
      return false;
    }
  },

  /**
   * Get the drag delay setting (time in ms after drag before click is allowed)
   */
  getDragDelay() {
    return 300; // milliseconds
  },

  /**
   * Check if a FAB was recently dragged (and should ignore clicks)
   */
  wasRecentlyDragged(fabElement) {
    if (!fabElement) return false;
    const now = Date.now();
    const lastDrag = fabElement._lastDragTime || 0;
    return (now - lastDrag) < this.getDragDelay();
  }
};

// Add keyboard shortcut for quick grid arrangement (Ctrl+G)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'g' && !e.target.closest('input,textarea,[contenteditable]')) {
    e.preventDefault();
    FabUtils.arrangeNodesInGrid();
  }
});

console.log('FAB Utils loaded. Use FabUtils.arrangeNodesInGrid() to arrange nodes, or press Ctrl+G');
