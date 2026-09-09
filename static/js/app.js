/**
 * Zero7 Consultancy — Minimal Clinical CRM
 * Leads & Deals Management with Call Logs, Notes, and Meta Lead Ads integration
 */

const App = {
  state: {
    currentUser: null,
    token: localStorage.getItem('zero7_token'),
    activeTab: 'leads', // 'leads' | 'deals'
    leads: [],
    deals: [],
    users: [],
    filters: { status: '', source: '', assigned_to: '', search: '' },
    selectedLead: null,
    detailOpen: false,
  },

  async init() {
    this.setupEventListeners();

    if (this.state.token) {
      try {
        this.state.currentUser = await API.get('/api/auth/me');
        await this.loadInitialData();
        this.render();
      } catch (e) {
        console.warn('Session expired or unauthorized, rendering login');
        this.state.token = null;
        this.state.currentUser = null;
        localStorage.removeItem('zero7_token');
        this.renderLogin();
      }
    } else {
      this.renderLogin();
    }
  },

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeDetail();
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-backdrop')) {
        this.closeModal();
      }
      if (e.target.matches('.detail-overlay')) {
        this.closeDetail();
      }
    });
  },

  async loadInitialData() {
    try {
      const [leads, deals, users] = await Promise.all([
        API.get('/api/leads'),
        API.get('/api/deals'),
        API.get('/api/users')
      ]);
      this.state.leads = leads || [];
      this.state.deals = deals || [];
      this.state.users = users || [];
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  },

  render() {
    const appEl = document.getElementById('app');
    if (!this.state.currentUser) {
      this.renderLogin();
      return;
    }

    appEl.innerHTML = this.renderApp();

    if (this.state.activeTab === 'leads') {
      this.renderLeads();
    } else if (this.state.activeTab === 'deals') {
      this.renderDeals();
    }
  },

  // ---------------- AUTH & LOGIN ----------------

  renderLogin() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <div style="background: var(--color-ink); color: #fff; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">Z7</div>
            <h1 style="font-size: 20px; font-weight: 600; letter-spacing: -0.5px;">Zero7 Consultancy</h1>
          </div>
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 24px;">Internal Lead & Deal Management CRM</p>

          <form id="login-form">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="login-email" name="email" class="input" value="abhijeet@zero7.in" required autocomplete="username">
            </div>
            <div class="form-group" style="margin-top: 14px;">
              <label>Password</label>
              <input type="password" id="login-password" name="password" class="input" value="admin123" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 20px; justify-content: center;">Sign In to Zero7 CRM</button>
          </form>

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--color-hairline); font-size: 12px; color: var(--color-mid-gray); line-height: 1.6;">
            <div style="font-weight: 600; margin-bottom: 4px; color: var(--color-ink);">Quick Switch:</div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="App.fillLogin('abhijeet@zero7.in', 'admin123')">Abhijit (Admin)</button>
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="App.fillLogin('shailesh@zero7.in', 'member123')">Shailesh (Rep)</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const data = await API.post('/api/auth/login', { email, password });
        if (!data || !data.token) {
          throw new Error('Invalid login response');
        }
        this.state.token = data.token;
        this.state.currentUser = data.user;
        localStorage.setItem('zero7_token', data.token);
        API.showToast('Signed in successfully', 'success');
        await this.loadInitialData();
        this.render();
      } catch (err) {
        console.error('Login error:', err);
      }
    });
  },

  fillLogin(email, password) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl) emailEl.value = email;
    if (passEl) passEl.value = password;
  },

  logout() {
    this.state.token = null;
    this.state.currentUser = null;
    this.state.selectedLead = null;
    this.state.detailOpen = false;
    localStorage.removeItem('zero7_token');
    API.showToast('Logged out', 'info');
    this.renderLogin();
  },

  // ---------------- LAYOUT & NAVIGATION ----------------

  renderApp() {
    return `
      <div class="app-layout">
        ${this.renderNav()}
        <div class="page-content" id="page-content"></div>
        <div id="detail-overlay" class="detail-overlay"></div>
        <div id="detail-panel" class="detail-panel"></div>
        <div id="modal-container"></div>
      </div>
    `;
  },

  renderNav() {
    const u = this.state.currentUser || { name: 'User', role: 'member' };
    const initials = (u.name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const isAdmin = u.role === 'admin';

    return `
      <nav class="top-nav">
        <div class="nav-left">
          <div class="brand" style="display: flex; align-items: center; gap: 8px;">
            <span style="background: var(--color-ink); color: #fff; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 13px;">Z7</span>
            <span>Zero7 CRM</span>
          </div>
          <div class="nav-tabs">
            <button class="nav-tab ${this.state.activeTab === 'leads' ? 'active' : ''}" onclick="App.setTab('leads')">
              ${Icons.target(15)} Leads <span style="font-size: 11px; opacity: 0.8; margin-left: 4px;">(${this.state.leads.length})</span>
            </button>
            <button class="nav-tab ${this.state.activeTab === 'deals' ? 'active' : ''}" onclick="App.setTab('deals')">
              ${Icons.briefcase(15)} Deals <span style="font-size: 11px; opacity: 0.8; margin-left: 4px;">(${this.state.deals.length})</span>
            </button>
          </div>
        </div>
        <div class="nav-right">
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
            <div style="text-align: right;">
              <div style="font-weight: 500; color: var(--color-ink);">${u.name}</div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase; letter-spacing: 0.5px;">${isAdmin ? 'Administrator' : 'Consultant'}</div>
            </div>
            <div class="user-avatar" title="${u.name}">${initials}</div>
          </div>
          <button class="btn btn-icon" onclick="App.logout()" title="Logout" style="margin-left: 4px;">${Icons.logOut(16)}</button>
        </div>
      </nav>
    `;
  },

  setTab(tab) {
    this.state.activeTab = tab;
    this.closeDetail();
    this.render();
  },

  // ---------------- LEADS MANAGEMENT ----------------

  renderLeads() {
    const container = document.getElementById('page-content');
    if (!container) return;

    let filtered = [...this.state.leads];

    if (this.state.filters.status) {
      filtered = filtered.filter(l => (l.status || '').toLowerCase() === this.state.filters.status.toLowerCase());
    }
    if (this.state.filters.source) {
      filtered = filtered.filter(l => (l.source || '').toLowerCase() === this.state.filters.source.toLowerCase());
    }
    if (this.state.filters.assigned_to) {
      filtered = filtered.filter(l => l.assigned_to === this.state.filters.assigned_to);
    }
    if (this.state.filters.search) {
      const q = this.state.filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.business_name && l.business_name.toLowerCase().includes(q)) ||
        (l.phone && l.phone.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q))
      );
    }

    const isAdmin = this.state.currentUser?.role === 'admin';

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Leads Pipeline</h1>
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-top: 2px;">
            ${isAdmin ? 'Showing all incoming leads from Meta Ads, Scraping, and Manual outreach' : 'Showing leads assigned to your queue'}
          </p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="App.triggerWebhookTest()" title="Simulate incoming Meta Lead Ads lead">
            ${Icons.target(15)} Test Meta Ad Lead
          </button>
          <button class="btn btn-primary" onclick="App.openAddLeadModal()">
            ${Icons.plus(15)} Add Lead
          </button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="search-box" style="flex: 1; max-width: 320px;">
          ${Icons.search(16)}
          <input type="text" class="input" placeholder="Search by name, company, phone..." 
                 value="${this.escapeHtml(this.state.filters.search)}" 
                 oninput="App.updateFilter('search', this.value)">
        </div>

        <select class="select" style="width: 150px;" onchange="App.updateFilter('status', this.value)">
          <option value="">All Statuses</option>
          <option value="new" ${this.state.filters.status === 'new' ? 'selected' : ''}>New</option>
          <option value="contacted" ${this.state.filters.status === 'contacted' ? 'selected' : ''}>Contacted</option>
          <option value="qualified" ${this.state.filters.status === 'qualified' ? 'selected' : ''}>Qualified</option>
          <option value="proposal" ${this.state.filters.status === 'proposal' ? 'selected' : ''}>Proposal</option>
          <option value="won" ${this.state.filters.status === 'won' ? 'selected' : ''}>Won</option>
          <option value="lost" ${this.state.filters.status === 'lost' ? 'selected' : ''}>Lost</option>
        </select>

        <select class="select" style="width: 150px;" onchange="App.updateFilter('source', this.value)">
          <option value="">All Sources</option>
          <option value="meta_ads" ${this.state.filters.source === 'meta_ads' ? 'selected' : ''}>Meta Ads</option>
          <option value="scraping" ${this.state.filters.source === 'scraping' ? 'selected' : ''}>Lead Scraping</option>
          <option value="manual" ${this.state.filters.source === 'manual' ? 'selected' : ''}>Manual Entry</option>
          <option value="referral" ${this.state.filters.source === 'referral' ? 'selected' : ''}>Referral</option>
          <option value="website" ${this.state.filters.source === 'website' ? 'selected' : ''}>Website</option>
          <option value="linkedin" ${this.state.filters.source === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
        </select>

        ${isAdmin ? `
          <select class="select" style="width: 160px;" onchange="App.updateFilter('assigned_to', this.value)">
            <option value="">All Consultants</option>
            ${this.state.users.map(u => `
              <option value="${u.id}" ${this.state.filters.assigned_to === u.id ? 'selected' : ''}>${u.name}</option>
            `).join('')}
          </select>
        ` : ''}

        ${(this.state.filters.status || this.state.filters.source || this.state.filters.assigned_to || this.state.filters.search) ? `
          <button class="btn btn-secondary" onclick="App.clearFilters()" style="padding: 6px 12px; font-size: 12px;">Reset</button>
        ` : ''}
      </div>

      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Lead / Contact</th>
              <th>Company</th>
              <th>Source</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Created</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length > 0 ? filtered.map(lead => this.renderLeadRow(lead)).join('') : `
              <tr>
                <td colspan="7" style="text-align: center; padding: 48px; color: var(--color-mid-gray);">
                  <div style="font-size: 15px; font-weight: 500; color: var(--color-ink); margin-bottom: 4px;">No leads found</div>
                  <p style="font-size: 13px;">Create a new lead manually or ingest from Meta Ads webhook.</p>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  },

  updateFilter(key, value) {
    this.state.filters[key] = value;
    this.renderLeads();
  },

  clearFilters() {
    this.state.filters = { status: '', source: '', assigned_to: '', search: '' };
    this.renderLeads();
  },

  renderLeadRow(lead) {
    const assignedUser = this.state.users.find(u => u.id === lead.assigned_to);
    const initials = assignedUser ? assignedUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : null;

    return `
      <tr onclick="App.openLeadDetail('${lead.id}')" style="cursor: pointer;">
        <td>
          <div style="font-weight: 600; color: var(--color-ink);">${this.escapeHtml(lead.name || 'Unnamed Lead')}</div>
          <div style="font-size: 12px; color: var(--color-mid-gray);">${this.escapeHtml(lead.phone || lead.email || 'No contact info')}</div>
        </td>
        <td style="font-weight: 500;">${this.escapeHtml(lead.business_name || 'Individual / Personal')}</td>
        <td>${this.getSourceBadge(lead.source)}</td>
        <td>${this.getStatusBadge(lead.status)}</td>
        <td>
          ${assignedUser ? `
            <div style="display: flex; align-items: center; gap: 6px;">
              <div class="user-avatar" style="width: 22px; height: 22px; font-size: 10px;">${initials}</div>
              <span style="font-size: 13px;">${this.escapeHtml(assignedUser.name)}</span>
            </div>
          ` : '<span style="color: var(--color-mid-gray); font-size: 12px; font-style: italic;">Unassigned</span>'}
        </td>
        <td style="color: var(--color-mid-gray); font-size: 12px;">${this.formatDate(lead.created_at)}</td>
        <td style="text-align: right;" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="App.openLeadDetail('${lead.id}')">View</button>
        </td>
      </tr>
    `;
  },

  // ---------------- LEAD DETAIL SLIDE-OVER ----------------

  async openLeadDetail(id) {
    try {
      const lead = await API.get(`/api/leads/${id}`);
      this.state.selectedLead = lead;
      this.state.detailOpen = true;
      this.updateDetailPanel();
    } catch (e) {
      console.error('Failed to load lead details:', e);
    }
  },

  closeDetail() {
    this.state.detailOpen = false;
    this.updateDetailPanel();
  },

  updateDetailPanel() {
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-overlay');
    if (!panel || !overlay) return;

    if (this.state.detailOpen && this.state.selectedLead) {
      panel.innerHTML = this.renderLeadDetail();
      panel.classList.add('open');
      overlay.classList.add('open');
    } else {
      panel.classList.remove('open');
      overlay.classList.remove('open');
    }
  },

  renderLeadDetail() {
    const lead = this.state.selectedLead;
    if (!lead) return '';

    const activity = lead.activity || [];
    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
    const waPhone = cleanPhone.startsWith('+') ? cleanPhone.replace('+', '') : (cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone);

    return `
      <div class="detail-header">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <h2 style="font-size: 18px; font-weight: 600;">${this.escapeHtml(lead.name || 'Unnamed')}</h2>
            ${this.getStatusBadge(lead.status)}
          </div>
          <div style="color: var(--color-mid-gray); font-size: 13px;">${this.escapeHtml(lead.business_name || 'No business specified')}</div>
        </div>
        <button class="btn btn-icon" onclick="App.closeDetail()">${Icons.close(18)}</button>
      </div>

      <div class="detail-content">
        <!-- Fast Contact Action Strip -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          ${lead.phone ? `
            <a href="tel:${cleanPhone}" class="btn btn-secondary" style="flex: 1; text-decoration: none; justify-content: center;">
              ${Icons.phone(14)} Call Rep
            </a>
            <a href="https://wa.me/${waPhone}" target="_blank" class="btn btn-secondary" style="flex: 1; text-decoration: none; justify-content: center;">
              ${Icons.whatsapp(14)} WhatsApp
            </a>
          ` : ''}
          ${lead.email ? `
            <a href="mailto:${lead.email}" class="btn btn-secondary" style="flex: 1; text-decoration: none; justify-content: center;">
              ${Icons.mail(14)} Email
            </a>
          ` : ''}
        </div>

        <!-- Quick Status & Assignment Controls -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: var(--color-mid-gray);">Lead Status</label>
            <select class="select" style="width: 100%;" onchange="App.updateLeadStatus('${lead.id}', this.value)">
              <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
              <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="qualified" ${lead.status === 'qualified' ? 'selected' : ''}>Qualified</option>
              <option value="proposal" ${lead.status === 'proposal' ? 'selected' : ''}>Proposal</option>
              <option value="won" ${lead.status === 'won' ? 'selected' : ''}>Won</option>
              <option value="lost" ${lead.status === 'lost' ? 'selected' : ''}>Lost</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: var(--color-mid-gray);">Assigned Consultant</label>
            <select class="select" style="width: 100%;" onchange="App.updateLeadAssignment('${lead.id}', this.value)">
              <option value="">Unassigned</option>
              ${this.state.users.map(u => `
                <option value="${u.id}" ${lead.assigned_to === u.id ? 'selected' : ''}>${u.name}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Lead Attributes Card -->
        <div style="background: var(--color-surface-alt); border: 1px solid var(--color-hairline); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13px;">
            <div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase; letter-spacing: 0.5px;">Phone</div>
              <div style="font-weight: 500; margin-top: 2px;">${this.escapeHtml(lead.phone || '-')}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase; letter-spacing: 0.5px;">Email</div>
              <div style="font-weight: 500; margin-top: 2px; word-break: break-all;">${this.escapeHtml(lead.email || '-')}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase; letter-spacing: 0.5px;">Source</div>
              <div style="margin-top: 2px;">${this.getSourceBadge(lead.source)}</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase; letter-spacing: 0.5px;">Est. Deal Value</div>
              <div style="font-weight: 600; margin-top: 2px;">₹${(lead.deal_value || 0).toLocaleString()}</div>
            </div>
          </div>
          ${lead.meta_form_id ? `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--color-hairline); font-size: 12px; color: var(--color-mid-gray);">
              Meta Ad / Form ID: <code>${lead.meta_form_id}</code>
            </div>
          ` : ''}
        </div>

        <!-- Call Log & Note Actions -->
        <div class="detail-actions" style="display: flex; gap: 8px; margin-bottom: 12px;">
          <button class="btn btn-primary" style="flex: 1; justify-content: center;" onclick="App.openLogCallModal('${lead.id}')">
            ${Icons.phone(14)} Log Call
          </button>
          <button class="btn btn-secondary" style="flex: 1; justify-content: center;" onclick="App.openAddNoteModal('${lead.id}')">
            ${Icons.notepad(14)} Add Note
          </button>
        </div>

        <button class="btn btn-secondary" style="width: 100%; justify-content: center; margin-bottom: 24px;" onclick="App.convertToDeal('${lead.id}')">
          ${Icons.briefcase(14)} Promote to Deals Pipeline &rarr;
        </button>

        <!-- Activity Timeline -->
        <div class="activity-list">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h3 style="font-size: 14px; font-weight: 600;">Activity & Outreach Logs (${activity.length})</h3>
          </div>
          ${activity.length > 0 ? activity.map(act => this.renderActivity(act)).join('') : `
            <div style="padding: 24px; text-align: center; color: var(--color-mid-gray); font-size: 13px; border: 1px dashed var(--color-hairline); border-radius: var(--radius-sm);">
              No call logs or updates yet. Click "Log Call" or "Add Note" to record progress.
            </div>
          `}
        </div>
      </div>
    `;
  },

  renderActivity(act) {
    const isCall = act.type === 'call';
    const icon = isCall ? Icons.phone(13) : Icons.notepad(13);
    const author = act.user_name || 'Team member';

    return `
      <div class="activity-item">
        <div class="activity-dot" style="${isCall ? 'background: var(--color-ink);' : 'background: var(--color-mid-gray);'}"></div>
        <div class="activity-header">
          <span class="activity-type" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
            ${icon} ${isCall ? `Call: ${this.escapeHtml(act.outcome || 'Attempted')}` : 'Internal Note'}
          </span>
          <span class="activity-date">${this.formatDate(act.date)}</span>
        </div>
        <div style="font-size: 11px; color: var(--color-mid-gray); margin-bottom: 4px;">By ${this.escapeHtml(author)}${act.duration_minutes ? ` &bull; ${act.duration_minutes} mins` : ''}</div>
        ${act.notes ? `<div class="activity-body">${this.escapeHtml(act.notes)}</div>` : ''}
      </div>
    `;
  },

  async updateLeadStatus(id, status) {
    try {
      await API.put(`/api/leads/${id}`, { status });
      API.showToast('Lead status updated', 'success');
      await this.loadInitialData();
      if (this.state.selectedLead && this.state.selectedLead.id === id) {
        await this.openLeadDetail(id);
      }
      this.renderLeads();
    } catch (e) {
      console.error(e);
    }
  },

  async updateLeadAssignment(id, userId) {
    try {
      await API.put(`/api/leads/${id}`, { assigned_to: userId || null });
      API.showToast('Lead assignment updated', 'success');
      await this.loadInitialData();
      if (this.state.selectedLead && this.state.selectedLead.id === id) {
        await this.openLeadDetail(id);
      }
      this.renderLeads();
    } catch (e) {
      console.error(e);
    }
  },

  async convertToDeal(leadId) {
    if (!confirm('Promote this lead to an active deal in the pipeline?')) return;
    try {
      await API.post(`/api/leads/${leadId}/convert`, {});
      API.showToast('Lead promoted to Deal!', 'success');
      this.closeDetail();
      await this.loadInitialData();
      this.setTab('deals');
    } catch (e) {
      console.error(e);
    }
  },

  // ---------------- MODALS & CREATION ----------------

  openAddLeadModal() {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Add New Lead</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form id="add-lead-form" onsubmit="App.handleAddLead(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Contact Person Name *</label>
            <input type="text" name="name" class="input" placeholder="e.g. Vikram Malhotra" required>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Business / Brand Name</label>
            <input type="text" name="business_name" class="input" placeholder="e.g. Malhotra Technologies">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="form-group">
              <label>Phone Number</label>
              <input type="tel" name="phone" class="input" placeholder="+91 98765 43210">
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" class="input" placeholder="vikram@example.com">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="form-group">
              <label>Acquisition Source</label>
              <select name="source" class="select" style="width: 100%;">
                <option value="meta_ads">Meta Ads</option>
                <option value="scraping">Lead Scraping</option>
                <option value="manual" selected>Manual Outreach</option>
                <option value="referral">Referral</option>
                <option value="website">Website Form</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div class="form-group">
              <label>Est. Deal Value (₹)</label>
              <input type="number" name="deal_value" class="input" placeholder="50000" min="0">
            </div>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Assign To</label>
            <select name="assigned_to" class="select" style="width: 100%;">
              <option value="">Unassigned (Queue)</option>
              ${this.state.users.map(u => `
                <option value="${u.id}">${u.name} (${u.role})</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Lead</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  async handleAddLead(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    if (data.deal_value) data.deal_value = parseFloat(data.deal_value);
    if (!data.assigned_to) delete data.assigned_to;

    try {
      await API.post('/api/leads', data);
      API.showToast('Lead created successfully', 'success');
      this.closeModal();
      await this.loadInitialData();
      this.renderLeads();
    } catch (err) {
      console.error(err);
    }
  },

  openLogCallModal(leadId) {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Log Call Record</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleLogCall(event, '${leadId}')">
        <div class="modal-body">
          <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500;">Call Outcome *</label>
          <div class="outcome-pills" id="outcome-selector" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
            <button type="button" class="outcome-pill selected" onclick="App.selectOutcome(this, 'Connected')">Connected</button>
            <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'No Answer')">No Answer</button>
            <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'Voicemail')">Voicemail</button>
            <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'Busy')">Busy</button>
            <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'Meeting Booked')">Meeting Booked</button>
          </div>
          <input type="hidden" name="outcome" id="selected-outcome" value="Connected">

          <div class="form-group">
            <label>Call Duration (minutes)</label>
            <input type="number" name="duration_minutes" class="input" value="5" min="1" max="180">
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <label>Discussion Takeaways / Notes *</label>
            <textarea name="notes" class="input" rows="3" required placeholder="What was discussed with the client?"></textarea>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Call Log</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  selectOutcome(btn, outcome) {
    document.querySelectorAll('.outcome-pill').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    const input = document.getElementById('selected-outcome');
    if (input) input.value = outcome;
  },

  async handleLogCall(e, leadId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const outcome = fd.get('outcome') || 'Connected';
    const notes = fd.get('notes');
    const duration = parseInt(fd.get('duration_minutes')) || 5;

    try {
      await API.post(`/api/leads/${leadId}/calls`, {
        outcome,
        notes,
        duration_minutes: duration
      });
      API.showToast('Call logged successfully', 'success');
      this.closeModal();
      await this.openLeadDetail(leadId);
      await this.loadInitialData();
    } catch (err) {
      console.error(err);
    }
  },

  openAddNoteModal(leadId) {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Add Note</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleAddNote(event, '${leadId}')">
        <div class="modal-body">
          <div class="form-group">
            <label>Note Content *</label>
            <textarea name="content" class="input" rows="4" required placeholder="Record follow-up details, client preferences, or internal notes..."></textarea>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Note</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  async handleAddNote(e, leadId) {
    e.preventDefault();
    const content = new FormData(e.target).get('content');

    try {
      await API.post(`/api/leads/${leadId}/notes`, { content });
      API.showToast('Note added', 'success');
      this.closeModal();
      await this.openLeadDetail(leadId);
      await this.loadInitialData();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- DEALS KANBAN PIPELINE ----------------

  renderDeals() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const stages = [
      { key: 'discovery', label: 'Discovery' },
      { key: 'proposal', label: 'Proposal' },
      { key: 'negotiation', label: 'Negotiation' },
      { key: 'won', label: 'Closed Won' },
      { key: 'lost', label: 'Closed Lost' }
    ];

    const totalPipeline = this.state.deals.reduce((sum, d) => sum + (d.value || 0), 0);

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Deals Pipeline</h1>
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-top: 2px;">
            Total Pipeline: <strong style="color: var(--color-ink);">₹${totalPipeline.toLocaleString()}</strong> across ${this.state.deals.length} deals
          </p>
        </div>
        <button class="btn btn-primary" onclick="App.openAddDealModal()">
          ${Icons.plus(15)} New Deal
        </button>
      </div>

      <div class="kanban-board">
        ${stages.map(st => {
          const stageDeals = this.state.deals.filter(d => (d.stage || '').toLowerCase() === st.key);
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);

          return `
            <div class="kanban-column" ondragover="event.preventDefault()" ondrop="App.handleDrop(event, '${st.key}')">
              <div class="kanban-header">
                <div>
                  <span style="font-weight: 600; color: var(--color-ink);">${st.label}</span>
                  <span style="color: var(--color-mid-gray); font-size: 12px; margin-left: 6px;">(${stageDeals.length})</span>
                </div>
                <span style="font-size: 12px; font-weight: 500; color: var(--color-mid-gray);">₹${stageValue.toLocaleString()}</span>
              </div>
              <div class="kanban-cards">
                ${stageDeals.length > 0 ? stageDeals.map(deal => this.renderDealCard(deal)).join('') : `
                  <div style="padding: 24px; text-align: center; color: var(--color-mid-gray); font-size: 12px; border: 1px dashed var(--color-hairline); border-radius: var(--radius-sm);">
                    Empty stage
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderDealCard(deal) {
    const lead = this.state.leads.find(l => l.id === deal.lead_id);
    const assigned = this.state.users.find(u => u.id === deal.assigned_to);
    const initials = assigned ? assigned.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : null;

    return `
      <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('dealId', '${deal.id}')">
        <div class="kanban-card-title">${this.escapeHtml(deal.title)}</div>
        <div style="font-size: 12px; color: var(--color-mid-gray); margin-bottom: 8px;">
          ${lead ? this.escapeHtml(lead.business_name || lead.name) : 'Zero7 Client'}
        </div>
        <div class="kanban-card-meta" style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 13px; color: var(--color-ink);">₹${(deal.value || 0).toLocaleString()}</span>
          ${assigned ? `
            <div class="user-avatar" style="width: 22px; height: 22px; font-size: 10px;" title="${assigned.name}">${initials}</div>
          ` : '<span style="font-size: 11px; color: var(--color-mid-gray);">Unassigned</span>'}
        </div>
      </div>
    `;
  },

  async handleDrop(e, newStage) {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (dealId) {
      await this.updateDealStage(dealId, newStage);
    }
  },

  async updateDealStage(id, stage) {
    try {
      await API.put(`/api/deals/${id}`, { stage });
      API.showToast('Deal stage updated', 'success');
      await this.loadInitialData();
      this.renderDeals();
    } catch (err) {
      console.error(err);
    }
  },

  openAddDealModal() {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Create New Deal</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleAddDeal(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Deal Title *</label>
            <input type="text" name="title" class="input" placeholder="e.g. Enterprise Branding Retainer" required>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="form-group">
              <label>Deal Value (₹) *</label>
              <input type="number" name="value" class="input" placeholder="100000" min="0" required>
            </div>
            <div class="form-group">
              <label>Initial Stage</label>
              <select name="stage" class="select" style="width: 100%;">
                <option value="discovery">Discovery</option>
                <option value="proposal" selected>Proposal</option>
                <option value="negotiation">Negotiation</option>
                <option value="won">Closed Won</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Associate with Lead</label>
            <select name="lead_id" class="select" style="width: 100%;">
              <option value="">None / Standalone</option>
              ${this.state.leads.map(l => `
                <option value="${l.id}">${l.name} (${l.business_name || 'No business'})</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Assign To</label>
            <select name="assigned_to" class="select" style="width: 100%;">
              <option value="">Assign to Me</option>
              ${this.state.users.map(u => `
                <option value="${u.id}">${u.name}</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Deal</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  async handleAddDeal(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    if (data.value) data.value = parseFloat(data.value);
    if (!data.lead_id) delete data.lead_id;
    if (!data.assigned_to) delete data.assigned_to;

    try {
      await API.post('/api/deals', data);
      API.showToast('Deal created', 'success');
      this.closeModal();
      await this.loadInitialData();
      this.renderDeals();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- SIMULATION & WEBHOOK TEST ----------------

  async triggerWebhookTest() {
    try {
      const sampleLead = {
        name: `Meta Lead ${Math.floor(1000 + Math.random() * 9000)}`,
        business_name: 'Inbound Brand Lead',
        phone: '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
        email: `lead${Date.now()}@meta-inbound.com`,
        ad_name: 'Zero7 Growth Advisory Ad'
      };

      const res = await API.post('/api/webhooks/meta-leads', sampleLead);
      API.showToast('Meta Lead simulated & ingested live!', 'success');
      await this.loadInitialData();
      this.renderLeads();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- HELPERS & MODALS ----------------

  openModal(html) {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">${html}</div>
      </div>
    `;
    setTimeout(() => {
      const backdrop = container.querySelector('.modal-backdrop');
      if (backdrop) backdrop.classList.add('open');
    }, 10);
  },

  closeModal() {
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => {
        const container = document.getElementById('modal-container');
        if (container) container.innerHTML = '';
      }, 200);
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 172800) return 'Yesterday';
      return date.toLocaleDateString();
    } catch (e) {
      return dateStr;
    }
  },

  getStatusBadge(status) {
    const st = (status || 'new').toLowerCase();
    const map = {
      'new': { cls: 'badge-new', label: 'New' },
      'contacted': { cls: 'badge-contacted', label: 'Contacted' },
      'qualified': { cls: 'badge-qualified', label: 'Qualified' },
      'proposal': { cls: 'badge-proposal', label: 'Proposal' },
      'won': { cls: 'badge-won', label: 'Won' },
      'lost': { cls: 'badge-lost', label: 'Lost' }
    };
    const item = map[st] || { cls: 'badge-default', label: status };
    return `<span class="badge ${item.cls}">${item.label}</span>`;
  },

  getSourceBadge(source) {
    const src = (source || 'manual').toLowerCase();
    const labels = {
      'meta_ads': 'Meta Ads',
      'scraping': 'Scraping',
      'manual': 'Manual',
      'referral': 'Referral',
      'website': 'Website',
      'linkedin': 'LinkedIn'
    };
    return `<span style="display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 12px; background: var(--color-surface-alt); border: 1px solid var(--color-hairline);">${labels[src] || source}</span>`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
