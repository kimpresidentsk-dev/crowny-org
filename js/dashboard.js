// ===== dashboard.js v1.0 - 대시보드 페이지 =====

async function loadDashboard() {
    console.log('[Dashboard] 로딩 시작, currentUser:', !!currentUser);
    if (!currentUser) {
        console.warn('[Dashboard] currentUser 없음 - 로딩 중단');
        return;
    }
    
    const container = document.getElementById('dashboard-content');
    if (!container) {
        console.warn('[Dashboard] dashboard-content 컨테이너 없음');
        return;
    }
    
    // 초기 로딩 표시
    container.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);"><i data-lucide="loader" style="width:16px;height:16px;display:inline-block;vertical-align:middle;animation:spin 1s linear infinite;"></i> 대시보드 로딩 중...</p>`;
    
    try {
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
    } catch(e) { console.warn("[catch]", e); }
    
    try {
        const orderSnap = await db.collection('orders')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(3).get();
        recentOrders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { console.warn("[catch]", e); }
    
    try {
        const socialSnap = await db.collection('social_notifications')
            .where('targetUid', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(5).get();
        recentSocial = socialSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { console.warn("[catch]", e); }
    
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
    } catch(e) { console.warn("[catch]", e); }
    
    // 6. Trading positions
    let positionSummary = '';
    if (typeof myParticipation !== 'undefined' && myParticipation) {
        const pos = myParticipation;
        positionSummary = `
            <div class="dash-card">
                <h4><i data-lucide="bar-chart-3" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('dashboard.trading_position', '트레이딩 포지션')}</h4>
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
                <h4><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('dashboard.portfolio', '토큰 포트폴리오')}</h4>
                <div class="dash-tokens">
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon"><i data-lucide="coins" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong>CRNY</strong><br><span class="dash-token-bal">${Number(onchain.crny || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon"><i data-lucide="target" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong>FNC</strong><br><span class="dash-token-bal">${Number(onchain.fnc || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="dash-token" onclick="showPage('wallet')">
                        <span class="dash-token-icon"><i data-lucide="link" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong>CRFN</strong><br><span class="dash-token-bal">${Number(onchain.crfn || 0).toLocaleString()}</span></div>
                    </div>
                    ${Object.entries(window.OFFCHAIN_TOKENS || {}).map(([key, tok]) => {
                        const iconMap = { CRTD: 'trending-up', CRAC: 'palette', CRGC: 'shopping-bag', CREB: 'leaf' };
                        const lucideIcon = iconMap[key] || 'circle';
                        return `
                        <div class="dash-token" onclick="showPage('wallet')">
                            <span class="dash-token-icon"><i data-lucide="${lucideIcon}" style="width:20px;height:20px;color:#8B6914;"></i></span>
                            <div><strong>${key}</strong><br><span class="dash-token-bal">${Number(offchain[key] || 0).toLocaleString()}</span></div>
                        </div>`;
                    }).join('')}
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
                    <span><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${o.productTitle || t('dashboard.order', '주문')}</span>
                    <span>${o.status || ''}</span>
                </div>`).join('')}
            </div>
            
            <!-- Notifications -->
            <div class="dash-card">
                <h4><i data-lucide="bell" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('dashboard.notifications', '알림')} <span class="dash-badge">${unread}</span></h4>
                ${recentNotifs.length === 0 ? `<p class="dash-empty">${t('dashboard.no_notifications', '새 알림 없음')}</p>` : ''}
                ${recentNotifs.map(n => `<div class="dash-notif-item ${n.read ? '' : 'unread'}">${n.message || n.text || ''}</div>`).join('')}
            </div>
            
            <!-- Quick Shortcuts -->
            <div class="dash-card">
                <h4 style="display:flex;align-items:center;justify-content:space-between;">
                    <span>⚡ ${t('dashboard.shortcuts', '빠른 바로가기')}</span>
                    <button onclick="editShortcuts()" style="background:none;border:none;cursor:pointer;font-size:1rem;opacity:0.6;" title="${t('dashboard.edit_shortcuts','편집')}"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                </h4>
                <div class="dash-shortcuts" id="dash-shortcuts-container">
                    ${renderShortcuts()}
                </div>
            </div>
            
            <!-- Crowny Stats -->
            <div class="dash-card">
                <h4><i data-lucide="trending-up" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('dashboard.stats', '크라우니 통계')}</h4>
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
            <div class="dash-card" style="background:#3D2B1F;color:#FFF8F0;">
                <h4 style="color:#8B6914;">🎉 ${t('invite.title', '친구 초대')}</h4>
                <p style="font-size:0.85rem;opacity:0.9;margin-bottom:0.8rem;">${t('invite.card_desc', '친구를 초대하고 CRTD 리워드를 받으세요!')}</p>
                <button onclick="if(typeof INVITE!=='undefined')INVITE.showInviteModal()" style="width:100%;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">
                    📨 ${t('invite.invite_friends', '친구 초대하기')}
                </button>
            </div>
        </div>
    `;
    // Lucide 아이콘 렌더링
    if (window.lucide) lucide.createIcons();
    console.log('[Dashboard] 로딩 성공 완료');
    } catch(e) {
        console.error('[Dashboard] 로딩 중 에러:', e);
        container.innerHTML = `<div style="text-align:center;padding:2rem;">
            <h2><i data-lucide="bar-chart-3" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></i> DASHBOARD</h2>
            <p style="margin-top:1rem;color:var(--text);">환영합니다, ${currentUser?.email?.split('@')[0] || 'Guest'}님!</p>
            
            <div style="background:var(--bg-card);border-radius:12px;padding:1.5rem;margin:1.5rem 0;text-align:left;">
                <h4 style="color:var(--text);margin-bottom:1rem;"><i data-lucide="zap" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 빠른 바로가기</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                    <button onclick="showPage('wallet')" style="background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:var(--text);font-weight:600;font-size:0.9rem;">
                        <i data-lucide="coins" style="width:18px;height:18px;color:var(--gold);"></i> WALLET
                    </button>
                    <button onclick="showPage('social')" style="background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:var(--text);font-weight:600;font-size:0.9rem;">
                        <i data-lucide="camera" style="width:18px;height:18px;color:var(--gold);"></i> SOCIAL
                    </button>
                    <button onclick="showPage('mall')" style="background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:var(--text);font-weight:600;font-size:0.9rem;">
                        <i data-lucide="shopping-cart" style="width:18px;height:18px;color:var(--gold);"></i> MALL
                    </button>
                    <button onclick="showPage('prop-trading')" style="background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:var(--text);font-weight:600;font-size:0.9rem;">
                        <i data-lucide="trending-up" style="width:18px;height:18px;color:var(--gold);"></i> TRADING
                    </button>
                </div>
            </div>
            
            <div style="background:linear-gradient(135deg,#3D2B1F,#6B5744);color:#FFF8F0;border-radius:12px;padding:1.2rem;margin-top:1.5rem;">
                <h4 style="color:#8B6914;margin-bottom:0.5rem;"><i data-lucide="info" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 대시보드 로딩 중...</h4>
                <p style="font-size:0.85rem;opacity:0.9;">토큰 포트폴리오와 최근 활동 데이터를 불러오는 중입니다.</p>
                <button onclick="loadDashboard()" style="background:#8B6914;color:#FFF8F0;border:none;border-radius:6px;padding:0.6rem 1.2rem;margin-top:0.8rem;cursor:pointer;font-weight:600;font-size:0.85rem;">
                    <i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 다시 시도
                </button>
            </div>
        </div>`;
        
        // Lucide 아이콘 렌더링 (fallback UI용)
        if (window.lucide) lucide.createIcons();
        console.log('[Dashboard] 에러 발생으로 개선된 fallback UI 로드됨');
    }
}

// ========== Quick Shortcuts (사용자 커스텀) ==========

const ALL_PAGES = [
    { id:'dashboard', icon:'<i data-lucide="bar-chart-3"></i>', label:'DASHBOARD' },
    { id:'today', icon:'<i data-lucide="home"></i>', label:'TODAY' },
    { id:'messenger', icon:'<i data-lucide="message-circle"></i>', label:'MESSENGER' },
    { id:'social', icon:'<i data-lucide="camera"></i>', label:'SOCIAL' },
    { id:'wallet', icon:'<i data-lucide="coins"></i>', label:'WALLET' },
    { id:'prop-trading', icon:'<i data-lucide="trending-up"></i>', label:'PROP TRADING' },
    { id:'credit', icon:'<i data-lucide="credit-card"></i>', label:'CREDIT' },
    { id:'mall', icon:'<i data-lucide="shopping-cart"></i>', label:'MALL' },
    { id:'art', icon:'<i data-lucide="palette"></i>', label:'ART' },
    { id:'books', icon:'<i data-lucide="book-open"></i>', label:'BOOKS' },
    { id:'artist', icon:'<i data-lucide="star"></i>', label:'ARTIST' },
    { id:'energy', icon:'<i data-lucide="zap"></i>', label:'ENERGY' },
    { id:'business', icon:'<i data-lucide="building"></i>', label:'BUSINESS' },
    { id:'fundraise', icon:'<i data-lucide="heart"></i>', label:'FUNDRAISE' },
    { id:'settings', icon:'<i data-lucide="settings"></i>', label:'SETTINGS' },
];

const DEFAULT_SHORTCUTS = ['prop-trading','messenger','social','wallet'];

function getShortcuts() {
    try {
        const saved = localStorage.getItem('crowny_shortcuts');
        if (saved) return JSON.parse(saved);
    } catch(e) { console.warn("[catch]", e); }
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
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const items = ALL_PAGES.map(p => {
        const checked = current.includes(p.id) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid #F7F3ED;cursor:pointer;">
            <input type="checkbox" value="${p.id}" ${checked} style="width:18px;height:18px;accent-color:var(--gold,#8B6914);">
            <span style="font-size:1rem;">${p.icon}</span>
            <span style="font-size:0.9rem;font-weight:500;">${p.label}</span>
        </label>`;
    }).join('');

    modal.innerHTML = `<div style="background:#FFF8F0;border-radius:12px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;padding:1.2rem;">
        <h3 style="margin-bottom:0.8rem;">⚡ ${t('dashboard.edit_shortcuts','바로가기 편집')}</h3>
        <p style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">${t('dashboard.shortcut_hint','원하는 메뉴를 선택하세요 (최대 8개)')}</p>
        <div id="shortcut-checklist">${items}</div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="saveShortcutEdit()" style="flex:1;background:#3D2B1F;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','저장')}</button>
            <button onclick="document.getElementById('shortcut-edit-modal').remove()" style="flex:1;background:#E8E0D8;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;">${t('common.cancel','취소')}</button>
        </div>
        <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid #E8E0D8;">
            <p style="font-size:0.75rem;color:#6B5744;">💡 ${t('dashboard.share_hint','각 페이지는 링크로 공유 가능합니다')}</p>
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
