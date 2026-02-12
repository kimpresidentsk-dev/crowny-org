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
                <h4>⚡ ${t('dashboard.shortcuts', '빠른 바로가기')}</h4>
                <div class="dash-shortcuts">
                    <button onclick="showPage('prop-trading')" class="dash-shortcut-btn">📊 ${t('section.prop_trading', 'TRADING')}</button>
                    <button onclick="showPage('messenger')" class="dash-shortcut-btn">💬 ${t('section.messenger', 'MESSENGER')}</button>
                    <button onclick="showPage('social')" class="dash-shortcut-btn">📸 ${t('section.social', 'SOCIAL')}</button>
                    <button onclick="showPage('wallet')" class="dash-shortcut-btn">💰 ${t('section.wallet', 'WALLET')}</button>
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
        </div>
    `;
}
