/**
 * COS Theta Enterprise Business Operating System - Core Application
 * Full client-side state engine, view router, and component renderers
 */

const App = {
  state: {
    activeBusiness: 'all', // 'all' | 'filtr_coffee' | 'zero7_consultancy'
    activeRoute: 'dashboard',
    developerMode: false,
    currentUser: {
      id: 'usr_admin',
      name: 'Admin Founder',
      username: 'admin',
      role: 'founder',
      assigned_business: 'all',
      avatar_initials: 'AF'
    },
    posCart: [],
    users: [
      { id: 'usr_admin', name: 'Admin Founder', username: 'admin', role: 'founder', assigned_business: 'all', avatar_initials: 'AF' }
    ],
    stats: {
      total_revenue: 0,
      today_revenue: 0,
      total_leads: 0,
      active_pipeline_leads: 0,
      conversion_rate: 0,
      total_orders: 0,
      today_orders: 0,
      low_stock_count: 0,
      open_tasks: 0,
      active_team_count: 1,
      recent_activities: []
    },
    documents: [],
    settings: {},
    aiMessages: []
  },

  async init() {
    try {
      this.bindGlobalShortcuts();
      this.renderHeader();
      this.renderSidebar();
      this.navigateTo(this.state.activeRoute);

      // Asynchronously fetch fresh backend data
      await this.fetchInitialData();
      this.renderHeader();
      this.renderSidebar();
      if (this.state.activeRoute === 'dashboard') {
        this.renderDashboard();
      }
    } catch (err) {
      console.error('COS Theta Init Error:', err);
      const mainContent = document.getElementById('page-content');
      if (mainContent) {
        mainContent.innerHTML = `
          <div class="card" style="margin: 40px auto; max-width: 600px; padding: 24px; border-left: 4px solid var(--color-ember);">
            <h3 style="color: var(--color-ink); margin-bottom: 8px;">Workspace Initialization Notice</h3>
            <p style="color: var(--color-mid-gray); font-size: 13.5px; margin-bottom: 16px;">${err.message || 'Connecting to operational data layer...'}</p>
            <button class="btn btn-primary btn-sm" onclick="location.reload()">Reload Application</button>
          </div>
        `;
      }
    }
  },

  bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openAIModal();
      }
    });
  },

  async fetchInitialData() {
    try {
      const [stats, settings, users] = await Promise.all([
        API.get(`/api/stats?business=${this.state.activeBusiness}`).catch(() => this.state.stats),
        API.get('/api/settings').catch(() => ({})),
        API.get('/api/users').catch(() => this.state.users)
      ]);
      if (stats && typeof stats === 'object') this.state.stats = { ...this.state.stats, ...stats };
      if (settings && typeof settings === 'object') this.state.settings = settings;
      if (Array.isArray(users) && users.length > 0) this.state.users = users;
    } catch (e) {
      console.warn('Initial data fetch warning:', e);
    }
  },

  setBusiness(business) {
    this.state.activeBusiness = business;
    this.renderHeader();
    this.renderSidebar();
    this.navigateTo(this.state.activeRoute);
  },

  setUser(userId) {
    const user = (this.state.users || []).find(u => u.id === userId);
    if (user) {
      this.state.currentUser = user;
      API.showToast(`Switched user to ${user.name} (${user.role})`);
      this.renderHeader();
      this.renderSidebar();
      this.navigateTo(this.state.activeRoute);
    }
  },

  navigateTo(route) {
    this.state.activeRoute = route;
    this.renderSidebar();
    const mainContent = document.getElementById('page-content');
    if (!mainContent) return;

    switch (route) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'leads':
        this.renderLeads();
        break;
      case 'clients':
        this.renderClients();
        break;
      case 'orders':
        this.renderOrdersPOS();
        break;
      case 'inventory':
        this.renderInventory();
        break;
      case 'transactions':
        this.renderTransactions();
        break;
      case 'tasks':
        this.renderTasks();
        break;
      case 'team':
        this.renderTeam();
        break;
      case 'documents':
        this.renderDocuments();
        break;
      case 'ai':
        this.renderAIPanel();
        break;
      case 'settings':
        this.renderSettings();
        break;
      default:
        this.renderDashboard();
    }
  },

  // ---------------- HEADER & SIDEBAR RENDERING ----------------

  renderHeader() {
    const headerEl = document.getElementById('top-header');
    if (!headerEl) return;

    const b = this.state.activeBusiness;
    const usersList = Array.isArray(this.state.users) && this.state.users.length > 0 ? this.state.users : [this.state.currentUser];
    const currentId = this.state.currentUser ? this.state.currentUser.id : 'usr_admin';

    headerEl.innerHTML = `
      <div class="business-switcher">
        <button class="business-btn ${b === 'all' ? 'active' : ''}" onclick="App.setBusiness('all')">
          <span>All Operations</span>
        </button>
        <button class="business-btn ${b === 'filtr_coffee' ? 'active' : ''}" onclick="App.setBusiness('filtr_coffee')">
          <span>FILTR Coffee</span>
        </button>
        <button class="business-btn ${b === 'zero7_consultancy' ? 'active' : ''}" onclick="App.setBusiness('zero7_consultancy')">
          <span>Zero7 Consultancy</span>
        </button>
      </div>

      <div class="header-right">
        <button class="ai-trigger-btn" onclick="App.openAIModal()">
          ${Icons.ai(16)}
          <span>Ask AI Assistant</span>
          <span class="kbd-shortcut">&#8984;K</span>
        </button>

        <div class="flex-gap">
          <select class="select" style="width: auto; padding: 6px 12px; font-size: 12.5px; height: 36px;" onchange="App.setUser(this.value)">
            ${usersList.map(u => `
              <option value="${u.id}" ${u.id === currentId ? 'selected' : ''}>
                ${u.name} (${((u.role || 'founder').replace('_', ' ')).toUpperCase()})
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    `;
  },

  renderSidebar() {
    const sidebarEl = document.getElementById('sidebar');
    if (!sidebarEl) return;

    const r = this.state.activeRoute;
    const b = this.state.activeBusiness;
    const lowStock = this.state.stats.low_stock_count || 0;
    const openTasks = this.state.stats.open_tasks || 0;
    const activeLeads = this.state.stats.active_pipeline_leads || 0;

    sidebarEl.innerHTML = `
      <div class="sidebar-header">
        <a href="#" class="brand-mark" onclick="App.navigateTo('dashboard'); return false;">
          <div class="brand-badge">θ</div>
          <div>
            <div class="brand-title">COS Theta</div>
          </div>
        </a>
        <span class="brand-version">v2.0</span>
      </div>

      <div class="sidebar-nav">
        <div class="nav-section-label">Command</div>
        <button class="nav-item ${r === 'dashboard' ? 'active' : ''}" onclick="App.navigateTo('dashboard')">
          <div class="nav-item-left">${Icons.dashboard()} <span>Dashboard</span></div>
        </button>

        <button class="nav-item ${r === 'ai' ? 'active' : ''}" onclick="App.navigateTo('ai')">
          <div class="nav-item-left">${Icons.ai()} <span>AI Command Center</span></div>
          <span class="nav-badge">Live</span>
        </button>

        ${b === 'all' || b === 'zero7_consultancy' ? `
          <div class="nav-section-label">Zero7 Consultancy</div>
          <button class="nav-item ${r === 'leads' ? 'active' : ''}" onclick="App.navigateTo('leads')">
            <div class="nav-item-left">${Icons.leads()} <span>Leads & CRM</span></div>
            ${activeLeads > 0 ? `<span class="nav-badge">${activeLeads}</span>` : ''}
          </button>
          <button class="nav-item ${r === 'clients' ? 'active' : ''}" onclick="App.navigateTo('clients')">
            <div class="nav-item-left">${Icons.clients()} <span>Clients & Projects</span></div>
          </button>
        ` : ''}

        ${b === 'all' || b === 'filtr_coffee' ? `
          <div class="nav-section-label">FILTR Coffee Outlet</div>
          <button class="nav-item ${r === 'orders' ? 'active' : ''}" onclick="App.navigateTo('orders')">
            <div class="nav-item-left">${Icons.coffee()} <span>POS & Orders</span></div>
          </button>
          <button class="nav-item ${r === 'inventory' ? 'active' : ''}" onclick="App.navigateTo('inventory')">
            <div class="nav-item-left">${Icons.inventory()} <span>Stock & Inventory</span></div>
            ${lowStock > 0 ? `<span class="nav-badge alert">${lowStock} Low</span>` : ''}
          </button>
        ` : ''}

        <div class="nav-section-label">Operations</div>
        <button class="nav-item ${r === 'transactions' ? 'active' : ''}" onclick="App.navigateTo('transactions')">
          <div class="nav-item-left">${Icons.transactions()} <span>Ledger & Cash Flow</span></div>
        </button>
        <button class="nav-item ${r === 'tasks' ? 'active' : ''}" onclick="App.navigateTo('tasks')">
          <div class="nav-item-left">${Icons.tasks()} <span>Tasks & Google To-Do</span></div>
          ${openTasks > 0 ? `<span class="nav-badge">${openTasks}</span>` : ''}
        </button>
        <button class="nav-item ${r === 'team' ? 'active' : ''}" onclick="App.navigateTo('team')">
          <div class="nav-item-left">${Icons.team()} <span>The Guys (Team)</span></div>
        </button>
        <button class="nav-item ${r === 'documents' ? 'active' : ''}" onclick="App.navigateTo('documents')">
          <div class="nav-item-left">${Icons.documents()} <span>Drive Document Vault</span></div>
        </button>
        <button class="nav-item ${r === 'settings' ? 'active' : ''}" onclick="App.navigateTo('settings')">
          <div class="nav-item-left">${Icons.settings()} <span>Settings & Integrations</span></div>
        </button>
      </div>

      <div class="sidebar-footer">
        <div class="user-pill" onclick="App.navigateTo('team')">
          <div class="flex-gap">
            <div class="user-avatar">${this.state.currentUser.avatar_initials || 'U'}</div>
            <div>
              <div style="font-size: 13px; font-weight: 600;">${this.state.currentUser.name}</div>
              <div style="font-size: 11px; color: var(--color-mid-gray); text-transform: capitalize;">${this.state.currentUser.role.replace('_', ' ')}</div>
            </div>
          </div>
          ${Icons.chevronRight(14)}
        </div>
      </div>
    `;
  },

  // ---------------- 1. DASHBOARD VIEW ----------------

  async renderDashboard() {
    const mainEl = document.getElementById('page-content');
    if (!mainEl) return;

    let stats = this.state.stats || {};
    try {
      const fetchedStats = await API.get(`/api/stats?business=${this.state.activeBusiness}`);
      if (fetchedStats && typeof fetchedStats === 'object') {
        this.state.stats = { ...this.state.stats, ...fetchedStats };
        stats = this.state.stats;
      }
    } catch (e) {
      console.warn('Dashboard stats fetch warning:', e);
    }

    const bName = this.state.activeBusiness === 'all' ? 'Consolidated Group' : (this.state.activeBusiness === 'filtr_coffee' ? 'FILTR Coffee Outlet' : 'Zero7 Consultancy');
    const totRev = Number(stats.total_revenue || 0);
    const todayRev = Number(stats.today_revenue || 0);
    const totOrders = Number(stats.total_orders || 0);
    const todayOrders = Number(stats.today_orders || 0);
    const activeLeads = Number(stats.active_pipeline_leads || 0);
    const convRate = Number(stats.conversion_rate || 0);
    const openTasks = Number(stats.open_tasks || 0);
    const teamCount = Number(stats.active_team_count || 1);
    const lowStock = Number(stats.low_stock_count || 0);

    mainEl.innerHTML = `
      <div style="margin-bottom: 24px;">
        <div class="flex-between">
          <div>
            <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">${bName} Dashboard</h1>
            <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Real-time operational tracking, cash flow, and team synchronization.</p>
          </div>
          <div class="action-strip">
            <button class="btn btn-outline" onclick="App.openAIModal()">
              ${Icons.ai(14)} Ask AI
            </button>
            ${this.state.activeBusiness !== 'zero7_consultancy' ? `
              <button class="btn btn-primary" onclick="App.navigateTo('orders')">
                ${Icons.plus(14)} New Coffee Order
              </button>
            ` : ''}
            ${this.state.activeBusiness !== 'filtr_coffee' ? `
              <button class="btn btn-primary" onclick="App.openAddLeadModal()">
                ${Icons.plus(14)} Add Lead
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      ${lowStock > 0 && this.state.activeBusiness !== 'zero7_consultancy' ? `
        <div class="alert-banner">
          <div class="flex-gap">
            ${Icons.alert(20)}
            <div>
              <div style="font-weight: 600; font-size: 14px; color: var(--color-ink);">Attention: ${lowStock} Inventory Items Below Minimum Threshold</div>
              <div style="font-size: 12.5px; color: var(--color-mid-gray);">Beans, milk, or packaging stock requires immediate restock order ahead of peak rush.</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="App.navigateTo('inventory')">Review Stock</button>
        </div>
      ` : ''}

      <!-- STAT BLOCKS -->
      <div class="grid-4" style="margin-bottom: 28px;">
        <div class="stat-card">
          <div class="stat-label">
            <span>Total Revenue / MRR</span>
            ${Icons.transactions(16)}
          </div>
          <div class="stat-value">Rs ${totRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="stat-subtext">Today: Rs ${todayRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">
            <span>${this.state.activeBusiness === 'filtr_coffee' ? 'Total Cafe Orders' : 'Active Lead Pipeline'}</span>
            ${this.state.activeBusiness === 'filtr_coffee' ? Icons.coffee(16) : Icons.leads(16)}
          </div>
          <div class="stat-value">${this.state.activeBusiness === 'filtr_coffee' ? totOrders : activeLeads}</div>
          <div class="stat-subtext">${this.state.activeBusiness === 'filtr_coffee' ? `${todayOrders} orders placed today` : `Conversion rate: ${convRate}%`}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">
            <span>Pending Team Tasks</span>
            ${Icons.tasks(16)}
          </div>
          <div class="stat-value">${openTasks}</div>
          <div class="stat-subtext">Google Tasks Synced</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">
            <span>Active Team Members</span>
            ${Icons.team(16)}
          </div>
          <div class="stat-value">${teamCount}</div>
          <div class="stat-subtext">RBAC Access Active</div>
        </div>
      </div>

      <!-- LIVE ACTIVITIES & QUICK ACCESS -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Live Unified Activity Stream</div>
              <div class="card-description">Real-time audit log of orders, lead calls, and task updates.</div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="App.renderDashboard()">Refresh</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${(stats.recent_activities || []).length === 0 ? `
              <div style="padding: 24px; text-align: center; color: var(--color-mid-gray);">No recent activities logged yet.</div>
            ` : stats.recent_activities.map(act => `
              <div style="display: flex; align-items: flex-start; justify-content: space-between; padding: 12px; border-radius: 14px; background: var(--color-surface-alt); border: 1px solid var(--color-hairline);">
                <div class="flex-gap" style="align-items: flex-start;">
                  <div style="margin-top: 2px;">
                    ${act.type === 'order' ? Icons.coffee(16) : (act.type === 'call' ? Icons.phone(16) : Icons.tasks(16))}
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 13.5px;">${act.title}</div>
                    <div style="font-size: 12.5px; color: var(--color-mid-gray); margin-top: 2px;">${act.description}</div>
                  </div>
                </div>
                <div style="font-size: 11px; color: var(--color-mid-gray); white-space: nowrap;">
                  ${new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Google Cloud & DB Synchronization</div>
              <div class="card-description">Service Account connectors for Sheets, Drive, and Tasks.</div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="App.syncAllGoogle()">Sync Now</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px; border-radius: 14px; border: 1px solid var(--color-hairline);">
              <div class="flex-gap">
                ${Icons.sheet(18)}
                <div>
                  <div style="font-weight: 600; font-size: 13.5px;">Google Sheets (Zero7 Leads)</div>
                  <div style="font-size: 12px; color: var(--color-mid-gray);">Spreadsheet Two-Way Sync Active</div>
                </div>
              </div>
              <span class="badge badge-success">Connected</span>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px; border-radius: 14px; border: 1px solid var(--color-hairline);">
              <div class="flex-gap">
                ${Icons.tasks(18)}
                <div>
                  <div style="font-weight: 600; font-size: 13.5px;">Google Tasks & To-Do</div>
                  <div style="font-size: 12px; color: var(--color-mid-gray);">Team sync enabled per employee</div>
                </div>
              </div>
              <span class="badge badge-success">Synced</span>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px; border-radius: 14px; border: 1px solid var(--color-hairline);">
              <div class="flex-gap">
                ${Icons.documents(18)}
                <div>
                  <div style="font-weight: 600; font-size: 13.5px;">Google Drive Central Vault</div>
                  <div style="font-size: 12px; color: var(--color-mid-gray);">Enterprise root folder mapped</div>
                </div>
              </div>
              <span class="badge badge-success">Vault Active</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ---------------- 2. LEADS & CRM VIEW (ZERO7) ----------------

  async renderLeads(viewMode = 'kanban') {
    const mainEl = document.getElementById('page-content');
    const leads = await API.get('/api/leads');
    this.state.leads = leads;

    const stages = [
      { id: 'not_contacted', label: 'Not Contacted' },
      { id: 'called_no_answer', label: 'Called (No Answer)' },
      { id: 'followup_scheduled', label: 'Follow-Up Scheduled' },
      { id: 'pitch_completed', label: 'Pitch Completed' },
      { id: 'proposal_sent', label: 'Proposal Sent' },
      { id: 'won', label: 'Won / Converted' }
    ];

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Zero7 Leads Pipeline & CRM</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Track outreach calling, log pitch outcomes, and sync with Google Sheets.</p>
        </div>
        <div class="action-strip">
          <button class="btn btn-outline" onclick="App.openGoogleSheetView()">
            ${Icons.sheet(14)} View Google Sheet
          </button>
          <button class="btn btn-outline" onclick="App.syncGoogleSheets()">
            ${Icons.sync(14)} Sync Sheet
          </button>
          <button class="btn btn-primary" onclick="App.openAddLeadModal()">
            ${Icons.plus(14)} Add New Lead
          </button>
        </div>
      </div>

      <div class="kanban-board">
        ${stages.map(st => {
          const colLeads = leads.filter(l => l.status === st.id);
          return `
            <div class="kanban-col">
              <div class="flex-between">
                <div style="font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${st.label}</div>
                <span class="badge badge-soft">${colLeads.length}</span>
              </div>
              <div class="kanban-cards">
                ${colLeads.map(lead => `
                  <div class="lead-kanban-card" onclick="App.openLeadDetailsModal('${lead.id}')">
                    <div class="flex-between">
                      <div style="font-weight: 600; font-size: 14px; color: var(--color-ink);">${lead.company_name}</div>
                      <span class="badge badge-soft" style="font-size: 11px;">₹${(lead.estimated_value || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div style="font-size: 12.5px; color: var(--color-mid-gray); margin: 6px 0;">
                      👤 ${lead.contact_person} &bull; 📞 ${lead.phone}
                    </div>
                    <div style="font-size: 12px; color: var(--color-ink-soft); background: var(--color-canvas); padding: 6px 8px; border-radius: 8px; margin-bottom: 8px;">
                      ${lead.notes || 'No notes added yet.'}
                    </div>
                    <div class="flex-between" style="font-size: 11.5px; color: var(--color-mid-gray);">
                      <span>Next: ${lead.next_followup_date || 'None'}</span>
                      <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); App.openCallModal('${lead.id}')">
                        ${Icons.phone(12)} Log Call
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  openAddLeadModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Add New Lead (Zero7 Consultancy)</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleCreateLead(event)">
        <div class="form-group">
          <label class="form-label">Company Name *</label>
          <input type="text" id="lead_company" class="input" placeholder="e.g. Apex Global Tech" required>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Contact Person *</label>
            <input type="text" id="lead_person" class="input" placeholder="e.g. Rahul Sen" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="text" id="lead_phone" class="input" placeholder="+91 98765 43210" required>
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="lead_email" class="input" placeholder="contact@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Estimated Deal Value (INR)</label>
            <input type="number" id="lead_value" class="input" placeholder="150000" value="100000">
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Sector / Domain</label>
            <input type="text" id="lead_sector" class="input" placeholder="FinTech / SaaS" value="Technology">
          </div>
          <div class="form-group">
            <label class="form-label">Initial Status</label>
            <select id="lead_status" class="select">
              <option value="not_contacted">Not Contacted</option>
              <option value="followup_scheduled">Follow-up Scheduled</option>
              <option value="pitch_completed">Pitch Completed</option>
              <option value="proposal_sent">Proposal Sent</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes & Requirements</label>
          <textarea id="lead_notes" class="textarea" rows="3" placeholder="Context from outreach or client background..."></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Lead</button>
        </div>
      </form>
    `);
  },

  async handleCreateLead(e) {
    e.preventDefault();
    const payload = {
      company_name: document.getElementById('lead_company').value,
      contact_person: document.getElementById('lead_person').value,
      phone: document.getElementById('lead_phone').value,
      email: document.getElementById('lead_email').value || null,
      estimated_value: parseFloat(document.getElementById('lead_value').value) || 0,
      sector: document.getElementById('lead_sector').value || 'Technology',
      status: document.getElementById('lead_status').value,
      notes: document.getElementById('lead_notes').value || null
    };

    try {
      await API.post('/api/leads', payload);
      API.showToast(`Lead created for ${payload.company_name}`);
      this.closeModal();
      this.renderLeads();
    } catch (err) {
      console.error(err);
    }
  },

  openCallModal(leadId) {
    const lead = this.state.leads.find(l => l.id === leadId);
    if (!lead) return;

    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Log Call: ${lead.company_name}</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleLogCall(event, '${leadId}')">
        <div style="background: var(--color-surface-alt); padding: 12px; border-radius: 12px; margin-bottom: 16px; font-size: 13px;">
          <div><strong>Contact:</strong> ${lead.contact_person} &bull; <strong>Phone:</strong> ${lead.phone}</div>
          <div style="color: var(--color-mid-gray); margin-top: 4px;">Caller: ${this.state.currentUser.name}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Call Outcome *</label>
          <input type="text" id="call_outcome" class="input" placeholder="e.g. Pitch call completed - high interest" required>
        </div>
        <div class="form-group">
          <label class="form-label">Detailed Discussion Notes *</label>
          <textarea id="call_notes" class="textarea" rows="3" placeholder="What did the client say? What are next steps?" required></textarea>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Update Pipeline Stage</label>
            <select id="call_stage" class="select">
              <option value="followup_scheduled">Follow-Up Scheduled</option>
              <option value="pitch_completed">Pitch Completed</option>
              <option value="proposal_sent">Proposal Sent</option>
              <option value="called_no_answer">Called (No Answer)</option>
              <option value="won">Won / Converted to Client</option>
              <option value="lost">Lost / Disqualified</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Next Follow-Up Date</label>
            <input type="date" id="call_next_date" class="input" value="${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Call Log</button>
        </div>
      </form>
    `);
  },

  async handleLogCall(e, leadId) {
    e.preventDefault();
    const outcome = document.getElementById('call_outcome').value;
    const notes = document.getElementById('call_notes').value;
    const nextDate = document.getElementById('call_next_date').value;
    const stage = document.getElementById('call_stage').value;

    try {
      await API.post(`/api/leads/${leadId}/call?caller_id=${this.state.currentUser.id}&caller_name=${encodeURIComponent(this.state.currentUser.name)}`, {
        outcome,
        notes,
        next_followup_date: nextDate
      });
      await API.put(`/api/leads/${leadId}`, { status: stage });
      API.showToast('Call log recorded and lead status updated');
      this.closeModal();
      this.renderLeads();
    } catch (err) {
      console.error(err);
    }
  },

  openLeadDetailsModal(leadId) {
    const lead = this.state.leads.find(l => l.id === leadId);
    if (!lead) return;

    this.openModal(`
      <div class="modal-header">
        <div>
          <div class="modal-title">${lead.company_name}</div>
          <div style="font-size: 13px; color: var(--color-mid-gray); margin-top: 2px;">Sector: ${lead.sector} &bull; Est. Value: ₹${(lead.estimated_value || 0).toLocaleString('en-IN')}</div>
        </div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="btn btn-primary" onclick="App.openCallModal('${lead.id}')">
          ${Icons.phone(14)} Log New Call
        </button>
        <button class="btn btn-outline" onclick="App.convertLeadToClient('${lead.id}')">
          ${Icons.check(14)} Convert to Active Client
        </button>
      </div>

      <div class="card" style="padding: 16px; margin-bottom: 20px; background: var(--color-surface-alt);">
        <div style="font-weight: 600; font-size: 13.5px; margin-bottom: 8px;">Contact & Overview</div>
        <div style="font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div><strong>Contact Person:</strong> ${lead.contact_person}</div>
          <div><strong>Phone:</strong> ${lead.phone}</div>
          <div><strong>Email:</strong> ${lead.email || '—'}</div>
          <div><strong>Status:</strong> ${lead.status.replace('_', ' ').toUpperCase()}</div>
          <div><strong>Next Follow-up:</strong> ${lead.next_followup_date || 'None'}</div>
          <div><strong>Google Sheet Row:</strong> ${lead.google_sheet_row_id || 'Synced'}</div>
        </div>
      </div>

      <div>
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px;">Call History & Outreach Logs (${(lead.call_logs || []).length})</div>
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto;">
          ${(lead.call_logs || []).length === 0 ? `
            <div style="padding: 16px; text-align: center; color: var(--color-mid-gray); font-size: 13px;">No calls logged yet.</div>
          ` : lead.call_logs.map(cl => `
            <div style="padding: 12px; border-radius: 12px; border: 1px solid var(--color-hairline); background: var(--color-paper);">
              <div class="flex-between">
                <div style="font-weight: 600; font-size: 13px;">${cl.outcome}</div>
                <div style="font-size: 11px; color: var(--color-mid-gray);">${new Date(cl.called_at).toLocaleString()}</div>
              </div>
              <div style="font-size: 12.5px; margin-top: 4px;">${cl.notes}</div>
              <div style="font-size: 11px; color: var(--color-mid-gray); margin-top: 4px;">Logged by: ${cl.caller_name}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `);
  },

  async convertLeadToClient(leadId) {
    try {
      const res = await API.post(`/api/leads/${leadId}/convert`);
      API.showToast('Lead successfully converted to Active Client!');
      this.closeModal();
      this.navigateTo('clients');
    } catch (err) {
      console.error(err);
    }
  },

  async openGoogleSheetView() {
    const rows = await API.get('/api/integrations/sheets/preview');
    this.openModal(`
      <div class="modal-header">
        <div>
          <div class="modal-title">Google Sheets Live Mirror (Zero7_Leads_Master)</div>
          <div style="font-size: 12.5px; color: var(--color-mid-gray);">Connected via Google Cloud Service Account</div>
        </div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>

      <div class="table-container" style="max-height: 400px; margin-bottom: 20px;">
        <table class="table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Company</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Sector</th>
              <th>Status</th>
              <th>Est. Value</th>
              <th>Next Followup</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>#${r.row_number}</td>
                <td><strong>${r.company_name}</strong></td>
                <td>${r.contact_person}</td>
                <td>${r.phone}</td>
                <td>${r.sector}</td>
                <td><span class="badge badge-soft">${r.status}</span></td>
                <td>${r.estimated_value}</td>
                <td>${r.next_followup_date}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" onclick="App.syncGoogleSheets()">
          ${Icons.sync(14)} Synchronize Now
        </button>
      </div>
    `);
  },

  async syncGoogleSheets() {
    try {
      const res = await API.post('/api/integrations/sheets/sync');
      API.showToast(res.message || 'Google Sheets synchronized');
      this.renderLeads();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 3. CLIENTS & DELIVERABLES (ZERO7) ----------------

  async renderClients() {
    const mainEl = document.getElementById('page-content');
    const clients = await API.get('/api/clients');
    this.state.clients = clients;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Zero7 Converted Clients & Projects</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Enterprise client accounts, monthly retainer billing, and active deliverable milestones.</p>
        </div>
        <button class="btn btn-primary" onclick="App.openAddClientModal()">
          ${Icons.plus(14)} Add New Client Account
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 24px;">
        ${clients.map(client => `
          <div class="card">
            <div class="flex-between" style="border-bottom: 1px solid var(--color-hairline); padding-bottom: 14px; margin-bottom: 16px;">
              <div>
                <div style="font-size: 18px; font-weight: 600; color: var(--color-ink);">${client.company_name}</div>
                <div style="font-size: 13px; color: var(--color-mid-gray); margin-top: 2px;">
                  👤 ${client.contact_person} &bull; ✉️ ${client.email} &bull; 📞 ${client.phone}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 16px; font-weight: 600; color: var(--color-ink);">₹${(client.monthly_value || 0).toLocaleString('en-IN')}/month</div>
                <span class="badge badge-success" style="margin-top: 4px;">${client.tier}</span>
              </div>
            </div>

            <div>
              <div class="flex-between" style="margin-bottom: 12px;">
                <div style="font-weight: 600; font-size: 14px;">Project Deliverables & Milestones</div>
                <button class="btn btn-sm btn-outline" onclick="App.openAddDeliverableModal('${client.id}')">
                  ${Icons.plus(12)} Add Deliverable
                </button>
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${(client.deliverables || []).length === 0 ? `
                  <div style="padding: 14px; text-align: center; color: var(--color-mid-gray); font-size: 13px; background: var(--color-surface-alt); border-radius: 12px;">
                    No deliverables recorded for this account. Click "Add Deliverable" to create a milestone.
                  </div>
                ` : client.deliverables.map(del => `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 14px; background: var(--color-surface-alt); border: 1px solid var(--color-hairline);">
                    <div>
                      <div style="font-weight: 600; font-size: 13.5px;">${del.title}</div>
                      <div style="font-size: 12.5px; color: var(--color-mid-gray); margin-top: 2px;">${del.description || 'No description'} &bull; Assigned to: ${del.assigned_to || 'Team'}</div>
                    </div>
                    <div class="flex-gap">
                      <span style="font-size: 12px; color: var(--color-mid-gray); margin-right: 8px;">Due: ${del.due_date}</span>
                      <select class="select" style="width: auto; padding: 4px 8px; font-size: 12px; height: 30px;" onchange="App.updateDeliverableStatus('${del.id}', this.value)">
                        <option value="pending" ${del.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="in_progress" ${del.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="completed" ${del.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="delayed" ${del.status === 'delayed' ? 'selected' : ''}>Delayed</option>
                      </select>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openAddDeliverableModal(clientId) {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Add Client Deliverable</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleCreateDeliverable(event, '${clientId}')">
        <div class="form-group">
          <label class="form-label">Deliverable Title *</label>
          <input type="text" id="del_title" class="input" placeholder="e.g. AWS Architecture Hardening Blueprint" required>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="del_desc" class="textarea" rows="3" placeholder="Scope and expected output..."></textarea>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Due Date *</label>
            <input type="date" id="del_due" class="input" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Assignee</label>
            <input type="text" id="del_assignee" class="input" placeholder="Consultant Name" value="${this.state.currentUser.name}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Deliverable</button>
        </div>
      </form>
    `);
  },

  async handleCreateDeliverable(e, clientId) {
    e.preventDefault();
    const title = document.getElementById('del_title').value;
    const desc = document.getElementById('del_desc').value;
    const due = document.getElementById('del_due').value;
    const assignee = document.getElementById('del_assignee').value;

    try {
      await API.post(`/api/clients/${clientId}/deliverables?title=${encodeURIComponent(title)}&description=${encodeURIComponent(desc)}&due_date=${due}&assigned_to=${encodeURIComponent(assignee)}`);
      API.showToast('Deliverable added');
      this.closeModal();
      this.renderClients();
    } catch (err) {
      console.error(err);
    }
  },

  async updateDeliverableStatus(delivId, status) {
    try {
      await API.put(`/api/deliverables/${delivId}/status?status=${status}`);
      API.showToast(`Deliverable status updated to ${status}`);
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 4. ORDERS & POS (FILTR COFFEE) ----------------

  async renderOrdersPOS() {
    const mainEl = document.getElementById('page-content');
    const [menu, orders] = await Promise.all([
      API.get('/api/menu'),
      API.get('/api/orders?limit=10')
    ]);
    this.state.menu = menu;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">FILTR Coffee Outlet POS & Order Terminal</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Point of sale order builder with automatic recipe stock deduction.</p>
        </div>
        <div class="flex-gap">
          <span class="badge badge-soft">Cashier: ${this.state.currentUser.name}</span>
        </div>
      </div>

      <div class="pos-layout">
        <!-- MENU ITEMS GRID -->
        <div>
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 14px;">Select Beverages & Snacks</div>
          <div class="menu-grid">
            ${menu.map(item => `
              <div class="menu-card" onclick="App.addToCart('${item.id}')">
                <div>
                  <div style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--color-mid-gray);">${item.category}</div>
                  <div style="font-weight: 600; font-size: 14.5px; color: var(--color-ink); margin-top: 4px;">${item.name}</div>
                </div>
                <div class="flex-between">
                  <span style="font-weight: 600; font-size: 15px;">₹${item.price.toFixed(2)}</span>
                  <button class="btn btn-sm btn-secondary" style="padding: 0 8px;">+ Add</button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- RECENT ORDERS HISTORY -->
          <div class="card" style="margin-top: 28px;">
            <div class="card-header">
              <div class="card-title">Recent Outlet Orders History</div>
            </div>
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.map(o => `
                    <tr>
                      <td><strong>${o.order_number}</strong></td>
                      <td>${o.customer_name}</td>
                      <td><span class="badge badge-soft">${o.order_type.toUpperCase()}</span></td>
                      <td>${o.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</td>
                      <td><strong>₹${o.total.toFixed(2)}</strong></td>
                      <td>${o.payment_method.toUpperCase()}</td>
                      <td>${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ACTIVE CART / ORDER CHECKOUT -->
        <div class="order-cart-card">
          <div style="font-weight: 600; font-size: 16px; border-bottom: 1px solid var(--color-hairline); padding-bottom: 12px;">
            Active Order Ticket
          </div>

          <div style="margin-top: 12px;" class="grid-2" style="gap: 8px;">
            <div>
              <label class="form-label" style="font-size: 11px;">Customer Name</label>
              <input type="text" id="pos_customer" class="input" placeholder="Guest" value="Walk-in Guest" style="padding: 4px 10px; font-size: 12.5px;">
            </div>
            <div>
              <label class="form-label" style="font-size: 11px;">Order Type</label>
              <select id="pos_type" class="select" style="padding: 4px 8px; font-size: 12.5px; height: 32px;">
                <option value="dine_in">Dine-in</option>
                <option value="takeaway">Takeaway</option>
              </select>
            </div>
          </div>

          <div class="cart-items-list" id="cart-items-list">
            ${this.renderCartItems()}
          </div>

          <div style="border-top: 1px solid var(--color-hairline); padding-top: 14px;">
            <div class="flex-between" style="font-size: 14px; margin-bottom: 6px;">
              <span>Subtotal:</span>
              <span id="cart-subtotal">₹0.00</span>
            </div>
            <div class="flex-between" style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">
              <span>Total Payable:</span>
              <span id="cart-total">₹0.00</span>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label" style="font-size: 11px;">Payment Method</label>
              <select id="pos_payment" class="select">
                <option value="upi_qr">📱 UPI / Dynamic QR</option>
                <option value="cash">💵 Cash at Counter</option>
                <option value="card">💳 Card Terminal</option>
              </select>
            </div>

            <button class="btn btn-primary" style="width: 100%; height: 42px; font-size: 14.5px;" onclick="App.submitPOSOrder()">
              Complete Order & Print Receipt
            </button>
          </div>
        </div>
      </div>
    `;

    this.updateCartTotals();
  },

  addToCart(menuItemId) {
    const item = this.state.menu.find(m => m.id === menuItemId);
    if (!item) return;

    const existing = this.state.posCart.find(c => c.menu_item_id === menuItemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.state.posCart.push({
        menu_item_id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1
      });
    }

    const listEl = document.getElementById('cart-items-list');
    if (listEl) listEl.innerHTML = this.renderCartItems();
    this.updateCartTotals();
  },

  changeCartQty(index, delta) {
    if (!this.state.posCart[index]) return;
    this.state.posCart[index].quantity += delta;
    if (this.state.posCart[index].quantity <= 0) {
      this.state.posCart.splice(index, 1);
    }
    const listEl = document.getElementById('cart-items-list');
    if (listEl) listEl.innerHTML = this.renderCartItems();
    this.updateCartTotals();
  },

  renderCartItems() {
    if (this.state.posCart.length === 0) {
      return '<div style="padding: 30px; text-align: center; color: var(--color-mid-gray); font-size: 13px;">Cart is empty.<br>Click any beverage or snack to add.</div>';
    }
    return this.state.posCart.map((item, idx) => `
      <div class="cart-item-row">
        <div>
          <div style="font-weight: 600; font-size: 13.5px;">${item.name}</div>
          <div style="font-size: 12px; color: var(--color-mid-gray);">₹${item.price.toFixed(2)} each</div>
        </div>
        <div class="flex-gap">
          <button class="btn btn-sm btn-secondary" style="width: 26px; height: 26px; padding: 0;" onclick="App.changeCartQty(${idx}, -1)">-</button>
          <span style="font-weight: 600; font-size: 13px; width: 18px; text-align: center;">${item.quantity}</span>
          <button class="btn btn-sm btn-secondary" style="width: 26px; height: 26px; padding: 0;" onclick="App.changeCartQty(${idx}, 1)">+</button>
          <span style="font-weight: 600; font-size: 13.5px; width: 60px; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      </div>
    `).join('');
  },

  updateCartTotals() {
    const total = this.state.posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subEl = document.getElementById('cart-subtotal');
    const totEl = document.getElementById('cart-total');
    if (subEl) subEl.innerText = `₹${total.toFixed(2)}`;
    if (totEl) totEl.innerText = `₹${total.toFixed(2)}`;
  },

  async submitPOSOrder() {
    if (this.state.posCart.length === 0) {
      API.showToast('Please add items to the cart before checkout', 'alert');
      return;
    }

    const customerName = document.getElementById('pos_customer')?.value || 'Walk-in Guest';
    const orderType = document.getElementById('pos_type')?.value || 'dine_in';
    const paymentMethod = document.getElementById('pos_payment')?.value || 'upi_qr';
    const total = this.state.posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const payload = {
      customer_name: customerName,
      order_type: orderType,
      items: this.state.posCart,
      subtotal: total,
      discount: 0.0,
      total: total,
      payment_method: paymentMethod
    };

    try {
      const order = await API.post(`/api/orders?cashier_id=${this.state.currentUser.id}&cashier_name=${encodeURIComponent(this.state.currentUser.name)}`, payload);
      API.showToast(`Order #${order.order_number} completed! Stock auto-depleted.`);
      this.state.posCart = [];
      this.openReceiptModal(order);
      this.renderOrdersPOS();
    } catch (err) {
      console.error(err);
    }
  },

  openReceiptModal(order) {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Receipt: ${order.order_number}</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>

      <div style="font-family: var(--font-geist-mono); background: var(--color-surface-alt); padding: 20px; border-radius: 16px; border: 1px solid var(--color-hairline); font-size: 13px;">
        <div style="text-align: center; margin-bottom: 14px;">
          <div style="font-weight: 700; font-size: 16px;">FILTR COFFEE OUTLET</div>
          <div>Specialty Brews & Fresh Bakes</div>
          <div style="color: var(--color-mid-gray); font-size: 11px; margin-top: 4px;">Order: ${order.order_number} &bull; ${new Date(order.created_at).toLocaleString()}</div>
        </div>

        <div style="border-top: 1px dashed var(--color-hairline); border-bottom: 1px dashed var(--color-hairline); padding: 12px 0; margin-bottom: 12px;">
          ${order.items.map(i => `
            <div class="flex-between" style="margin-bottom: 4px;">
              <span>${i.quantity}x ${i.name}</span>
              <span>₹${(i.price * i.quantity).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div class="flex-between" style="font-weight: 700; font-size: 15px;">
          <span>TOTAL PAID:</span>
          <span>₹${order.total.toFixed(2)}</span>
        </div>
        <div style="font-size: 11.5px; color: var(--color-mid-gray); margin-top: 6px;">
          Payment: ${order.payment_method.toUpperCase()} &bull; Cashier: ${order.cashier_name}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.print()">Print Receipt</button>
        <button class="btn btn-primary" onclick="App.closeModal()">Done</button>
      </div>
    `);
  },

  // ---------------- 5. INVENTORY & STOCK (FILTR COFFEE) ----------------

  async renderInventory() {
    const mainEl = document.getElementById('page-content');
    const [inventory, adjustments] = await Promise.all([
      API.get('/api/inventory'),
      API.get('/api/inventory/adjustments?limit=10')
    ]);
    this.state.inventory = inventory;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">FILTR Stock & Inventory Control</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Raw ingredient stock levels, low-stock threshold warnings, and supplier restocks.</p>
        </div>
        <div class="action-strip">
          <button class="btn btn-primary" onclick="App.openRestockModal()">
            ${Icons.plus(14)} Restock / Adjust Stock
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 28px;">
        <div class="card-header">
          <div class="card-title">Live Inventory Status & Threshold Alerts</div>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Min. Threshold</th>
                <th>Status</th>
                <th>Supplier</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${inventory.map(item => `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td>${item.category}</td>
                  <td><span style="font-weight: 600; font-size: 14px;">${item.current_stock.toFixed(2)} ${item.unit}</span></td>
                  <td>${item.minimum_threshold.toFixed(2)} ${item.unit}</td>
                  <td>
                    ${item.is_low_stock ? `
                      <span class="badge badge-alert">⚠️ LOW STOCK</span>
                    ` : `
                      <span class="badge badge-success">Optimal</span>
                    `}
                  </td>
                  <td>${item.supplier_name || '—'}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="App.openQuickAdjustModal('${item.id}', '${item.name}')">
                      Adjust
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Stock Adjustments & Usage Audit Log</div>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Item</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Adjusted By</th>
              </tr>
            </thead>
            <tbody>
              ${adjustments.map(adj => `
                <tr>
                  <td>${new Date(adj.created_at).toLocaleString()}</td>
                  <td><strong>${adj.item_name}</strong></td>
                  <td><span class="badge badge-soft">${adj.adjustment_type.toUpperCase()}</span></td>
                  <td style="font-weight: 600; color: ${adj.quantity_changed >= 0 ? '#166534' : 'var(--color-ink)'};">
                    ${adj.quantity_changed > 0 ? '+' : ''}${adj.quantity_changed.toFixed(2)}
                  </td>
                  <td>${adj.reason}</td>
                  <td>${adj.adjusted_by}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openRestockModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Inventory Restock / Adjustment</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleRestockSubmit(event)">
        <div class="form-group">
          <label class="form-label">Select Inventory Item *</label>
          <select id="adj_item" class="select" required>
            ${this.state.inventory.map(i => `
              <option value="${i.id}">${i.name} (Current: ${i.current_stock} ${i.unit})</option>
            `).join('')}
          </select>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Adjustment Type *</label>
            <select id="adj_type" class="select">
              <option value="restock">📦 Restock Shipment (+)</option>
              <option value="usage">☕ Manual Usage / Prep (-)</option>
              <option value="spoilage">🗑️ Spoilage / Wastage (-)</option>
              <option value="manual_correction">✏️ Manual Stock Count</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" step="0.01" id="adj_qty" class="input" placeholder="10.0" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Reason / Supplier Invoice Reference *</label>
          <input type="text" id="adj_reason" class="input" placeholder="e.g. Received weekly milk shipment" required>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Adjustment</button>
        </div>
      </form>
    `);
  },

  openQuickAdjustModal(itemId, itemName) {
    this.openRestockModal();
    setTimeout(() => {
      const selectEl = document.getElementById('adj_item');
      if (selectEl) selectEl.value = itemId;
    }, 50);
  },

  async handleRestockSubmit(e) {
    e.preventDefault();
    const itemId = document.getElementById('adj_item').value;
    const type = document.getElementById('adj_type').value;
    const qty = parseFloat(document.getElementById('adj_qty').value);
    const reason = document.getElementById('adj_reason').value;

    try {
      await API.post(`/api/inventory/${itemId}/adjust?adjustment_type=${type}&quantity=${qty}&reason=${encodeURIComponent(reason)}&adjusted_by=${encodeURIComponent(this.state.currentUser.name)}`);
      API.showToast('Inventory updated successfully');
      this.closeModal();
      this.renderInventory();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 6. TRANSACTIONS & CASH FLOW ----------------

  async renderTransactions() {
    const mainEl = document.getElementById('page-content');
    const txns = await API.get(`/api/transactions?business=${this.state.activeBusiness}`);
    this.state.transactions = txns;

    const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netCash = totalIncome - totalExpense;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Ledger & Cash Flow Management</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Track sales income, supplier procurement, software expenses, and daily reconciliation.</p>
        </div>
        <button class="btn btn-primary" onclick="App.openLogTransactionModal()">
          ${Icons.plus(14)} Log Transaction
        </button>
      </div>

      <div class="grid-4" style="margin-bottom: 28px;">
        <div class="stat-card">
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value" style="color: #166534;">₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Expenses</div>
          <div class="stat-value" style="color: var(--color-ember);">₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Net Cash Balance</div>
          <div class="stat-value">₹${netCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Ledger Entries</div>
          <div class="stat-value">${txns.length}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Transaction Ledger History</div>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Business</th>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Method</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${txns.map(t => `
                <tr>
                  <td>${new Date(t.created_at).toLocaleString()}</td>
                  <td><span class="badge badge-soft">${t.business.toUpperCase()}</span></td>
                  <td>
                    <span class="badge ${t.type === 'income' ? 'badge-success' : 'badge-alert'}">
                      ${t.type.toUpperCase()}
                    </span>
                  </td>
                  <td><strong>${t.category}</strong></td>
                  <td>${t.description}</td>
                  <td>${t.payment_method.toUpperCase()}</td>
                  <td style="font-weight: 600; color: ${t.type === 'income' ? '#166534' : 'var(--color-ember)'};">
                    ${t.type === 'income' ? '+' : '-'}₹${t.amount.toFixed(2)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openLogTransactionModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Log Financial Transaction</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleCreateTransaction(event)">
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Business *</label>
            <select id="txn_biz" class="select">
              <option value="filtr_coffee">FILTR Coffee</option>
              <option value="zero7_consultancy">Zero7 Consultancy</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Transaction Type *</label>
            <select id="txn_type" class="select">
              <option value="expense">Expense (Outflow)</option>
              <option value="income">Income (Inflow)</option>
            </select>
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Category *</label>
            <input type="text" id="txn_cat" class="input" placeholder="e.g. Raw Materials, Software, Client Retainer" required>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (INR) *</label>
            <input type="number" step="0.01" id="txn_amt" class="input" placeholder="5000.0" required>
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Payment Method</label>
            <select id="txn_method" class="select">
              <option value="bank_transfer">Bank Transfer / NEFT</option>
              <option value="upi_qr">UPI / QR</option>
              <option value="cash">Cash</option>
              <option value="card">Corporate Card</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description *</label>
            <input type="text" id="txn_desc" class="input" placeholder="e.g. Purchased coffee syrups from distributor" required>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Record Transaction</button>
        </div>
      </form>
    `);
  },

  async handleCreateTransaction(e) {
    e.preventDefault();
    const payload = {
      business: document.getElementById('txn_biz').value,
      type: document.getElementById('txn_type').value,
      category: document.getElementById('txn_cat').value,
      amount: parseFloat(document.getElementById('txn_amt').value),
      payment_method: document.getElementById('txn_method').value,
      description: document.getElementById('txn_desc').value
    };

    try {
      await API.post('/api/transactions', payload);
      API.showToast('Transaction logged in ledger');
      this.closeModal();
      this.renderTransactions();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 7. TASKS & GOOGLE TO-DO ----------------

  async renderTasks() {
    const mainEl = document.getElementById('page-content');
    const tasks = await API.get(`/api/tasks?business=${this.state.activeBusiness}`);
    this.state.tasks = tasks;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Tasks & Google To-Do Hub</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Synchronized with Google Tasks across all team members.</p>
        </div>
        <div class="action-strip">
          <button class="btn btn-outline" onclick="App.syncGoogleTasks()">
            ${Icons.sync(14)} Sync Google Tasks
          </button>
          <button class="btn btn-primary" onclick="App.openCreateTaskModal()">
            ${Icons.plus(14)} Create New Task
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Task List (${tasks.length})</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${tasks.length === 0 ? `
            <div style="padding: 30px; text-align: center; color: var(--color-mid-gray);">No open tasks for this view.</div>
          ` : tasks.map(task => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-radius: 16px; background: var(--color-surface-alt); border: 1px solid var(--color-hairline);">
              <div class="flex-gap" style="align-items: flex-start;">
                <input type="checkbox" ${task.status === 'done' ? 'checked' : ''} style="margin-top: 4px; width: 18px; height: 18px; accent-color: var(--color-ink);" onchange="App.toggleTaskStatus('${task.id}', this.checked)">
                <div>
                  <div style="font-weight: 600; font-size: 14px; text-decoration: ${task.status === 'done' ? 'line-through' : 'none'}; color: ${task.status === 'done' ? 'var(--color-mid-gray)' : 'var(--color-ink)'};">
                    ${task.title}
                  </div>
                  <div style="font-size: 12.5px; color: var(--color-mid-gray); margin-top: 2px;">
                    ${task.description || ''}
                  </div>
                  <div class="flex-gap" style="margin-top: 6px;">
                    <span class="badge badge-soft" style="font-size: 11px;">${task.business.toUpperCase()}</span>
                    <span class="badge ${task.priority === 'urgent' ? 'badge-alert' : 'badge-soft'}" style="font-size: 11px;">
                      ${task.priority.toUpperCase()}
                    </span>
                    <span style="font-size: 11.5px; color: var(--color-mid-gray);">Assigned to: ${task.assigned_to_name || 'Unassigned'}</span>
                    ${task.due_date ? `<span style="font-size: 11.5px; color: var(--color-mid-gray);">&bull; Due: ${task.due_date}</span>` : ''}
                  </div>
                </div>
              </div>
              <button class="btn btn-sm btn-destructive" onclick="App.deleteTask('${task.id}')">Delete</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  openCreateTaskModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Create New Task</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleCreateTask(event)">
        <div class="form-group">
          <label class="form-label">Task Title *</label>
          <input type="text" id="tsk_title" class="input" placeholder="What needs to be done?" required>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="tsk_desc" class="textarea" rows="2" placeholder="Details or context..."></textarea>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Business Context</label>
            <select id="tsk_biz" class="select">
              <option value="all">Group / All</option>
              <option value="zero7_consultancy">Zero7 Consultancy</option>
              <option value="filtr_coffee">FILTR Coffee</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select id="tsk_priority" class="select">
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Assignee</label>
            <select id="tsk_assignee" class="select">
              ${this.state.users.map(u => `
                <option value="${u.id}">${u.name} (${u.role})</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" id="tsk_due" class="input" value="${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Task</button>
        </div>
      </form>
    `);
  },

  async handleCreateTask(e) {
    e.preventDefault();
    const assigneeSelect = document.getElementById('tsk_assignee');
    const assigneeName = assigneeSelect.options[assigneeSelect.selectedIndex].text.split(' (')[0];

    const payload = {
      title: document.getElementById('tsk_title').value,
      description: document.getElementById('tsk_desc').value,
      business: document.getElementById('tsk_biz').value,
      priority: document.getElementById('tsk_priority').value,
      due_date: document.getElementById('tsk_due').value,
      assigned_to_id: assigneeSelect.value,
      assigned_to_name: assigneeName,
      status: 'todo'
    };

    try {
      await API.post(`/api/tasks?created_by=${encodeURIComponent(this.state.currentUser.name)}`, payload);
      API.showToast('Task created and synced');
      this.closeModal();
      this.renderTasks();
    } catch (err) {
      console.error(err);
    }
  },

  async toggleTaskStatus(taskId, isChecked) {
    try {
      await API.put(`/api/tasks/${taskId}`, { status: isChecked ? 'done' : 'todo' });
      API.showToast(`Task marked as ${isChecked ? 'completed' : 'to do'}`);
      this.renderTasks();
    } catch (err) {
      console.error(err);
    }
  },

  async deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await API.delete(`/api/tasks/${taskId}`);
      API.showToast('Task deleted');
      this.renderTasks();
    } catch (err) {
      console.error(err);
    }
  },

  async syncGoogleTasks() {
    try {
      const res = await API.post('/api/integrations/tasks/sync');
      API.showToast(res.message || 'Google Tasks synchronized');
      this.renderTasks();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 8. "THE GUYS" / TEAM & RBAC ----------------

  async renderTeam() {
    const mainEl = document.getElementById('page-content');
    const users = await API.get('/api/users');
    this.state.users = users;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">The Guys — Team & RBAC Credentials</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Employee directory, username/password credentials management, and access controls.</p>
        </div>
        <button class="btn btn-primary" onclick="App.openAddUserModal()">
          ${Icons.plus(14)} Add New Team Member
        </button>
      </div>

      <div class="grid-2" style="margin-bottom: 28px;">
        ${users.map(u => `
          <div class="card">
            <div class="flex-between" style="margin-bottom: 14px;">
              <div class="flex-gap">
                <div class="user-avatar" style="width: 36px; height: 36px; font-size: 14px;">${u.avatar_initials || 'U'}</div>
                <div>
                  <div style="font-weight: 600; font-size: 15px;">${u.name}</div>
                  <div style="font-size: 12.5px; color: var(--color-mid-gray);">${u.email}</div>
                </div>
              </div>
              <span class="badge badge-solid" style="text-transform: capitalize;">${u.role.replace('_', ' ')}</span>
            </div>

            <div style="background: var(--color-surface-alt); padding: 12px 16px; border-radius: 14px; margin-bottom: 14px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div><strong>Username:</strong> <code>${u.username}</code></div>
              <div><strong>Business Access:</strong> ${u.assigned_business.toUpperCase()}</div>
              <div><strong>Phone:</strong> ${u.phone || '—'}</div>
              <div><strong>Status:</strong> <span class="badge badge-success" style="font-size: 11px;">Active</span></div>
            </div>

            <div class="flex-between">
              <button class="btn btn-sm btn-outline" onclick="App.openChangePasswordModal('${u.id}', '${u.name}')">
                Reset Password
              </button>
              ${u.id !== 'usr_admin' ? `
                <button class="btn btn-sm btn-destructive" onclick="App.deleteUser('${u.id}')">Remove</button>
              ` : '<span style="font-size: 11px; color: var(--color-mid-gray);">SuperAdmin</span>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openAddUserModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Add New Team Member ("The Guys")</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleCreateUser(event)">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="usr_name" class="input" placeholder="e.g. Vikram Joshi" required>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Login Username *</label>
            <input type="text" id="usr_username" class="input" placeholder="vikram" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password *</label>
            <input type="password" id="usr_pwd" class="input" placeholder="••••••••" required>
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" id="usr_email" class="input" placeholder="vikram@costheta.internal" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" id="usr_phone" class="input" placeholder="+91 98765 43210">
          </div>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Role *</label>
            <select id="usr_role" class="select">
              <option value="lead_consultant">Lead Consultant (Zero7)</option>
              <option value="operations_manager">Operations Manager (FILTR)</option>
              <option value="barista_staff">Barista / Outlet Staff (FILTR)</option>
              <option value="founder">Founder / SuperAdmin</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Business *</label>
            <select id="usr_biz" class="select">
              <option value="all">All Businesses</option>
              <option value="zero7_consultancy">Zero7 Consultancy Only</option>
              <option value="filtr_coffee">FILTR Coffee Only</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create User</button>
        </div>
      </form>
    `);
  },

  async handleCreateUser(e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('usr_name').value,
      username: document.getElementById('usr_username').value,
      password: document.getElementById('usr_pwd').value,
      email: document.getElementById('usr_email').value,
      phone: document.getElementById('usr_phone').value || null,
      role: document.getElementById('usr_role').value,
      assigned_business: document.getElementById('usr_biz').value
    };

    try {
      await API.post('/api/users', payload);
      API.showToast(`User ${payload.name} created`);
      this.closeModal();
      this.renderTeam();
      this.fetchInitialData();
    } catch (err) {
      console.error(err);
    }
  },

  openChangePasswordModal(userId, userName) {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Reset Password: ${userName}</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleChangePassword(event, '${userId}')">
        <div class="form-group">
          <label class="form-label">New Password *</label>
          <input type="password" id="new_pwd" class="input" placeholder="••••••••" required>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </div>
      </form>
    `);
  },

  async handleChangePassword(e, userId) {
    e.preventDefault();
    const pwd = document.getElementById('new_pwd').value;
    try {
      await API.put(`/api/users/${userId}`, { password: pwd });
      API.showToast('Password updated successfully');
      this.closeModal();
    } catch (err) {
      console.error(err);
    }
  },

  async deleteUser(userId) {
    if (!confirm('Remove this team member?')) return;
    try {
      await API.delete(`/api/users/${userId}`);
      API.showToast('User removed');
      this.renderTeam();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 9. DOCUMENTS & DRIVE VAULT ----------------

  async renderDocuments() {
    const mainEl = document.getElementById('page-content');
    const docs = await API.get(`/api/documents?business=${this.state.activeBusiness}`);
    this.state.documents = docs;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Google Drive Central Document Vault</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Centralized enterprise contracts, pitch decks, SOPs, and compliance licenses.</p>
        </div>
        <button class="btn btn-primary" onclick="App.openUploadDocModal()">
          ${Icons.plus(14)} Upload Document
        </button>
      </div>

      <div class="grid-2">
        ${docs.map(doc => `
          <div class="card">
            <div class="flex-between" style="margin-bottom: 12px;">
              <div class="flex-gap">
                ${Icons.documents(20)}
                <div>
                  <div style="font-weight: 600; font-size: 14.5px;">${doc.title}</div>
                  <div style="font-size: 12px; color: var(--color-mid-gray);">${doc.category} &bull; ${doc.size_label}</div>
                </div>
              </div>
              <span class="badge badge-soft">${doc.business.toUpperCase()}</span>
            </div>
            <div class="flex-between" style="font-size: 12px; color: var(--color-mid-gray); border-top: 1px solid var(--color-hairline); padding-top: 10px; margin-top: 10px;">
              <span>Uploaded by ${doc.uploaded_by}</span>
              <a href="${doc.drive_url || '#'}" target="_blank" class="btn btn-sm btn-outline" style="text-decoration: none;">
                Open in Google Drive
              </a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openUploadDocModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="modal-title">Upload Document to Central Drive</div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>
      <form onsubmit="App.handleUploadDoc(event)">
        <div class="form-group">
          <label class="form-label">Document Title *</label>
          <input type="text" id="doc_title" class="input" placeholder="e.g. Zero7 - Client Master Services Agreement.pdf" required>
        </div>
        <div class="grid-2" style="gap: 12px;">
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select id="doc_cat" class="select">
              <option value="Contracts">Contracts & Legal</option>
              <option value="Pitch Decks">Pitch Decks</option>
              <option value="SOPs">SOPs & Guides</option>
              <option value="Compliance">Compliance & FSSAI</option>
              <option value="Finance">Finance & Tax</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Business Scope *</label>
            <select id="doc_biz" class="select">
              <option value="zero7_consultancy">Zero7 Consultancy</option>
              <option value="filtr_coffee">FILTR Coffee</option>
              <option value="all">Group / Company Wide</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Google Drive File Link / ID</label>
          <input type="text" id="doc_url" class="input" placeholder="https://drive.google.com/file/d/..." value="https://drive.google.com/drive/folders/central_vault">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Register in Vault</button>
        </div>
      </form>
    `);
  },

  async handleUploadDoc(e) {
    e.preventDefault();
    const payload = {
      title: document.getElementById('doc_title').value,
      category: document.getElementById('doc_cat').value,
      business: document.getElementById('doc_biz').value,
      drive_url: document.getElementById('doc_url').value,
      file_type: 'pdf',
      size_label: '2.4 MB'
    };

    try {
      await API.post(`/api/documents?uploaded_by=${encodeURIComponent(this.state.currentUser.name)}`, payload);
      API.showToast('Document registered in Drive Vault');
      this.closeModal();
      this.renderDocuments();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- 10. AI COMMAND CENTER (CMD+K & PANEL) ----------------

  async renderAIPanel() {
    const mainEl = document.getElementById('page-content');
    const isDev = this.state.developerMode;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">AI Command Center & Autonomous Pipeline</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Powered by Gemini 3.7 Tiered & Autonomous Aider CI/CD Pipeline.</p>
        </div>
        <div class="flex-gap">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; background: ${isDev ? '#0a0a0a' : 'var(--color-surface-alt)'}; color: ${isDev ? '#ffffff' : 'var(--color-ink)'}; padding: 6px 14px; border-radius: var(--radius-buttons); cursor: pointer; border: 1px solid var(--color-hairline);">
            <input type="checkbox" ${isDev ? 'checked' : ''} onchange="App.toggleDeveloperMode(this.checked)" style="accent-color: #ffffff;">
            <span>🛠️ Developer Mode (Aider Auto-Coder)</span>
          </label>
        </div>
      </div>

      ${isDev ? `
        <div class="alert-banner" style="border-left-color: #0a0a0a; background: #fafafa;">
          <div>
            <div style="font-weight: 600; font-size: 13.5px; color: var(--color-ink);">🛠️ Autonomous Developer Mode Active</div>
            <div style="font-size: 12.5px; color: var(--color-mid-gray);">Prompts typed here will be dispatched directly to <strong>GitHub Actions</strong> where <strong>Aider</strong> will autonomously edit the codebase, verify tests, commit, and deploy live to DigitalOcean.</div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="App.checkDeveloperStatus()">Check Live Builds</button>
        </div>
      ` : ''}

      <div class="card" style="max-width: 900px; margin: 0 auto;">
        <div id="ai-chat-history" style="min-height: 360px; max-height: 520px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px;">
          ${this.state.aiMessages.length === 0 ? `
            <div style="text-align: center; padding: 40px; color: var(--color-mid-gray);">
              <div style="display: inline-flex; padding: 12px; border-radius: 50%; background: var(--color-canvas); margin-bottom: 12px;">${Icons.ai(28)}</div>
              <div style="font-size: 16px; font-weight: 600; color: var(--color-ink);">${isDev ? 'What software feature should Aider build and deploy?' : 'How can I assist your operations today?'}</div>
              <div style="font-size: 13px; margin-top: 4px;">${isDev ? 'Type any feature request (e.g. "Add a discount code input on FILTR coffee POS") to start autonomous self-coding.' : "Ask me about today's coffee revenue, low-stock alerts, lead follow-ups, or team deliverables."}</div>
              
              <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 20px;">
                ${isDev ? `
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Add a customer notes and tip field in FILTR Coffee POS')">🛠️ Add POS Tip Field</button>
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Add a sector and revenue filter dropdown in Zero7 Leads table')">🛠️ Add CRM Filter Dropdown</button>
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Add an export to CSV button in Transactions ledger')">🛠️ Add CSV Export Button</button>
                ` : `
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt("What is today's revenue across both businesses?")">💰 Today's Revenue</button>
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Which items are running low in stock at FILTR Coffee?')">⚠️ Low Stock Alerts</button>
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Summarize Zero7 lead pipeline and upcoming followups')">🎯 Zero7 Leads Summary</button>
                  <button class="btn btn-sm btn-secondary" onclick="App.askAIPrompt('Show high priority tasks due this week')">📋 Urgent Tasks</button>
                `}
              </div>
            </div>
          ` : this.state.aiMessages.map(m => `
            <div style="display: flex; flex-direction: column; align-items: ${m.role === 'user' ? 'flex-end' : 'flex-start'};">
              <div style="max-width: 85%; padding: 14px 18px; border-radius: 18px; background: ${m.role === 'user' ? 'var(--color-ink)' : 'var(--color-surface-alt)'}; color: ${m.role === 'user' ? 'var(--color-paper)' : 'var(--color-ink)'}; border: ${m.role === 'user' ? 'none' : '1px solid var(--color-hairline)'}; font-size: 13.5px; line-height: 1.5;">
                ${m.role === 'assistant' ? App.formatMarkdown(m.content) : m.content}
              </div>
            </div>
          `).join('')}
        </div>

        <div style="border-top: 1px solid var(--color-hairline); padding-top: 16px; margin-top: 16px;">
          <form onsubmit="App.handleAISend(event)" style="display: flex; gap: 10px;">
            <input type="text" id="ai_input_panel" class="input" placeholder="${isDev ? '🛠️ Developer Prompt: Instruct Aider to autonomously build and deploy code...' : 'Ask anything about FILTR Coffee, Zero7 leads, inventory, tasks...'}" required>
            <button type="submit" class="btn btn-primary" style="padding: 0 20px;">${isDev ? 'Dispatch to Aider' : 'Send'}</button>
          </form>
        </div>
      </div>
    `;
  },

  toggleDeveloperMode(enabled) {
    this.state.developerMode = enabled;
    API.showToast(enabled ? '🛠️ Developer Mode Enabled: Prompts will dispatch to Aider on GitHub Actions' : 'Switched to Standard AI Assistant Mode');
    this.renderAIPanel();
  },

  async handleAISend(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById('ai_input_panel');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';
    this.state.aiMessages.push({ role: 'user', content: userText });
    this.renderAIPanel();

    if (this.state.developerMode) {
      try {
        const resp = await API.post('/api/developer/dispatch-prompt', { prompt: userText });
        const answerText = `### 🚀 Autonomous Aider Pipeline Dispatched!\n\n- **Prompt:** \`${userText}\`\n- **Target Repository:** \`${resp.repo}\`\n- **Action:** GitHub Actions workflow \`autonomous-aider.yml\` is now executing Aider with Gemini 3.7 Tiered to modify, test, and commit the code.\n\n[View Live GitHub Actions Build](${resp.workflow_url})`;
        this.state.aiMessages.push({ role: 'assistant', content: answerText });
        this.renderAIPanel();
      } catch (err) {
        this.state.aiMessages.push({ role: 'assistant', content: `Error dispatching to GitHub: ${err.message}` });
        this.renderAIPanel();
      }
      return;
    }

    try {
      const resp = await API.post('/api/ai/query', {
        query: userText,
        business_context: this.state.activeBusiness
      });
      this.state.aiMessages.push({ role: 'assistant', content: resp.answer });
      this.renderAIPanel();
    } catch (err) {
      this.state.aiMessages.push({ role: 'assistant', content: `Error querying intelligence engine: ${err.message}` });
      this.renderAIPanel();
    }
  },

  async checkDeveloperStatus() {
    try {
      const res = await API.get('/api/developer/status');
      const runs = res.runs || [];
      this.openModal(`
        <div class="modal-header">
          <div class="modal-title">Live Autonomous Aider Builds</div>
          <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;">
          ${runs.length === 0 ? '<div style="padding: 20px; text-align: center; color: var(--color-mid-gray);">No recent GitHub Actions workflow runs found.</div>' : runs.map(r => `
            <div style="padding: 12px 16px; border-radius: 14px; background: var(--color-surface-alt); border: 1px solid var(--color-hairline);">
              <div class="flex-between">
                <div style="font-weight: 600; font-size: 13.5px;">${r.name}</div>
                <span class="badge ${r.conclusion === 'success' ? 'badge-success' : (r.status === 'in_progress' ? 'badge-warning' : 'badge-soft')}">${r.status || r.conclusion}</span>
              </div>
              <div style="font-size: 12px; color: var(--color-mid-gray); margin: 4px 0;">${r.head_commit}</div>
              <div class="flex-between" style="font-size: 11px; color: var(--color-mid-gray); margin-top: 6px;">
                <span>${new Date(r.created_at).toLocaleString()}</span>
                <a href="${r.html_url}" target="_blank" class="btn btn-sm btn-outline">View on GitHub</a>
              </div>
            </div>
          `).join('')}
        </div>
      `);
    } catch (e) {
      API.showToast('Could not fetch build status: ' + e.message, 'alert');
    }
  },

  openAIModal() {
    this.openModal(`
      <div class="modal-header">
        <div class="flex-gap">
          ${Icons.ai(20)}
          <div class="modal-title">COS Theta AI Command Assistant</div>
        </div>
        <button class="btn btn-icon btn-secondary" onclick="App.closeModal()">${Icons.close(16)}</button>
      </div>

      <div style="margin-bottom: 16px;">
        <form onsubmit="App.handleAIModalSend(event)">
          <input type="text" id="ai_modal_input" class="input" placeholder="Ask AI: e.g. What is today's revenue? or Which stock items are low?" autofocus required>
        </form>
      </div>

      <div id="ai_modal_results" style="max-height: 380px; overflow-y: auto; font-size: 13.5px; line-height: 1.5;">
        <div style="color: var(--color-mid-gray); padding: 20px; text-align: center;">
          Press Enter to query the intelligence engine.
        </div>
      </div>
    `);
  },

  async handleAIModalSend(e) {
    e.preventDefault();
    const query = document.getElementById('ai_modal_input').value;
    const resEl = document.getElementById('ai_modal_results');
    resEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-mid-gray);">Analyzing business telemetry...</div>';

    try {
      const resp = await API.post('/api/ai/query', {
        query: query,
        business_context: this.state.activeBusiness
      });
      resEl.innerHTML = `
        <div style="background: var(--color-surface-alt); padding: 18px; border-radius: 16px; border: 1px solid var(--color-hairline);">
          ${this.formatMarkdown(resp.answer)}
        </div>
      `;
    } catch (err) {
      resEl.innerHTML = `<div style="color: var(--color-ember);">Error querying AI: ${err.message}</div>`;
    }
  },

  async askAIPrompt(prompt) {
    document.getElementById('ai_input_panel').value = prompt;
    this.handleAISend(new Event('submit'));
  },

  async handleAISend(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById('ai_input_panel');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';
    this.state.aiMessages.push({ role: 'user', content: userText });
    this.renderAIPanel();

    try {
      const resp = await API.post('/api/ai/query', {
        query: userText,
        business_context: this.state.activeBusiness
      });
      this.state.aiMessages.push({ role: 'assistant', content: resp.answer });
      this.renderAIPanel();
    } catch (err) {
      this.state.aiMessages.push({ role: 'assistant', content: `Error querying intelligence engine: ${err.message}` });
      this.renderAIPanel();
    }
  },

  formatMarkdown(md) {
    if (!md) return '';
    return md
      .replace(/^### (.*$)/gim, '<h3 style="font-size: 15px; font-weight: 600; margin: 10px 0 6px 0;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="font-size: 16px; font-weight: 600; margin: 12px 0 8px 0;">$1</h2>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code style="background: var(--color-canvas); padding: 2px 5px; border-radius: 4px; font-family: var(--font-geist-mono); font-size: 12px;">$1</code>')
      .replace(/^\- (.*$)/gim, '<div style="margin-left: 12px; margin-bottom: 4px;">&bull; $1</div>')
      .replace(/\n\n/gim, '<div style="height: 8px;"></div>');
  },

  // ---------------- 11. SETTINGS & GOOGLE SERVICE ACCOUNT ----------------

  async renderSettings() {
    const mainEl = document.getElementById('page-content');
    const settings = await API.get('/api/settings');
    this.state.settings = settings;

    mainEl.innerHTML = `
      <div class="flex-between" style="margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.75px; color: var(--color-ink);">Settings & Cloud Integrations</h1>
          <p style="font-size: 14px; color: var(--color-mid-gray); margin-top: 4px;">Configure Google Service Account, Sheets mapping, Drive IDs, and AI curl endpoints.</p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 24px; max-width: 800px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Google Cloud Service Account Configuration</div>
          </div>
          <form onsubmit="App.handleSaveSettings(event)">
            <div class="form-group">
              <label class="form-label">Service Account Email</label>
              <input type="text" class="input" value="${settings.google_service_account_email || ''}" readonly style="color: var(--color-mid-gray);">
            </div>
            <div class="form-group">
              <label class="form-label">Paste Google Service Account JSON Key</label>
              <textarea id="set_sa_json" class="textarea" rows="3" placeholder='{"type": "service_account", "project_id": "...", "client_email": "..."}'></textarea>
              <div class="form-hint">Paste your Google Cloud service account JSON to enable live Google Sheets & Drive API bridge.</div>
            </div>
            <div class="grid-2" style="gap: 12px;">
              <div class="form-group">
                <label class="form-label">Zero7 Leads Google Sheet ID</label>
                <input type="text" id="set_sheet_id" class="input" value="${settings.sheets_id_zero7_leads || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Drive Central Vault Folder ID</label>
                <input type="text" id="set_drive_id" class="input" value="${settings.drive_root_folder_id || ''}">
              </div>
            </div>
            <div class="card-header" style="margin-top: 20px; border-top: 1px solid var(--color-hairline); padding-top: 16px;">
              <div class="card-title">Custom AI Curl / LLM API Endpoint</div>
            </div>
            <div class="grid-2" style="gap: 12px;">
              <div class="form-group">
                <label class="form-label">Custom AI Endpoint URL</label>
                <input type="text" id="set_ai_endpoint" class="input" placeholder="https://api.openai.com/v1/... or custom curl" value="${settings.custom_ai_endpoint || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">API Key / Token</label>
                <input type="password" id="set_ai_key" class="input" placeholder="sk-..." value="${settings.custom_ai_api_key || ''}">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 12px;">Save Configurations</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Database Export & Backup</div>
              <div class="card-description">Export full SQLite database to JSON format for offline backup or migration.</div>
            </div>
            <a href="/api/database/export" target="_blank" class="btn btn-outline">
              Download JSON Backup
            </a>
          </div>
        </div>
      </div>
    `;
  },

  async handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
      sheets_id_zero7_leads: document.getElementById('set_sheet_id').value,
      drive_root_folder_id: document.getElementById('set_drive_id').value,
      custom_ai_endpoint: document.getElementById('set_ai_endpoint').value,
      custom_ai_api_key: document.getElementById('set_ai_key').value,
      google_service_account_json: document.getElementById('set_sa_json').value || null
    };

    try {
      await API.put('/api/settings', payload);
      API.showToast('Settings saved successfully');
    } catch (err) {
      console.error(err);
    }
  },

  async syncAllGoogle() {
    try {
      await Promise.all([
        API.post('/api/integrations/sheets/sync'),
        API.post('/api/integrations/tasks/sync')
      ]);
      API.showToast('All Google Cloud services synchronized');
      this.renderDashboard();
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- MODAL MANAGEMENT ----------------

  openModal(html) {
    let backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'modal-backdrop';
      backdrop.className = 'modal-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    backdrop.classList.add('active');

    backdrop.onclick = (e) => {
      if (e.target === backdrop) App.closeModal();
    };
  },

  closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      setTimeout(() => backdrop.remove(), 200);
    }
  }
};

// Auto-boot application immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}
