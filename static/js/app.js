/**
 * Zero7 Consultancy — Minimal Clinical CRM
 * Complete SPA with Collapsible Sidebar, Full Record Pages, and Integrations Hub
 */

const App = {
  state: {
    currentUser: null,
    token: localStorage.getItem('zero7_token'),
    currentView: 'leads', // 'leads' | 'lead_detail' | 'deals' | 'deal_detail' | 'integrations'
    sidebarExpanded: localStorage.getItem('zero7_sidebar_expanded') === 'true',
    leads: [],
    deals: [],
    users: [],
    integrationsStatus: null,
    filters: { status: '', source: '', assigned_to: '', temperature: '', call_stage: '', search: '' },
    selectedLeadId: null,
    selectedDealId: null,
    selectedLead: null,
    selectedDeal: null,
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
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-backdrop')) {
        this.closeModal();
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

  toggleSidebar() {
    this.state.sidebarExpanded = !this.state.sidebarExpanded;
    localStorage.setItem('zero7_sidebar_expanded', this.state.sidebarExpanded);
    this.render();
  },

  setView(view, id = null) {
    this.state.currentView = view;
    if (view === 'lead_detail' && id) {
      this.state.selectedLeadId = id;
    } else if (view === 'deal_detail' && id) {
      this.state.selectedDealId = id;
    }
    this.render();
  },

  async viewLead(id) {
    this.state.selectedLeadId = id;
    this.state.currentView = 'lead_detail';
    try {
      this.state.selectedLead = await API.get(`/api/leads/${id}`);
    } catch (e) {
      console.error(e);
    }
    this.render();
  },

  async viewDeal(id) {
    this.state.selectedDealId = id;
    this.state.currentView = 'deal_detail';
    try {
      const deals = await API.get('/api/deals');
      this.state.selectedDeal = deals.find(d => d.id === id) || null;
    } catch (e) {
      console.error(e);
    }
    this.render();
  },

  render() {
    const appEl = document.getElementById('app');
    if (!this.state.currentUser) {
      this.renderLogin();
      return;
    }

    appEl.innerHTML = this.renderAppLayout();

    if (this.state.currentView === 'leads') {
      this.renderLeadsView();
    } else if (this.state.currentView === 'lead_detail') {
      this.renderLeadDetailPage();
    } else if (this.state.currentView === 'deals') {
      this.renderDealsView();
    } else if (this.state.currentView === 'deal_detail') {
      this.renderDealDetailPage();
    } else if (this.state.currentView === 'integrations') {
      this.renderIntegrationsPage();
    } else if (this.state.currentView === 'team') {
      this.renderTeamPage();
    }
  },

  // ---------------- AUTH & LOGIN ----------------

  renderLogin() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <div style="background: var(--color-ink); color: #fff; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;">Z7</div>
            <h1 style="font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">Zero7 Consultancy</h1>
          </div>
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 24px;">Internal Lead & Deal Management Operating System</p>

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
            <div style="font-weight: 600; margin-bottom: 6px; color: var(--color-ink);">Quick Switch Accounts:</div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" style="font-size: 11.5px; padding: 4px 10px;" onclick="App.fillLogin('abhijeet@zero7.in', 'admin123')">Abhijit (Admin)</button>
              <button type="button" class="btn btn-secondary" style="font-size: 11.5px; padding: 4px 10px;" onclick="App.fillLogin('shailesh@zero7.in', 'member123')">Shailesh (Rep)</button>
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
        if (!data || !data.token) throw new Error('Invalid login response');
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
    const eEl = document.getElementById('login-email');
    const pEl = document.getElementById('login-password');
    if (eEl) eEl.value = email;
    if (pEl) pEl.value = password;
  },

  logout() {
    this.state.token = null;
    this.state.currentUser = null;
    this.state.selectedLead = null;
    this.state.selectedDeal = null;
    localStorage.removeItem('zero7_token');
    API.showToast('Logged out', 'info');
    this.renderLogin();
  },

  // ---------------- SHELL & COLLAPSIBLE SIDEBAR ----------------

  renderAppLayout() {
    const isExpanded = this.state.sidebarExpanded;
    const view = this.state.currentView;
    const u = this.state.currentUser || { name: 'User', role: 'member' };
    const initials = (u.name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    return `
      <div class="app-shell">
        <!-- Left Sidebar (Collapsible Rail) -->
        <aside class="sidebar-rail ${isExpanded ? 'expanded' : 'collapsed'}">
          <div>
            <div class="sidebar-header">
              <button class="sidebar-toggle-btn" onclick="App.toggleSidebar()" title="Toggle Navigation Menu">
                ${Icons.menu(18)}
              </button>
              ${isExpanded ? `
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink); display: flex; align-items: center; gap: 8px;">
                  <span style="background: var(--color-ink); color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 12px;">Z7</span>
                  <span>Zero7 CRM</span>
                </div>
              ` : ''}
            </div>

            <nav class="sidebar-nav">
              <button class="sidebar-nav-item ${view === 'leads' || view === 'lead_detail' ? 'active' : ''}" 
                      onclick="App.setView('leads')" title="Leads Pipeline">
                ${Icons.target(18)}
                ${isExpanded ? `<span>Leads (${this.state.leads.length})</span>` : ''}
              </button>

              <button class="sidebar-nav-item ${view === 'deals' || view === 'deal_detail' ? 'active' : ''}" 
                      onclick="App.setView('deals')" title="Deals Pipeline">
                ${Icons.briefcase(18)}
                ${isExpanded ? `<span>Deals (${this.state.deals.length})</span>` : ''}
              </button>

              <button class="sidebar-nav-item ${view === 'integrations' ? 'active' : ''}" 
                      onclick="App.setView('integrations')" title="Integrations & Webhooks">
                ${Icons.plug(18)}
                ${isExpanded ? `<span>Integrations</span>` : ''}
              </button>

              <button class="sidebar-nav-item ${view === 'team' ? 'active' : ''}" 
                      onclick="App.setView('team')" title="Team & Executioners (RBAC)">
                ${Icons.users(18)}
                ${isExpanded ? `<span>Team (${this.state.users.length})</span>` : ''}
              </button>
            </nav>
          </div>

          <div class="sidebar-footer">
            ${isExpanded ? `
              <div style="display: flex; align-items: center; gap: 10px; padding: 6px 8px; margin-bottom: 6px;">
                <div class="user-avatar" style="width: 28px; height: 28px; font-size: 11px;">${initials}</div>
                <div style="flex: 1; overflow: hidden;">
                  <div style="font-size: 13px; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${u.name}</div>
                  <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: uppercase;">${u.role}</div>
                </div>
              </div>
            ` : `
              <div style="display: flex; justify-content: center; margin-bottom: 6px;">
                <div class="user-avatar" style="width: 28px; height: 28px; font-size: 11px;" title="${u.name} (${u.role})">${initials}</div>
              </div>
            `}
            <button class="sidebar-nav-item" onclick="App.logout()" title="Logout" style="color: var(--color-error);">
              ${Icons.logOut(18)}
              ${isExpanded ? `<span>Log Out</span>` : ''}
            </button>
          </div>
        </aside>

        <!-- Main Workspace Area -->
        <main class="main-viewport">
          <header class="top-nav">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-weight: 600; font-size: 15px;">
                ${view === 'leads' ? 'Leads Management' :
                  view === 'lead_detail' ? 'Lead Profile & Activity' :
                  view === 'deals' ? 'Deals Pipeline' :
                  view === 'deal_detail' ? 'Deal Overview' :
                  view === 'team' ? 'Team & Executioners (RBAC)' : 'Integrations & Webhooks'}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              ${view === 'leads' ? `
                <button class="btn btn-secondary btn-sm" onclick="App.triggerWebhookTest()" title="Simulate incoming Meta Lead Ads lead">
                  ${Icons.target(14)} Test Meta Ad
                </button>
                <button class="btn btn-primary btn-sm" onclick="App.openAddLeadModal()">
                  ${Icons.plus(14)} Add Lead
                </button>
              ` : view === 'deals' ? `
                <button class="btn btn-primary btn-sm" onclick="App.openAddDealModal()">
                  ${Icons.plus(14)} New Deal
                </button>
              ` : view === 'team' && u.role === 'admin' ? `
                <button class="btn btn-primary btn-sm" onclick="App.openAddMemberModal()">
                  ${Icons.plus(14)} Add Team Member
                </button>
              ` : ''}
            </div>
          </header>

          <div class="page-content" id="page-content"></div>
        </main>

        <div id="modal-container"></div>
      </div>
    `;
  },

  // ---------------- 1. LEADS VIEW ----------------

  renderLeadsView() {
    const container = document.getElementById('page-content');
    if (!container) return;

    let filtered = [...this.state.leads];

    if (this.state.filters.status) {
      filtered = filtered.filter(l => (l.status || '').toLowerCase() === this.state.filters.status.toLowerCase());
    }
    if (this.state.filters.source) {
      filtered = filtered.filter(l => (l.source || '').toLowerCase() === this.state.filters.source.toLowerCase());
    }
    if (this.state.filters.temperature) {
      filtered = filtered.filter(l => (l.temperature || '').toLowerCase() === this.state.filters.temperature.toLowerCase());
    }
    if (this.state.filters.call_stage) {
      filtered = filtered.filter(l => (l.call_stage || '').toLowerCase() === this.state.filters.call_stage.toLowerCase());
    }
    if (this.state.filters.assigned_to) {
      filtered = filtered.filter(l => l.assigned_to === this.state.filters.assigned_to);
    }
    if (this.state.filters.search) {
      const q = this.state.filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.business_name && l.business_name.toLowerCase().includes(q)) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.phone && l.phone.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q))
      );
    }

    const isAdmin = this.state.currentUser?.role === 'admin';

    container.innerHTML = `
      <div class="filter-bar">
        <div class="search-box" style="flex: 1; max-width: 280px;">
          ${Icons.search(16)}
          <input type="text" class="input" placeholder="Search by name, company, city..." 
                 value="${this.escapeHtml(this.state.filters.search)}" 
                 oninput="App.updateFilter('search', this.value)">
        </div>

        <select class="select" style="width: 140px;" onchange="App.updateFilter('temperature', this.value)">
          <option value="">All Temp</option>
          <option value="hot" ${this.state.filters.temperature === 'hot' ? 'selected' : ''}>🔥 Hot</option>
          <option value="warm" ${this.state.filters.temperature === 'warm' ? 'selected' : ''}>🟡 Warm</option>
          <option value="cold" ${this.state.filters.temperature === 'cold' ? 'selected' : ''}>❄️ Cold</option>
        </select>

        <select class="select" style="width: 140px;" onchange="App.updateFilter('call_stage', this.value)">
          <option value="">All Call Stages</option>
          <option value="first_call" ${this.state.filters.call_stage === 'first_call' ? 'selected' : ''}>First Call</option>
          <option value="follow_up" ${this.state.filters.call_stage === 'follow_up' ? 'selected' : ''}>Follow-up</option>
          <option value="dnp" ${this.state.filters.call_stage === 'dnp' ? 'selected' : ''}>DNP (No Answer)</option>
          <option value="connected" ${this.state.filters.call_stage === 'connected' ? 'selected' : ''}>Connected</option>
          <option value="interested" ${this.state.filters.call_stage === 'interested' ? 'selected' : ''}>Interested</option>
          <option value="not_interested" ${this.state.filters.call_stage === 'not_interested' ? 'selected' : ''}>Not Interested</option>
        </select>

        <select class="select" style="width: 140px;" onchange="App.updateFilter('status', this.value)">
          <option value="">All Statuses</option>
          <option value="new" ${this.state.filters.status === 'new' ? 'selected' : ''}>New</option>
          <option value="contacted" ${this.state.filters.status === 'contacted' ? 'selected' : ''}>Contacted</option>
          <option value="qualified" ${this.state.filters.status === 'qualified' ? 'selected' : ''}>Qualified</option>
          <option value="proposal" ${this.state.filters.status === 'proposal' ? 'selected' : ''}>Proposal</option>
          <option value="won" ${this.state.filters.status === 'won' ? 'selected' : ''}>Won</option>
          <option value="lost" ${this.state.filters.status === 'lost' ? 'selected' : ''}>Lost</option>
        </select>

        <select class="select" style="width: 140px;" onchange="App.updateFilter('source', this.value)">
          <option value="">All Sources</option>
          <option value="meta_ads" ${this.state.filters.source === 'meta_ads' ? 'selected' : ''}>Meta Ads</option>
          <option value="scraping" ${this.state.filters.source === 'scraping' ? 'selected' : ''}>Lead Scraping</option>
          <option value="manual" ${this.state.filters.source === 'manual' ? 'selected' : ''}>Manual Entry</option>
          <option value="referral" ${this.state.filters.source === 'referral' ? 'selected' : ''}>Referral</option>
          <option value="website" ${this.state.filters.source === 'website' ? 'selected' : ''}>Website</option>
          <option value="linkedin" ${this.state.filters.source === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
        </select>

        ${isAdmin ? `
          <select class="select" style="width: 150px;" onchange="App.updateFilter('assigned_to', this.value)">
            <option value="">All Consultants</option>
            ${this.state.users.map(u => `
              <option value="${u.id}" ${this.state.filters.assigned_to === u.id ? 'selected' : ''}>${u.name}</option>
            `).join('')}
          </select>
        ` : ''}

        ${(this.state.filters.status || this.state.filters.source || this.state.filters.temperature || this.state.filters.call_stage || this.state.filters.assigned_to || this.state.filters.search) ? `
          <button class="btn btn-secondary" onclick="App.clearFilters()" style="padding: 6px 12px; font-size: 12px;">Reset</button>
        ` : ''}
      </div>

      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Company & City</th>
              <th>Temp</th>
              <th>Call Stage</th>
              <th>Source</th>
              <th>Status</th>
              <th>Assigned Consultant</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length > 0 ? filtered.map(lead => this.renderLeadRow(lead)).join('') : `
              <tr>
                <td colspan="8" style="text-align: center; padding: 48px; color: var(--color-mid-gray);">
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
    this.renderLeadsView();
  },

  clearFilters() {
    this.state.filters = { status: '', source: '', assigned_to: '', temperature: '', call_stage: '', search: '' };
    this.renderLeadsView();
  },

  renderLeadRow(lead) {
    const assignedUser = this.state.users.find(u => u.id === lead.assigned_to);
    const initials = assignedUser ? assignedUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : null;

    return `
      <tr onclick="App.viewLead('${lead.id}')" style="cursor: pointer;">
        <td>
          <div style="font-weight: 600; color: var(--color-ink);">${this.escapeHtml(lead.name || 'Unnamed Lead')}</div>
          <div style="font-size: 12px; color: var(--color-mid-gray);">${this.escapeHtml(lead.phone || lead.email || 'No contact')}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${this.escapeHtml(lead.business_name || 'Individual / Personal')}</div>
          <div style="font-size: 11px; color: var(--color-mid-gray); display: flex; align-items: center; gap: 3px;">
            ${Icons.mapPin(11)} ${this.escapeHtml(lead.city || 'Location unassigned')}
          </div>
        </td>
        <td>${this.getTemperatureBadge(lead.temperature)}</td>
        <td>${this.getCallStageBadge(lead.call_stage)}</td>
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
        <td style="text-align: right;" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="App.viewLead('${lead.id}')">Open &rarr;</button>
        </td>
      </tr>
    `;
  },

  // ---------------- 2. FULL LEAD RECORD PAGE ----------------

  renderLeadDetailPage() {
    const container = document.getElementById('page-content');
    const lead = this.state.selectedLead;
    if (!container || !lead) return;

    const activity = lead.activity || [];
    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
    const waPhone = cleanPhone.startsWith('+') ? cleanPhone.replace('+', '') : (cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone);

    container.innerHTML = `
      <div class="record-page">
        <!-- Back and Action Topbar -->
        <div class="record-topbar">
          <div>
            <button class="btn btn-secondary btn-sm" onclick="App.setView('leads')" style="margin-bottom: 12px;">
              ${Icons.arrowLeft(14)} Back to Leads List
            </button>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <h1 style="font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">${this.escapeHtml(lead.name || 'Unnamed')}</h1>
              ${this.getTemperatureBadge(lead.temperature)}
              ${this.getCallStageBadge(lead.call_stage)}
              ${this.getStatusBadge(lead.status)}
            </div>
            <div style="color: var(--color-mid-gray); font-size: 14px; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 500; color: var(--color-ink);">${this.escapeHtml(lead.business_name || 'No business name')}</span>
              ${lead.city ? `&bull; <span>${Icons.mapPin(13)} ${this.escapeHtml(lead.city)}</span>` : ''}
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${lead.phone ? `
              <a href="tel:${cleanPhone}" class="btn btn-secondary" style="text-decoration: none;">
                ${Icons.phone(14)} Call
              </a>
              <a href="https://wa.me/${waPhone}" target="_blank" class="btn btn-secondary" style="text-decoration: none;">
                ${Icons.whatsapp(14)} WhatsApp
              </a>
            ` : ''}
            ${lead.email ? `
              <a href="mailto:${lead.email}" class="btn btn-secondary" style="text-decoration: none;">
                ${Icons.mail(14)} Email
              </a>
            ` : ''}
            <button class="btn btn-primary" onclick="App.convertToDeal('${lead.id}')">
              ${Icons.briefcase(14)} Promote to Deal &rarr;
            </button>
          </div>
        </div>

        <!-- Two Column Record Layout -->
        <div class="record-grid">
          <!-- Left Column: Comprehensive Lead Record & Edit Form -->
          <div class="record-card">
            <div class="record-section-title">
              ${Icons.edit(14)} Lead Profile & Core Attributes
            </div>

            <form id="lead-edit-form" onsubmit="App.handleSaveLeadEdits(event, '${lead.id}')">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>Contact Person Name *</label>
                  <input type="text" name="name" class="input" value="${this.escapeHtml(lead.name || '')}" required>
                </div>
                <div class="form-group">
                  <label>Business / Brand Name</label>
                  <input type="text" name="business_name" class="input" value="${this.escapeHtml(lead.business_name || '')}">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>City / Location</label>
                  <input type="text" name="city" class="input" placeholder="e.g. Bengaluru, Mumbai" value="${this.escapeHtml(lead.city || '')}">
                </div>
                <div class="form-group">
                  <label>Phone Number</label>
                  <input type="tel" name="phone" class="input" value="${this.escapeHtml(lead.phone || '')}">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>Email Address</label>
                  <input type="email" name="email" class="input" value="${this.escapeHtml(lead.email || '')}">
                </div>
                <div class="form-group">
                  <label>Est. Deal Value (₹)</label>
                  <input type="number" name="deal_value" class="input" value="${lead.deal_value || 0}">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 4px;">
                <div class="form-group">
                  <label>Lead Temperature</label>
                  <select name="temperature" class="select">
                    <option value="hot" ${lead.temperature === 'hot' ? 'selected' : ''}>🔥 Hot (High Intent)</option>
                    <option value="warm" ${lead.temperature === 'warm' ? 'selected' : ''}>🟡 Warm (Evaluating)</option>
                    <option value="cold" ${lead.temperature === 'cold' ? 'selected' : ''}>❄️ Cold (Unresponsive)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Call Disposition</label>
                  <select name="call_stage" class="select">
                    <option value="first_call" ${lead.call_stage === 'first_call' ? 'selected' : ''}>First Call</option>
                    <option value="follow_up" ${lead.call_stage === 'follow_up' ? 'selected' : ''}>Follow-up</option>
                    <option value="dnp" ${lead.call_stage === 'dnp' ? 'selected' : ''}>DNP (Did Not Pick)</option>
                    <option value="connected" ${lead.call_stage === 'connected' ? 'selected' : ''}>Connected</option>
                    <option value="interested" ${lead.call_stage === 'interested' ? 'selected' : ''}>Interested</option>
                    <option value="not_interested" ${lead.call_stage === 'not_interested' ? 'selected' : ''}>Not Interested</option>
                  </select>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>Pipeline Status</label>
                  <select name="status" class="select">
                    <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
                    <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                    <option value="qualified" ${lead.status === 'qualified' ? 'selected' : ''}>Qualified</option>
                    <option value="proposal" ${lead.status === 'proposal' ? 'selected' : ''}>Proposal</option>
                    <option value="won" ${lead.status === 'won' ? 'selected' : ''}>Won</option>
                    <option value="lost" ${lead.status === 'lost' ? 'selected' : ''}>Lost</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Assigned Consultant</label>
                  <select name="assigned_to" class="select">
                    <option value="">Unassigned (Queue)</option>
                    ${this.state.users.map(u => `
                      <option value="${u.id}" ${lead.assigned_to === u.id ? 'selected' : ''}>${u.name} (${u.role})</option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-top: 4px;">
                <label>Last Update / Operational Notes</label>
                <textarea name="last_update_notes" class="input" rows="3" placeholder="Latest conversation updates, client preferences, objections...">${this.escapeHtml(lead.last_update_notes || '')}</textarea>
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 18px;">
                <button type="submit" class="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>

          <!-- Right Column: Quick Call / Note Logging & Activity Feed -->
          <div>
            <!-- Fast Call Logger Card -->
            <div class="record-card" style="margin-bottom: 20px;">
              <div class="record-section-title">
                ${Icons.phone(14)} Log A Call
              </div>
              <form onsubmit="App.handleQuickLogCall(event, '${lead.id}')">
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;" id="quick-outcome-pills">
                  <button type="button" class="outcome-pill selected" onclick="App.selectOutcome(this, 'Connected')">Connected</button>
                  <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'DNP')">DNP (No Pick)</button>
                  <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'Follow-up')">Follow-up</button>
                  <button type="button" class="outcome-pill" onclick="App.selectOutcome(this, 'Meeting Booked')">Meeting Booked</button>
                </div>
                <input type="hidden" name="outcome" id="selected-outcome" value="Connected">

                <textarea name="notes" class="input" rows="2" placeholder="Key discussion points or next steps..." required style="margin-bottom: 10px;"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <input type="number" name="duration_minutes" class="input" value="5" min="1" max="180" style="width: 110px;" title="Duration in minutes">
                  <button type="submit" class="btn btn-primary btn-sm">Record Call</button>
                </div>
              </form>
            </div>

            <!-- Fast Note Logger Card -->
            <div class="record-card" style="margin-bottom: 20px;">
              <div class="record-section-title">
                ${Icons.notepad(14)} Add Internal Note
              </div>
              <form onsubmit="App.handleQuickAddNote(event, '${lead.id}')">
                <textarea name="content" class="input" rows="2" placeholder="Record internal client note..." required style="margin-bottom: 10px;"></textarea>
                <div style="display: flex; justify-content: flex-end;">
                  <button type="submit" class="btn btn-secondary btn-sm">Save Note</button>
                </div>
              </form>
            </div>

            <!-- Full Activity History Feed -->
            <div class="record-card">
              <div class="record-section-title">
                ${Icons.clock(14)} Activity & Call Logs (${activity.length})
              </div>
              <div class="activity-list" style="margin-top: 12px;">
                ${activity.length > 0 ? activity.map(act => this.renderActivityItem(act)).join('') : `
                  <div style="text-align: center; padding: 24px; color: var(--color-mid-gray); font-size: 13px;">
                    No outreach calls or notes logged yet.
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderActivityItem(act) {
    const isCall = act.type === 'call';
    const icon = isCall ? Icons.phone(13) : Icons.notepad(13);
    const author = act.user_name || 'Consultant';

    return `
      <div class="activity-item">
        <div class="activity-dot" style="${isCall ? 'background: var(--color-ink);' : 'background: var(--color-mid-gray);'}"></div>
        <div class="activity-header">
          <span class="activity-type" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px;">
            ${icon} ${isCall ? `Call: ${this.escapeHtml(act.outcome || 'Logged')}` : 'Internal Note'}
          </span>
          <span class="activity-date" style="font-size: 11.5px;">${this.formatDate(act.date)}</span>
        </div>
        <div style="font-size: 11px; color: var(--color-mid-gray); margin-bottom: 4px;">By ${this.escapeHtml(author)}${act.duration_minutes ? ` &bull; ${act.duration_minutes} mins` : ''}</div>
        ${act.notes ? `<div class="activity-body">${this.escapeHtml(act.notes)}</div>` : ''}
      </div>
    `;
  },

  async handleSaveLeadEdits(e, leadId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    if (data.deal_value) data.deal_value = parseFloat(data.deal_value);
    if (!data.assigned_to) data.assigned_to = null;

    try {
      await API.put(`/api/leads/${leadId}`, data);
      API.showToast('Lead details saved successfully', 'success');
      await this.loadInitialData();
      await this.viewLead(leadId);
    } catch (err) {
      console.error(err);
    }
  },

  async handleQuickLogCall(e, leadId) {
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

      // Also update lead's call_stage based on outcome
      const outcomeMap = {
        'Connected': 'connected',
        'DNP': 'dnp',
        'Follow-up': 'follow_up',
        'Meeting Booked': 'interested'
      };
      if (outcomeMap[outcome]) {
        await API.put(`/api/leads/${leadId}`, { call_stage: outcomeMap[outcome] });
      }

      API.showToast('Call logged successfully', 'success');
      await this.loadInitialData();
      await this.viewLead(leadId);
    } catch (err) {
      console.error(err);
    }
  },

  async handleQuickAddNote(e, leadId) {
    e.preventDefault();
    const content = new FormData(e.target).get('content');

    try {
      await API.post(`/api/leads/${leadId}/notes`, { content });
      API.showToast('Note added', 'success');
      await this.loadInitialData();
      await this.viewLead(leadId);
    } catch (err) {
      console.error(err);
    }
  },

  async convertToDeal(leadId) {
    if (!confirm('Promote this lead to an active deal in the pipeline?')) return;
    try {
      const deal = await API.post(`/api/leads/${leadId}/convert`, {});
      API.showToast('Lead promoted to Deal!', 'success');
      await this.loadInitialData();
      this.viewDeal(deal.id);
    } catch (e) {
      console.error(e);
    }
  },

  // ---------------- 3. DEALS KANBAN & DETAIL ----------------

  renderDealsView() {
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
          <h1 style="font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">Deals Pipeline</h1>
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-top: 2px;">
            Total Pipeline Value: <strong style="color: var(--color-ink);">₹${totalPipeline.toLocaleString()}</strong> across ${this.state.deals.length} active deals
          </p>
        </div>
      </div>

      <div class="kanban-board">
        ${stages.map(st => {
          const stageDeals = this.state.deals.filter(d => (d.stage || '').toLowerCase() === st.key);
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);

          return `
            <div class="kanban-column" ondragover="event.preventDefault()" ondrop="App.handleDrop(event, '${st.key}')">
              <div class="kanban-header">
                <div>
                  <span style="font-weight: 600; color: var(--color-ink); font-size: 13.5px;">${st.label}</span>
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
      <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('dealId', '${deal.id}')" onclick="App.viewDeal('${deal.id}')">
        <div class="kanban-card-title">${this.escapeHtml(deal.title)}</div>
        <div style="font-size: 12px; color: var(--color-mid-gray); margin-bottom: 8px;">
          ${lead ? this.escapeHtml(lead.business_name || lead.name) : 'Zero7 Client'}
          ${deal.city ? `&bull; <span>${this.escapeHtml(deal.city)}</span>` : ''}
        </div>
        <div class="kanban-card-meta">
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
      this.renderDealsView();
    } catch (err) {
      console.error(err);
    }
  },

  renderDealDetailPage() {
    const container = document.getElementById('page-content');
    const deal = this.state.selectedDeal;
    if (!container || !deal) return;

    const lead = this.state.leads.find(l => l.id === deal.lead_id);
    const stages = ['discovery', 'proposal', 'negotiation', 'won', 'lost'];

    container.innerHTML = `
      <div class="record-page">
        <div class="record-topbar">
          <div>
            <button class="btn btn-secondary btn-sm" onclick="App.setView('deals')" style="margin-bottom: 12px;">
              ${Icons.arrowLeft(14)} Back to Deals Pipeline
            </button>
            <div style="display: flex; align-items: center; gap: 12px;">
              <h1 style="font-size: 24px; font-weight: 600;">${this.escapeHtml(deal.title)}</h1>
              <span class="badge badge-default">${deal.stage.toUpperCase()}</span>
            </div>
            <div style="color: var(--color-mid-gray); font-size: 14px; margin-top: 4px;">
              Associated Client: <strong>${lead ? this.escapeHtml(lead.business_name || lead.name) : 'Zero7 Client'}</strong>
              ${deal.city ? `&bull; <span>${Icons.mapPin(12)} ${this.escapeHtml(deal.city)}</span>` : ''}
            </div>
          </div>

          <div style="display: flex; gap: 8px;">
            ${lead ? `
              <button class="btn btn-secondary" onclick="App.viewLead('${lead.id}')">
                ${Icons.user(14)} View Contact Record
              </button>
            ` : ''}
          </div>
        </div>

        <div class="record-grid">
          <div class="record-card">
            <div class="record-section-title">
              ${Icons.briefcase(14)} Deal Commercials & Details
            </div>

            <form onsubmit="App.handleSaveDealEdits(event, '${deal.id}')">
              <div class="form-group">
                <label>Deal Title *</label>
                <input type="text" name="title" class="input" value="${this.escapeHtml(deal.title)}" required>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>Deal Value (₹) *</label>
                  <input type="number" name="value" class="input" value="${deal.value || 0}" required>
                </div>
                <div class="form-group">
                  <label>Pipeline Stage</label>
                  <select name="stage" class="select">
                    ${stages.map(st => `<option value="${st}" ${deal.stage === st ? 'selected' : ''}>${st.toUpperCase()}</option>`).join('')}
                  </select>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label>City / Location</label>
                  <input type="text" name="city" class="input" value="${this.escapeHtml(deal.city || '')}">
                </div>
                <div class="form-group">
                  <label>Expected Closing Date</label>
                  <input type="date" name="expected_close" class="input" value="${deal.expected_close || ''}">
                </div>
              </div>

              <div class="form-group">
                <label>Assigned Consultant</label>
                <select name="assigned_to" class="select">
                  ${this.state.users.map(u => `<option value="${u.id}" ${deal.assigned_to === u.id ? 'selected' : ''}>${u.name} (${u.role})</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label>Deal Scope & Commercial Notes</label>
                <textarea name="notes" class="input" rows="4">${this.escapeHtml(deal.notes || '')}</textarea>
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                <button type="submit" class="btn btn-primary">Update Deal</button>
              </div>
            </form>
          </div>

          <div>
            <div class="record-card">
              <div class="record-section-title">
                ${Icons.clock(14)} Deal Overview
              </div>
              <div style="font-size: 13px; line-height: 1.7; color: var(--color-ink);">
                <div><strong>Created:</strong> ${this.formatDate(deal.created_at)}</div>
                <div><strong>Last Updated:</strong> ${this.formatDate(deal.updated_at)}</div>
                <div><strong>Lead Source:</strong> ${lead ? lead.source : 'Direct'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async handleSaveDealEdits(e, dealId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    if (data.value) data.value = parseFloat(data.value);

    try {
      await API.put(`/api/deals/${dealId}`, data);
      API.showToast('Deal updated successfully', 'success');
      await this.loadInitialData();
      await this.viewDeal(dealId);
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 4. INTEGRATIONS HUB ----------------

  async renderIntegrationsPage() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--color-mid-gray);">Loading integrations status...</div>`;

    try {
      this.state.integrationsStatus = await API.get('/api/integrations/status');
    } catch (e) {
      console.error(e);
    }

    const int = this.state.integrationsStatus || {};

    container.innerHTML = `
      <div style="max-width: 1100px; margin: 0 auto; padding: 24px 16px;">
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Integrations & Webhooks</h1>
          <p style="font-size: 13.5px; color: var(--color-mid-gray); margin-top: 4px;">
            Manage connections for Meta Lead Ads, WhatsApp click-to-chat, B2B lead scraping, and Google Drive.
          </p>
        </div>

        <div class="integrations-grid">
          <!-- Meta Ads Card -->
          <div class="integration-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="font-size: 16px; font-weight: 600;">Meta Lead Ads Webhook</h3>
                <span class="status-indicator">
                  <span class="status-dot active"></span> Active
                </span>
              </div>
              <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Direct webhook ingestion from Facebook & Instagram Instant Forms. Ingests leads straight to your CRM queue.
              </p>

              <div style="background: var(--color-surface-alt); padding: 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 12px; border: 1px solid var(--color-hairline);">
                <div style="color: var(--color-mid-gray); margin-bottom: 4px;">Callback URL:</div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <code style="word-break: break-all;">${int.meta_ads?.webhook_url || 'https://cos.zero7.space/api/webhooks/meta-leads'}</code>
                  <button class="btn btn-secondary btn-sm" onclick="App.copyText('${int.meta_ads?.webhook_url || 'https://cos.zero7.space/api/webhooks/meta-leads'}')">${Icons.copy(12)} Copy</button>
                </div>
                <div style="color: var(--color-mid-gray); margin-top: 8px; margin-bottom: 2px;">Verify Token:</div>
                <code>${int.meta_ads?.verify_token || 'zero7_meta_verify_2026'}</code>
              </div>

              <div style="font-size: 12.5px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Leads Ingested via Ads: <strong>${int.meta_ads?.leads_received || 0}</strong>
              </div>
            </div>

            <div>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick="App.triggerWebhookTest()">
                ${Icons.target(14)} Send Live Test Lead
              </button>
            </div>
          </div>

          <!-- WhatsApp Direct Connect Card -->
          <div class="integration-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="font-size: 16px; font-weight: 600;">WhatsApp Click-to-Chat</h3>
                <span class="status-indicator">
                  <span class="status-dot active"></span> Active
                </span>
              </div>
              <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Direct 1-click WhatsApp messaging. Formats phone numbers automatically for Indian numbers (+91).
              </p>

              <div style="background: var(--color-surface-alt); padding: 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 16px; border: 1px solid var(--color-hairline);">
                <div style="color: var(--color-mid-gray); margin-bottom: 4px;">Protocol:</div>
                <div><code>https://wa.me/{phone}</code></div>
                <div style="color: var(--color-mid-gray); margin-top: 8px; margin-bottom: 4px;">Default Country Prefix:</div>
                <div><strong>+91 (India)</strong></div>
              </div>
            </div>

            <div>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick="API.showToast('WhatsApp protocol is active on all lead records', 'info')">
                ${Icons.whatsapp(14)} WhatsApp Enabled
              </button>
            </div>
          </div>

          <!-- Lead Scraping Ingestion Card -->
          <div class="integration-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="font-size: 16px; font-weight: 600;">B2B Lead Scraping</h3>
                <span class="status-indicator">
                  <span class="status-dot active"></span> Ready
                </span>
              </div>
              <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Bulk ingestion pipeline for external lead scraping datasets (Google Maps, Apollo, LinkedIn, directories).
              </p>

              <div style="background: var(--color-surface-alt); padding: 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 16px; border: 1px solid var(--color-hairline);">
                <div style="color: var(--color-mid-gray); margin-bottom: 4px;">REST API Import Endpoint:</div>
                <div><code>POST /api/leads/import-csv</code></div>
                <div style="color: var(--color-mid-gray); margin-top: 8px; margin-bottom: 4px;">Supported:</div>
                <div><strong>JSON Payload &amp; CSV format</strong></div>
              </div>

              <div style="font-size: 12.5px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Scraped Leads Ingested: <strong>${int.scraping?.leads_ingested || 0}</strong>
              </div>
            </div>

            <div>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick="App.openBulkImportModal()">
                ${Icons.plus(14)} Bulk Import Scraped Leads
              </button>
            </div>
          </div>

          <!-- Google Drive Call Recordings Card -->
          <div class="integration-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="font-size: 16px; font-weight: 600;">Google Drive Call Recordings</h3>
                <span class="status-indicator">
                  <span class="status-dot staged"></span> Staged
                </span>
              </div>
              <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 16px;">
                Storage connector to archive audio call recordings directly to Google Drive folders as requested.
              </p>

              <div style="background: var(--color-surface-alt); padding: 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 16px; border: 1px solid var(--color-hairline);">
                <div style="color: var(--color-mid-gray); margin-bottom: 4px;">Integration Mode:</div>
                <div>Google Service Account OAuth2</div>
                <div style="color: var(--color-mid-gray); margin-top: 8px; margin-bottom: 4px;">Target Vault:</div>
                <div>Dedicated CRM Audio Recordings Folder</div>
              </div>
            </div>

            <div>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center;" disabled>
                Pending Service Account Setup
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  openBulkImportModal() {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Bulk Import Scraped Leads</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleBulkImport(event)">
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--color-mid-gray); margin-bottom: 12px;">
            Paste your JSON array of scraped leads. Each lead can contain <code>name</code>, <code>business_name</code>, <code>phone</code>, <code>email</code>, <code>city</code>.
          </p>
          <div class="form-group">
            <textarea id="import-leads-json" class="input" rows="8" required placeholder='[
  { "name": "Rajesh Varma", "business_name": "Varma Textiles", "phone": "+91 9823456789", "city": "Surat" },
  { "name": "Anita Desai", "business_name": "Desai Media", "phone": "+91 9912345678", "city": "Bengaluru" }
]'></textarea>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Import Leads</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  async handleBulkImport(e) {
    e.preventDefault();
    const raw = document.getElementById('import-leads-json').value.trim();
    try {
      const parsed = JSON.parse(raw);
      const leads = Array.isArray(parsed) ? parsed : [parsed];
      const res = await API.post('/api/leads/import-csv', { leads });
      API.showToast(`Imported ${res.imported} leads successfully!`, 'success');
      this.closeModal();
      await this.loadInitialData();
      this.setView('leads');
    } catch (err) {
      API.showToast('Invalid JSON format: ' + err.message, 'error');
    }
  },

  copyText(text) {
    navigator.clipboard.writeText(text);
    API.showToast('Copied to clipboard!', 'info');
  },

  // ---------------- 5. TEAM & EXECUTIONERS (RBAC) ----------------

  renderTeamPage() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const isAdmin = this.state.currentUser?.role === 'admin';
    const users = this.state.users || [];
    const totalMembers = users.length;
    const adminsCount = users.filter(u => u.role === 'admin').length;
    const closersCount = users.filter(u => u.role === 'member').length;
    const totalPipeline = this.state.deals.reduce((sum, d) => sum + (d.value || 0), 0);

    container.innerHTML = `
      <div style="max-width: 1100px; margin: 0 auto; padding: 24px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
          <div>
            <h1 style="font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Team & Executioners</h1>
            <p style="font-size: 13.5px; color: var(--color-mid-gray); margin-top: 4px;">
              Manage team members, configure Role-Based Access Control (RBAC), and monitor consultant workloads.
            </p>
          </div>
          ${isAdmin ? `
            <button class="btn btn-primary" onclick="App.openAddMemberModal()">
              ${Icons.plus(15)} Add Team Member
            </button>
          ` : ''}
        </div>

        <!-- Metric Summary Cards -->
        <div class="stat-row">
          <div class="stat-card">
            <div class="stat-label">Total Executioners</div>
            <div class="stat-value">${totalMembers}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Administrators</div>
            <div class="stat-value">${adminsCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Consultants / Closers</div>
            <div class="stat-value">${closersCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Active Team Pipeline</div>
            <div class="stat-value">₹${totalPipeline.toLocaleString()}</div>
          </div>
        </div>

        <!-- Team Table -->
        <div class="table-container" style="margin-top: 24px;">
          <table class="table">
            <thead>
              <tr>
                <th>Consultant / Person</th>
                <th>System Role & Permissions</th>
                <th>Assigned Leads</th>
                <th>Active Deals</th>
                <th>Managed Pipeline Value</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const initials = (u.name || 'User').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const isSelf = this.state.currentUser?.id === u.id;
                return `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="user-avatar">${initials}</div>
                        <div>
                          <div style="font-weight: 600; color: var(--color-ink);">${this.escapeHtml(u.name)} ${isSelf ? '<span style="font-size: 11px; color: var(--color-mid-gray); font-weight: 400;">(You)</span>' : ''}</div>
                          <div style="font-size: 12px; color: var(--color-mid-gray);">${this.escapeHtml(u.email)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      ${isAdmin && !isSelf ? `
                        <select class="select" style="width: 150px; height: 32px; font-size: 12px;" onchange="App.handleUpdateUserRole('${u.id}', this.value)">
                          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
                          <option value="member" ${u.role === 'member' ? 'selected' : ''}>Consultant / Closer</option>
                        </select>
                      ` : `
                        <span class="role-badge ${u.role}">${u.role === 'admin' ? 'Administrator' : 'Consultant / Closer'}</span>
                      `}
                    </td>
                    <td>
                      <span class="workload-metric" style="cursor: pointer;" onclick="App.filterLeadsByRep('${u.id}')" title="Click to view leads for ${this.escapeHtml(u.name)}">
                        <strong>${u.assigned_leads_count || 0}</strong> leads &rarr;
                      </span>
                    </td>
                    <td>
                      <span class="workload-metric">
                        <strong>${u.assigned_deals_count || 0}</strong> deals
                      </span>
                    </td>
                    <td>
                      <span style="font-weight: 600; color: var(--color-ink);">₹${(u.pipeline_value || 0).toLocaleString()}</span>
                    </td>
                    <td style="text-align: right;">
                      ${isAdmin && !isSelf ? `
                        <button class="btn btn-secondary btn-sm" style="color: var(--color-error);" onclick="App.handleDeleteUser('${u.id}', '${this.escapeHtml(u.name)}')">
                          ${Icons.trash(13)} Remove
                        </button>
                      ` : '<span style="color: var(--color-mid-gray); font-size: 12px;">Active</span>'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterLeadsByRep(userId) {
    this.state.filters.assigned_to = userId;
    this.setView('leads');
  },

  openAddMemberModal() {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Add Executioner / Team Member</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleAddMember(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="name" class="input" placeholder="e.g. Sameer Khan" required>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Email Address *</label>
            <input type="email" name="email" class="input" placeholder="sameer@zero7.in" required>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Temporary Password *</label>
            <input type="password" name="password" class="input" placeholder="Min 6 characters" required>
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label>Role & Access Level *</label>
            <select name="role" class="select" style="width: 100%;">
              <option value="member" selected>Consultant / Closer (Assigned queue only)</option>
              <option value="admin">Administrator (Full company access & team management)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Member</button>
        </div>
      </form>
    `;
    this.openModal(html);
  },

  async handleAddMember(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    try {
      await API.post('/api/users', data);
      API.showToast(`Added ${data.name} to the team!`, 'success');
      this.closeModal();
      await this.loadInitialData();
      this.render();
    } catch (err) {
      console.error(err);
    }
  },

  async handleUpdateUserRole(userId, newRole) {
    try {
      await API.put(`/api/users/${userId}`, { role: newRole });
      API.showToast('Role updated successfully', 'success');
      await this.loadInitialData();
      this.render();
    } catch (err) {
      console.error(err);
    }
  },

  async handleDeleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to remove ${userName}? Their assigned leads and deals will be unassigned.`)) return;
    try {
      await API.delete(`/api/users/${userId}`);
      API.showToast(`Removed ${userName}`, 'info');
      await this.loadInitialData();
      this.render();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- MODALS & HELPERS ----------------

  openAddLeadModal() {
    const html = `
      <div class="modal-header">
        <h3 style="font-size: 16px; font-weight: 600;">Add New Lead</h3>
        <button class="btn-icon" onclick="App.closeModal()">${Icons.close(18)}</button>
      </div>
      <form onsubmit="App.handleAddLead(event)">
        <div class="modal-body">
          <div class="form-group">
            <label>Contact Person Name *</label>
            <input type="text" name="name" class="input" placeholder="e.g. Vikram Malhotra" required>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="form-group">
              <label>Business / Brand Name</label>
              <input type="text" name="business_name" class="input" placeholder="e.g. Malhotra Technologies">
            </div>
            <div class="form-group">
              <label>City / Location</label>
              <input type="text" name="city" class="input" placeholder="e.g. Mumbai, Bengaluru">
            </div>
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
              <label>Temperature</label>
              <select name="temperature" class="select" style="width: 100%;">
                <option value="hot">🔥 Hot</option>
                <option value="warm" selected>🟡 Warm</option>
                <option value="cold">❄️ Cold</option>
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="form-group">
              <label>Est. Deal Value (₹)</label>
              <input type="number" name="deal_value" class="input" placeholder="50000" min="0">
            </div>
            <div class="form-group">
              <label>Assign To Consultant</label>
              <select name="assigned_to" class="select" style="width: 100%;">
                <option value="">Unassigned (Queue)</option>
                ${this.state.users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}
              </select>
            </div>
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
      const created = await API.post('/api/leads', data);
      API.showToast('Lead created successfully', 'success');
      this.closeModal();
      await this.loadInitialData();
      this.viewLead(created.id);
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
              <label>City / Location</label>
              <input type="text" name="city" class="input" placeholder="e.g. Bengaluru">
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
            <label>Assign To Consultant</label>
            <select name="assigned_to" class="select" style="width: 100%;">
              ${this.state.users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}
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

    try {
      const deal = await API.post('/api/deals', data);
      API.showToast('Deal created', 'success');
      this.closeModal();
      await this.loadInitialData();
      this.viewDeal(deal.id);
    } catch (err) {
      console.error(err);
    }
  },

  selectOutcome(btn, outcome) {
    document.querySelectorAll('#quick-outcome-pills .outcome-pill').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    const input = document.getElementById('selected-outcome');
    if (input) input.value = outcome;
  },

  async triggerWebhookTest() {
    try {
      const cities = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Pune', 'Hyderabad', 'Ahmedabad'];
      const randomCity = cities[Math.floor(Math.random() * cities.length)];
      const sampleLead = {
        name: `Meta Lead ${Math.floor(1000 + Math.random() * 9000)}`,
        business_name: 'Inbound Meta Brand',
        city: randomCity,
        temperature: 'hot',
        call_stage: 'first_call',
        phone: '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
        email: `lead${Date.now()}@meta-inbound.com`,
        ad_name: 'Zero7 Growth Advisory Ad'
      };

      await API.post('/api/webhooks/meta-leads', sampleLead);
      API.showToast('Meta Lead simulated & ingested live!', 'success');
      await this.loadInitialData();
      if (this.state.currentView === 'leads') {
        this.renderLeadsView();
      }
    } catch (err) {
      console.error(err);
    }
  },

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

  getTemperatureBadge(temp) {
    const t = (temp || 'warm').toLowerCase();
    if (t === 'hot') {
      return `<span class="temp-badge temp-hot">${Icons.flame(12)} Hot</span>`;
    } else if (t === 'cold') {
      return `<span class="temp-badge temp-cold">${Icons.snowflake(12)} Cold</span>`;
    }
    return `<span class="temp-badge temp-warm">🟡 Warm</span>`;
  },

  getCallStageBadge(stage) {
    const st = (stage || 'first_call').toLowerCase();
    const map = {
      'first_call': { cls: 'disp-first_call', label: 'First Call' },
      'follow_up': { cls: 'disp-follow_up', label: 'Follow-up' },
      'dnp': { cls: 'disp-dnp', label: 'DNP' },
      'connected': { cls: 'disp-connected', label: 'Connected' },
      'interested': { cls: 'disp-interested', label: 'Interested' },
      'not_interested': { cls: 'disp-not_interested', label: 'Not Interested' }
    };
    const item = map[st] || { cls: 'disp-first_call', label: stage };
    return `<span class="disp-badge ${item.cls}">${item.label}</span>`;
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
