/**
 * API Client & Network Service for COS Theta
 */

const API = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : endpoint;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      });

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}`;
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errData.message || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      API.showToast(error.message, 'alert');
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'alert') {
      toast.style.borderLeft = '3px solid #e7000b';
    }
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }
};
