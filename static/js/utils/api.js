const API = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('zero7_token');
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      });
      
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : null;
      
      if (!response.ok) {
        if (response.status === 401 && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/token')) {
          localStorage.removeItem('zero7_token');
          if (typeof App !== 'undefined' && App.renderLogin) {
            App.renderLogin();
          }
        }
        throw new Error(data?.detail || data?.message || response.statusText || 'API Error');
      }
      
      return data;
    } catch (error) {
      if (!endpoint.includes('/api/auth/me')) {
        this.showToast(error.message, 'error');
      }
      throw error;
    }
  },
  
  async get(endpoint) { return this.request(endpoint); },
  async post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) }); },
  async put(endpoint, data) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) }); },
  async delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },
  
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};
