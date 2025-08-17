/**
 * User Node Factory - Creates and manages user node components
 * Follows Factory Pattern and SRP
 */
class UserNodeFactory {
  static createFabElement(config = {}) {
    const fab = document.createElement('button');
    fab.className = 'fab user-node';
    fab.title = config.name || 'Du';
    fab.innerHTML = '<div class="user-avatar">👤</div>';
    
    // Add connection points
    ['t', 'b', 'l', 'r'].forEach(side => {
      const point = document.createElement('div');
      point.className = 'conn-point';
      point.setAttribute('data-side', side);
      fab.appendChild(point);
    });
    
    // Add label
    const label = document.createElement('div');
    label.className = 'fab-label';
    label.textContent = config.name || 'Du';
    fab.appendChild(label);
    
    // Position
    fab.style.position = 'absolute';
    fab.style.left = (config.x || 74) + 'px';
    fab.style.top = (config.y || 40) + 'px';
    
    return fab;
  }
  
  static createPanelElement(config = {}) {
    const panel = document.createElement('section');
    panel.className = 'panel-flyout hidden';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('data-user-panel', 'true');
    
    panel.innerHTML = this.getPanelTemplate(config);
    return panel;
  }
  
  static getPanelTemplate(config) {
    return `
      <header class="drawer-head" data-role="dragHandle">
        <div class="user-avatar-header">👤</div>
        <h3>Användare</h3>
        <button type="button" class="icon-btn" data-action="close" aria-label="Stäng panel">×</button>
      </header>
      <!-- Rest of panel content -->
    `;
  }
}
