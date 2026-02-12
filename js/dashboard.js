// ===== dashboard.js v1.0 - 대시보드 페이지 =====

async function loadDashboard() {
    if (!currentUser) return;
    
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    
    // 1. Welcome + Avatar
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const nickname = userData.nickname || userData.displayName || currentUser.email?.split('@')[0] || t('social.user', '사용자');
    const photoURL = userData.photoURL || '';
    
    // 2. Token balances
    const offchain = (userWallet && userWallet.offchainBalances) || {};
    const onchain = (userWallet && userWallet.balances) || { crny: 0, fnc: 0, crfn: 0 };
    
    // 3. Recent activity
    let recentTx = [];
    let recentOrders = [];
    let recentSocial = [];
    
    try {
        const txSnap = await db.collection('transactions')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(5).get();
        recentTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
    
    try {
        const orderSnap = await db.collection('orders')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(3).get();
        recentOrders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
    
    try {
        const socialSnap = await db.collection('social_notifications')
            .where('targetUid', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(5).get();
        recentSocial = socialSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
    
    // 4. Notifications
    const unread = (typeof unreadCount !== 'undefined') ? unreadCount : 0;
    const recentNotifs = (typeof notifications !== 'undefined') ? notifications.slice(0, 3) : [];
    
    // 5. Stats
    let totalUsers = '—';
    let totalTx = '—';
    try {
        const statsDoc = await db.collection('admin_config').doc('stats').get();
        if (statsDoc.exists) {
            const s = statsDoc.data();
            totalUsers = s.totalUsers || '—';
            totalTx = s.totalTransactions || '—';
        }
    } catch(e) {}
    
    // 6. Trading positions
    let positionSummary = '';
    if (typeof myParticipation !== 'undefined' && myParticipation) {
        const pos = myParticipation;
        positionSummary = `
            <div class="dash-card">
                <h4>📊 ${t('dashboard.trading_position', '트레이딩 포지션')}</h4>
                <p>${t('dashboard.balance', '잔고')}: <strong>$${(pos.balance || 0).toLocaleString()}</strong></p>
                <p>${t('dashboard.pnl', '수익')}: <strong style="color:${(pos.totalPnl || 0) >= 0 ? '#2e7d32' : '#c62828'}">$${(pos.totalPnl || 0).toFixed(2)}</strong></p>
                <button onclick="showPage('prop-trading')" class="dash-shortcut-btn">→ ${t('dashboard.go_trading', '트레이딩으로')}</button>
            </div>`;
    }
    
    // Build HTML
    container.innerHTML = `
        <div class="dash-welcome">
            <div class="dash-avatar-wrap">
                ${photoURL ? `<img src="${photoURL}" class="dash-avatar" loading="lazy">` : '<div class="dash-avatar-placeholder">👤</div>'}
            </div>
            <div>
                <h2>${t('dashboard.welcome', '환영합니다')}, ${nickname}!</h2>
                <p class="dash-subtitle">${t('dashboard.subtitle', '크라우니에서의 활동을 한눈에 확인하세요')}</p>
            </div>
        </div>
        
        <div class="dash-grid">
            <!-- Token Portfolio -->
            <div class="dash-card dash-card-wide">
                <h4>💎 ${t('dashboard.portfolio', '토큰 포트폴리오')}</h4>
                <div class="dash-tokens">
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon">🪙</span>
                        <div><strong>CRNY</strong><br><span class="dash-token-bal">${Number(onchain.crny || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon">🎯</span>
                        <div><strong>FNC</strong><br><span class="dash-token-bal">${Number(onchain.fnc || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon">🔗</span>
                        <div><strong>CRFN</strong><br><span class="dash-token-bal">${Number(onchain.crfn || 0).toLocaleString()}</span></div>
                    </div>
                    ${Object.entries(window.OFFCHAIN_TOKENS || {}).map(([key, tok]) => `
                        <div class="dash-token" onclick="showPage('wallet')">
                            <span class="dash-token-icon">${tok.icon}</span>
                            <div><strong>${key}</strong><br><span class="dash-token-bal">${Number(offchain[key] || 0).toLocaleString()}</span></div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="dash-card">
                <h4>📋 ${t('dashboard.recent_activity', '최근 활동')}</h4>
                ${recentTx.length === 0 && recentOrders.length === 0 ? `<p class="dash-empty">${t('dashboard.no_activity', '최근 활동이 없습니다')}</p>` : ''}
                ${recentTx.map(tx => `<div class="dash-activity-item">
                    <span>${tx.type === 'send' ? '📤' : '📥'} ${tx.tokenKey || 'CRNY'}</span>
                    <span>${Number(tx.amount || 0).toLocaleString()}</span>
                </div>`).join('')}
                ${recentOrders.map(o => `<div class="dash-activity-item">
                    <span>🛒 ${o.productTitle || t('dashboard.order', '주문')}</span>
                    <span>${o.status || ''}</span>
                </div>`).join('')}
            </div>
            
            <!-- Notifications -->
            <div class="dash-card">
                <h4>🔔 ${t('dashboard.notifications', '알림')} <span class="dash-badge">${unread}</span></h4>
                ${recentNotifs.length === 0 ? `<p class="dash-empty">${t('dashboard.no_notifications', '새 알림 없음')}</p>` : ''}
                ${recentNotifs.map(n => `<div class="dash-notif-item ${n.read ? '' : 'unread'}">${n.message || n.text || ''}</div>`).join('')}
            </div>
            
            <!-- Quick Shortcuts -->
            <div class="dash-card">
                <h4 style="display:flex;align-items:center;justify-content:space-between;">
                    <span>⚡ ${t('dashboard.shortcuts', '빠른 바로가기')}</span>
                    <button onclick="editShortcuts()" style="background:none;border:none;cursor:pointer;font-size:1rem;opacity:0.6;" title="${t('dashboard.edit_shortcuts','편집')}">✏️</button>
                </h4>
                <div class="dash-shortcuts" id="dash-shortcuts-container">
                    ${renderShortcuts()}
                </div>
            </div>
            
            <!-- Crowny Stats -->
            <div class="dash-card">
                <h4>📈 ${t('dashboard.stats', '크라우니 통계')}</h4>
                <div class="dash-stat-row">
                    <span>${t('dashboard.total_users', '전체 사용자')}</span>
                    <strong>${totalUsers}</strong>
                </div>
                <div class="dash-stat-row">
                    <span>${t('dashboard.total_tx', '전체 거래')}</span>
                    <strong>${totalTx}</strong>
                </div>
            </div>
            
            ${positionSummary}
            
            <!-- Invite Friends Card -->
            <div class="dash-card" style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;">
                <h4 style="color:#D4AF37;">🎉 ${t('invite.title', '친구 초대')}</h4>
                <p style="font-size:0.85rem;opacity:0.9;margin-bottom:0.8rem;">${t('invite.card_desc', '친구를 초대하고 CRTD 리워드를 받으세요!')}</p>
                <button onclick="if(typeof INVITE!=='undefined')INVITE.showInviteModal()" style="width:100%;padding:0.7rem;background:#D4AF37;color:#1a1a2e;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">
                    📨 ${t('invite.invite_friends', '친구 초대하기')}
                </button>
            </div>
        </div>
    `;
}

// ========== Quick Shortcuts (사용자 커스텀) ==========

const ALL_PAGES = [
    { id:'dashboard', icon:'📊', label:'DASHBOARD' },
    { id:'today', icon:'🏠', label:'TODAY' },
    { id:'messenger', icon:'💬', label:'MESSENGER' },
    { id:'social', icon:'📸', label:'SOCIAL' },
    { id:'wallet', icon:'💰', label:'WALLET' },
    { id:'prop-trading', icon:'📈', label:'PROP TRADING' },
    { id:'credit', icon:'💳', label:'CREDIT' },
    { id:'mall', icon:'🛒', label:'MALL' },
    { id:'art', icon:'🎨', label:'ART' },
    { id:'books', icon:'📚', label:'BOOKS' },
    { id:'artist', icon:'🌟', label:'ARTIST' },
    { id:'energy', icon:'⚡', label:'ENERGY' },
    { id:'business', icon:'🏢', label:'BUSINESS' },
    { id:'fundraise', icon:'💝', label:'FUNDRAISE' },
    { id:'settings', icon:'⚙️', label:'SETTINGS' },
];

const DEFAULT_SHORTCUTS = ['prop-trading','messenger','social','wallet'];

function getShortcuts() {
    try {
        const saved = localStorage.getItem('crowny_shortcuts');
        if (saved) return JSON.parse(saved);
    } catch(e) {}
    return DEFAULT_SHORTCUTS;
}

function saveShortcuts(list) {
    localStorage.setItem('crowny_shortcuts', JSON.stringify(list));
}

function renderShortcuts() {
    const ids = getShortcuts();
    return ids.map(id => {
        const p = ALL_PAGES.find(x => x.id === id);
        if (!p) return '';
        const url = `${location.origin}${location.pathname}#page=${id}`;
        return `<button onclick="showPage('${id}')" class="dash-shortcut-btn" title="${url}">${p.icon} ${p.label}</button>`;
    }).join('');
}

async function editShortcuts() {
    const current = getShortcuts();
    const modal = document.createElement('div');
    modal.id = 'shortcut-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const items = ALL_PAGES.map(p => {
        const checked = current.includes(p.id) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;cursor:pointer;">
            <input type="checkbox" value="${p.id}" ${checked} style="width:18px;height:18px;accent-color:var(--gold,#D4AF37);">
            <span style="font-size:1rem;">${p.icon}</span>
            <span style="font-size:0.9rem;font-weight:500;">${p.label}</span>
        </label>`;
    }).join('');

    modal.innerHTML = `<div style="background:white;border-radius:12px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;padding:1.2rem;">
        <h3 style="margin-bottom:0.8rem;">⚡ ${t('dashboard.edit_shortcuts','바로가기 편집')}</h3>
        <p style="font-size:0.8rem;color:#888;margin-bottom:1rem;">${t('dashboard.shortcut_hint','원하는 메뉴를 선택하세요 (최대 8개)')}</p>
        <div id="shortcut-checklist">${items}</div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="saveShortcutEdit()" style="flex:1;background:#0066cc;color:white;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','저장')}</button>
            <button onclick="document.getElementById('shortcut-edit-modal').remove()" style="flex:1;background:#eee;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;">${t('common.cancel','취소')}</button>
        </div>
        <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid #eee;">
            <p style="font-size:0.75rem;color:#888;">💡 ${t('dashboard.share_hint','각 페이지는 링크로 공유 가능합니다')}</p>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

function saveShortcutEdit() {
    const checks = document.querySelectorAll('#shortcut-checklist input[type=checkbox]:checked');
    const selected = Array.from(checks).map(c => c.value).slice(0, 8);
    if (selected.length === 0) { showToast(t('dashboard.select_one','최소 1개를 선택하세요'), 'warning'); return; }
    saveShortcuts(selected);
    const container = document.getElementById('dash-shortcuts-container');
    if (container) container.innerHTML = renderShortcuts();
    document.getElementById('shortcut-edit-modal')?.remove();
    showToast('⚡ ' + t('dashboard.shortcuts_saved','바로가기 저장 완료!'), 'success');
}

// ========== URL Anchor Routing ==========

function handleHashRoute() {
    const hash = location.hash;
    if (!hash) return;
    // invite hash 처리
    if (hash.includes('invite=') && typeof INVITE !== 'undefined') {
        INVITE.handleInviteHash();
        return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const page = params.get('page');
    if (page && typeof showPage === 'function') {
        showPage(page);
        // product-detail with id
        if (page === 'product-detail') {
            const id = params.get('id');
            if (id && typeof renderProductDetail === 'function') renderProductDetail(id);
        }
        // store page with sellerId
        if (page === 'store') {
            const sellerId = params.get('sellerId');
            if (sellerId && typeof renderStorePage === 'function') renderStorePage(sellerId);
        }
        // buyer orders
        if (page === 'buyer-orders' && typeof loadBuyerOrders === 'function') loadBuyerOrders();
        // brand landing
        if (page === 'brand-landing') {
            const brand = params.get('brand');
            if (brand && typeof renderBrandLanding === 'function') renderBrandLanding(brand);
        }
    }
}

window.addEventListener('hashchange', handleHashRoute);
// 초기 로드 시에도 체크 (로그인 후)
document.addEventListener('crownyReady', handleHashRoute);
// 즉시 체크 (이미 로그인된 경우)
if (document.readyState === 'complete') setTimeout(handleHashRoute, 500);
