// ===== settings.js v1.0 - 설정 페이지 =====

async function loadSettings() {
    if (!currentUser) return;
    const container = document.getElementById('settings-content');
    if (!container) return;
    
    // Load user data
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const notifSettings = userData.notificationSettings || { messages: true, social: true, trading: true };
    const currentLang = localStorage.getItem('crowny-lang') || 'ko';
    const currentTheme = localStorage.getItem('crowny-theme') || 'light';
    
    container.innerHTML = `
        <div class="settings-grid">
            <!-- Profile -->
            <div class="settings-card">
                <h4>👤 ${t('settings.profile', '프로필 설정')}</h4>
                <p>${t('settings.nickname', '닉네임')}: <strong>${userData.nickname || '—'}</strong></p>
                <p>${t('settings.status', '상태 메시지')}: ${userData.statusMessage || '—'}</p>
                <button onclick="showProfileEdit()" class="settings-btn">${t('settings.edit_profile', '✏️ 프로필 편집')}</button>
            </div>
            
            <!-- Notifications -->
            <div class="settings-card">
                <h4>🔔 ${t('settings.notifications', '알림 설정')}</h4>
                <label class="settings-toggle">
                    <span>${t('settings.msg_notif', '새 메시지 알림')}</span>
                    <input type="checkbox" id="notif-messages" ${notifSettings.messages !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    <span class="toggle-slider"></span>
                </label>
                <label class="settings-toggle">
                    <span>${t('settings.social_notif', '소셜 알림')}</span>
                    <input type="checkbox" id="notif-social" ${notifSettings.social !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    <span class="toggle-slider"></span>
                </label>
                <label class="settings-toggle">
                    <span>${t('settings.trading_notif', '거래 알림')}</span>
                    <input type="checkbox" id="notif-trading" ${notifSettings.trading !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <!-- Language -->
            <div class="settings-card">
                <h4>🌐 ${t('settings.language', '언어 설정')}</h4>
                <div class="settings-lang-list">
                    ${[
                        ['ko', '🇰🇷 한국어'],
                        ['en', '🇺🇸 English'],
                        ['ja', '🇯🇵 日本語'],
                        ['zh', '🇨🇳 中文'],
                        ['es', '🇪🇸 Español']
                    ].map(([code, label]) => `
                        <label class="settings-radio">
                            <input type="radio" name="lang" value="${code}" ${currentLang === code ? 'checked' : ''} onchange="changeLanguageSetting('${code}')">
                            <span>${label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            
            <!-- Theme -->
            <div class="settings-card">
                <h4>🎨 ${t('settings.theme', '테마 설정')}</h4>
                <label class="settings-toggle">
                    <span>${t('settings.dark_mode', '다크 모드')}</span>
                    <input type="checkbox" id="theme-toggle" ${currentTheme === 'dark' ? 'checked' : ''} onchange="toggleTheme()">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <!-- Privacy -->
            <div class="settings-card">
                <h4>🔒 ${t('settings.privacy', '개인정보')}</h4>
                <button onclick="exportMyData()" class="settings-btn">${t('settings.export_data', '📥 내 데이터 다운로드')}</button>
                <button onclick="requestDeactivation()" class="settings-btn settings-btn-danger">${t('settings.deactivate', '⚠️ 계정 비활성화 요청')}</button>
            </div>
            
            <!-- Security -->
            <div class="settings-card">
                <h4>🛡️ ${t('settings.security', '보안')}</h4>
                <button onclick="resetPassword()" class="settings-btn">${t('settings.change_password', '🔑 비밀번호 변경')}</button>
                <p style="font-size:0.8rem; color:var(--accent); margin-top:0.5rem;">
                    ${t('settings.wallet_encryption', '지갑 암호화')}: 
                    <strong style="color:#2e7d32;">AES-GCM ✅</strong>
                </p>
            </div>
        </div>
    `;
}

async function saveNotifSettings() {
    if (!currentUser) return;
    const settings = {
        messages: document.getElementById('notif-messages')?.checked !== false,
        social: document.getElementById('notif-social')?.checked !== false,
        trading: document.getElementById('notif-trading')?.checked !== false,
    };
    try {
        await db.collection('users').doc(currentUser.uid).update({ notificationSettings: settings });
        if (typeof showToast === 'function') showToast(t('settings.saved', '저장됨'), 'success');
    } catch(e) {
        console.error('Failed to save notification settings:', e);
    }
}

function changeLanguageSetting(lang) {
    localStorage.setItem('crowny-lang', lang);
    if (typeof setLanguage === 'function') setLanguage(lang);
    if (typeof showToast === 'function') showToast(t('settings.lang_changed', '언어가 변경되었습니다'), 'success');
}

function toggleTheme() {
    const isDark = document.getElementById('theme-toggle')?.checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crowny-theme', theme);
}

// Init theme on load
function initTheme() {
    let theme = localStorage.getItem('crowny-theme');
    if (!theme) {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
}

async function exportMyData() {
    if (!currentUser) return;
    if (typeof showLoading === 'function') showLoading(t('settings.exporting', '데이터 내보내는 중...'));
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const data = { profile: userDoc.exists ? userDoc.data() : {}, exportedAt: new Date().toISOString() };
        
        // Remove sensitive fields
        delete data.profile.encryptedPrivateKey;
        delete data.profile.wallets;
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `crowny-data-${currentUser.uid}.json`;
        a.click(); URL.revokeObjectURL(url);
    } catch(e) {
        console.error('Export failed:', e);
    }
    if (typeof hideLoading === 'function') hideLoading();
}

async function requestDeactivation() {
    if (!currentUser) return;
    const confirmed = typeof showConfirmModal === 'function' 
        ? await showConfirmModal(t('settings.deactivate', '계정 비활성화'), t('settings.deactivate_confirm', '정말 계정을 비활성화 하시겠습니까?'))
        : confirm(t('settings.deactivate_confirm', '정말 계정을 비활성화 하시겠습니까?'));
    if (!confirmed) return;
    try {
        await db.collection('deactivation_requests').add({
            uid: currentUser.uid,
            email: currentUser.email,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (typeof showToast === 'function') showToast(t('settings.deactivate_requested', '비활성화 요청이 접수되었습니다'), 'info');
    } catch(e) {
        console.error('Deactivation request failed:', e);
    }
}

// Init theme immediately
initTheme();
