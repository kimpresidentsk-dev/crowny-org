// ===== social.js - 유저데이터, 레퍼럴, 메신저, 소셜피드 (v16.0 - 숏폼+크로스서비스) =====

// Truncate wallet addresses (0x...) in text
function truncateWalletAddresses(text) {
    if (!text) return text;
    return text.replace(/0x[a-fA-F0-9]{30,}/g, (addr) => addr.slice(0, 6) + '...' + addr.slice(-4));
}

// ========== USER PROFILE MANAGEMENT ==========
async function loadUserData() {
    if (!currentUser) return;
    updatePresence(true);
    startPresenceHeartbeat();
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
}

// ========== ONLINE PRESENCE ==========
let presenceInterval = null;

async function updatePresence(isOnline) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            isOnline: isOnline,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.warn('Presence update failed:', e); }
}

function startPresenceHeartbeat() {
    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = setInterval(() => updatePresence(true), 5 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') updatePresence(false);
        else updatePresence(true);
    });
    window.addEventListener('beforeunload', () => updatePresence(false));
}

// Get user display info (nickname + photo)
async function getUserDisplayInfo(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) return { nickname: t('social.unknown','알 수 없음'), photoURL: '', email: '', isOnline: false, lastSeen: null };
        const data = doc.data();
        return {
            nickname: data.nickname || data.displayName || data.email?.split('@')[0] || t('social.user','사용자'),
            photoURL: data.photoURL || '',
            email: data.email || '',
            statusMessage: data.statusMessage || '',
            isOnline: data.isOnline || false,
            lastSeen: data.lastSeen?.toDate?.() || null
        };
    } catch (e) {
        return { nickname: t('social.unknown','알 수 없음'), photoURL: '', email: '', isOnline: false, lastSeen: null };
    }
}

// Profile avatar HTML helper
function avatarHTML(photoURL, nickname, size = 40) {
    if (photoURL) {
        return `<img src="${photoURL}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0;" alt="${nickname}">`;
    }
    const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
    const color = colors[(nickname || '').charCodeAt(0) % colors.length];
    const initial = (nickname || '?').charAt(0).toUpperCase();
    return `<div style="width:${size}px; height:${size}px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:${size*0.45}px; font-weight:700; color:white; flex-shrink:0;">${initial}</div>`;
}

function onlineDotHTML(isOnline) {
    return `<span class="online-dot ${isOnline ? 'online' : 'offline'}"></span>`;
}

// Show profile edit modal
async function showProfileEdit() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const data = userDoc.data() || {};

    const overlay = document.createElement('div');
    overlay.id = 'profile-edit-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:white;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;">${t('social.edit_profile','✏️ 프로필 편집')}</h3>
        <div style="text-align:center; margin-bottom:1rem;">
            <div id="profile-preview-avatar" style="display:inline-block;">${avatarHTML(data.photoURL, data.nickname, 80)}</div>
            <div style="margin-top:0.5rem;">
                <label for="profile-photo-input" style="color:#0066cc; cursor:pointer; font-size:0.85rem; font-weight:600;">${t('social.change_photo','📷 사진 변경')}</label>
                <input type="file" id="profile-photo-input" accept="image/*" style="display:none;" onchange="previewProfilePhoto(this)">
            </div>
        </div>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:#666;">${t('auth.nickname_title','닉네임')}</label>
                <input type="text" id="profile-edit-nickname" value="${data.nickname || ''}" placeholder="${t('auth.nickname_title','닉네임')}" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:#666;">${t('social.status_msg','상태 메시지')}</label>
                <input type="text" id="profile-edit-status" value="${data.statusMessage || ''}" placeholder="${t('social.status_msg','상태 메시지')}" maxlength="50" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <p style="font-size:0.75rem; color:#999;">${t('auth.email','이메일')}: ${data.email}</p>
            <div style="margin-top:0.8rem; padding-top:0.8rem; border-top:1px solid #eee; display:grid; gap:0.5rem;">
                <p style="font-size:0.8rem; font-weight:600; color:#333; margin-bottom:0.2rem;">${t('social.login_method','🔐 로그인 방법')}</p>
                ${currentUser && currentUser.providerData.some(p => p.providerId === 'google.com') ? `
                <p style="font-size:0.75rem; color:#4CAF50;">${t('social.google_linked','✅ Google 계정 연동됨')}</p>` : `
                <button onclick="linkGoogleAccount(); document.getElementById('profile-edit-modal').remove();" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:16px;height:16px;"> ${t('social.link_google','Google 계정 연동')}
                </button>`}
                ${currentUser && currentUser.providerData.some(p => p.providerId === 'password') ? `
                <p style="font-size:0.75rem; color:#4CAF50;">${t('social.pw_login_set','✅ 이메일/비밀번호 로그인 설정됨')}</p>
                <button onclick="changePasswordFromProfile()" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;font-size:0.85rem;">${t('auth.change_pw','🔑 비밀번호 변경')}</button>` : `
                <button onclick="setupPasswordFromProfile()" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;font-size:0.85rem;">${t('social.setup_pw','🔑 비밀번호 설정 (이메일 로그인 추가)')}</button>`}
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="document.getElementById('profile-edit-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">${t('common.cancel','취소')}</button>
            <button onclick="saveProfile()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#1a1a2e;color:white;font-weight:700;">${t('common.save','저장')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

function previewProfilePhoto(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('profile-preview-avatar').innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`;
    };
    reader.readAsDataURL(input.files[0]);
}

async function saveProfile() {
    const nickname = document.getElementById('profile-edit-nickname').value.trim();
    const statusMessage = document.getElementById('profile-edit-status').value.trim();
    const photoInput = document.getElementById('profile-photo-input');

    if (!nickname) { showToast(t('social.enter_nickname','닉네임을 입력하세요'), 'warning'); return; }

    try {
        showLoading(t('social.saving_profile','프로필 저장 중...'));
        const updates = { nickname, statusMessage };

        if (photoInput.files[0]) {
            const file = photoInput.files[0];
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            updates.photoURL = await resizeImage(dataUrl, 200);
        }

        await db.collection('users').doc(currentUser.uid).update(updates);
        hideLoading();
        showToast(t('social.profile_saved','✅ 프로필 저장 완료!'), 'success');
        document.getElementById('profile-edit-modal')?.remove();

        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = nickname;
    } catch (e) {
        hideLoading();
        showToast(t('social.save_fail','저장 실패: ') + e.message, 'error');
    }
}

// 소개자 보상 안내문구 동적 로드
async function loadReferralRewardDesc() {
    try {
        const doc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = doc.exists ? doc.data() : {};
        const r = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        const parts = [];
        if (r.crtd) parts.push(`${r.crtd} CRTD`);
        if (r.crac) parts.push(`${r.crac} CRAC`);
        if (r.crgc) parts.push(`${r.crgc} CRGC`);
        if (r.creb) parts.push(`${r.creb} CREB`);
        const descEl = document.getElementById('referral-reward-desc');
        if (descEl && parts.length > 0) {
            descEl.textContent = `친구 초대 시 ${parts.join(' + ')} 즉시 지급!`;
        }
    } catch (e) {
        console.warn('소개자 보상 안내 로드 실패:', e);
    }
}

// 소개자 정보 로드
async function loadReferralInfo() {
    if (!currentUser) return;
    loadReferralRewardDesc();
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();
        
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) {
            if (data.referralCode) {
                const nick = data.referralNickname || data.nickname || '';
                codeEl.textContent = nick ? `${nick} (${data.referralCode})` : data.referralCode;
            } else {
                codeEl.textContent = t('social.not_generated','미생성');
            }
        }
        
        const nickEditEl = document.getElementById('referral-nick-edit');
        if (nickEditEl) nickEditEl.style.display = data.referralCode ? 'inline-block' : 'none';
        
        const countEl = document.getElementById('my-referral-count');
        if (countEl) countEl.textContent = `${data.referralCount || 0}명`;
        
        const earnings = data.referralEarnings || {};
        const tokenKeys = ['crny','fnc','crfn','crtd','crac','crgc','creb'];
        for (const tk of tokenKeys) {
            const el = document.getElementById(`referral-earn-${tk}`);
            if (el) el.textContent = earnings[tk] || 0;
        }
        
        const pendingEl = document.getElementById('referral-pending-rewards');
        if (pendingEl) {
            try {
                const pending = await db.collection('users').doc(currentUser.uid)
                    .collection('pendingRewards').where('released', '==', false).get();
                let pendingHTML = '';
                if (!pending.empty) {
                    pending.forEach(doc => {
                        const r = doc.data();
                        const releaseDate = r.releaseDate?.toDate ? r.releaseDate.toDate().toLocaleDateString('ko-KR') : '--';
                        pendingHTML += `<div style="font-size:0.75rem;color:#e65100;">⏳ ${r.amount} ${(r.token||'').toUpperCase()} → ${releaseDate}</div>`;
                    });
                }
                pendingEl.innerHTML = pendingHTML || '<div style="font-size:0.75rem;color:#999;">대기 중인 보상 없음</div>';
            } catch (e) {
                pendingEl.innerHTML = '';
            }
        }

        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = data.nickname || data.email;
    } catch (error) {
        console.error('소개자 정보 로드 실패:', error);
    }
}

async function editReferralNickname() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const data = userDoc.data() || {};
    const newNick = await showPromptModal(
        t('social.edit_referral_nick', '소개 닉네임 변경'),
        t('social.enter_referral_nick', '표시될 소개 닉네임을 입력하세요:'),
        data.referralNickname || data.nickname || ''
    );
    if (!newNick || !newNick.trim()) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ referralNickname: newNick.trim() });
        showToast(t('social.nick_changed', '✅ 소개 닉네임 변경 완료'), 'success');
        loadReferralInfo();
    } catch (e) {
        showToast(t('social.nick_change_fail', '변경 실패: ') + e.message, 'error');
    }
}

async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    if (!code || code === t('social.not_generated','미생성')) { showToast(t('social.generate_first','먼저 소개 코드를 생성하세요'), 'warning'); return; }
    try {
        await navigator.clipboard.writeText(code);
        showToast(`📋 ${t('social.code_copied','소개 코드 복사됨')}: ${code}`, 'success');
    } catch (e) {
        await showPromptModal(t('auth.referral_title','소개 코드'), t('social.copy_code','소개 코드를 복사하세요'), code);
    }
}

// ========== MESSENGER ==========
let currentChat = null;
let currentChatOtherId = null;
let chatUnsubscribe = null;
let chatDocUnsubscribe = null;
let typingTimeout = null;
let cachedChatDocs = [];
let msgLongPressTimer = null;

function showChats() {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
}

function showContacts() {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'block';
    loadContacts();
}

// ===== Contact Add Modal (email + nickname search) =====
async function showAddContactModal() {
    const overlay = document.createElement('div');
    overlay.id = 'add-contact-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:white;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;">${t('social.add_contact','➕ 연락처 추가')}</h3>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;">
            <input type="text" id="contact-search-input" placeholder="${t('social.search_email_nick','이메일 또는 닉네임 검색')}" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;">
            <button onclick="searchContactUsers()" style="padding:0.7rem 1rem;border:none;border-radius:8px;background:#1a1a2e;color:white;font-weight:600;cursor:pointer;">${t('social.search','검색')}</button>
        </div>
        <div id="contact-search-results" style="max-height:300px;overflow-y:auto;"></div>
        <div style="margin-top:1rem;text-align:right;">
            <button onclick="document.getElementById('add-contact-modal').remove()" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">${t('common.cancel','취소')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('contact-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchContactUsers();
    });
    document.getElementById('contact-search-input').focus();
}

async function searchContactUsers() {
    const query = document.getElementById('contact-search-input').value.trim();
    const resultsDiv = document.getElementById('contact-search-results');
    if (!query) { resultsDiv.innerHTML = `<p style="text-align:center;color:#999;font-size:0.85rem;">${t('social.enter_search','검색어를 입력하세요')}</p>`; return; }

    resultsDiv.innerHTML = '<p style="text-align:center;color:var(--accent);">🔍 검색 중...</p>';

    try {
        const results = new Map();

        // Search by email
        const emailSnap = await db.collection('users').where('email', '==', query).get();
        emailSnap.forEach(doc => results.set(doc.id, doc));

        // Search by nickname (prefix match)
        const nickSnap = await db.collection('users')
            .where('nickname', '>=', query)
            .where('nickname', '<=', query + '\uf8ff')
            .limit(10).get();
        nickSnap.forEach(doc => results.set(doc.id, doc));

        resultsDiv.innerHTML = '';
        if (results.size === 0) {
            resultsDiv.innerHTML = `<p style="text-align:center;color:#999;font-size:0.85rem;">${t('social.no_results','검색 결과가 없습니다')}</p>`;
            return;
        }

        for (const [uid, doc] of results) {
            if (uid === currentUser.uid) continue;
            const data = doc.data();
            const nick = data.nickname || data.email?.split('@')[0] || '사용자';
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:0.8rem;padding:0.7rem;border-bottom:1px solid #eee;';
            el.innerHTML = `
                ${avatarHTML(data.photoURL, nick, 40)}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:0.9rem;">${nick}</strong> ${onlineDotHTML(data.isOnline)}
                    <p style="font-size:0.75rem;color:#999;margin:0;">${data.email || ''}</p>
                </div>
                <button onclick="addContactFromSearch('${uid}','${(data.email||'').replace(/'/g,"\\'")}','${nick.replace(/'/g,"\\'")}')" style="padding:0.4rem 0.8rem;border:none;border-radius:6px;background:#1a1a2e;color:white;font-size:0.8rem;cursor:pointer;">추가</button>`;
            resultsDiv.appendChild(el);
        }
    } catch (e) {
        resultsDiv.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

async function addContactFromSearch(uid, email, name) {
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('contacts').doc(uid).set({ email, name, addedAt: new Date() });
        showToast(t('social.contact_added','✅ 연락처에 추가되었습니다'), 'success');
        document.getElementById('add-contact-modal')?.remove();
        loadContacts();
    } catch (e) {
        showToast(t('social.add_fail','추가 실패: ') + e.message, 'error');
    }
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    contactList.innerHTML = '<p style="padding:1rem; text-align:center; color:var(--accent);">📋 로딩 중...</p>';
    const contacts = await db.collection('users').doc(currentUser.uid).collection('contacts').get();
    contactList.innerHTML = '';

    if (contacts.empty) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--accent);">
                <p style="font-size:2.5rem; margin-bottom:0.8rem;">👥</p>
                <p style="font-size:0.95rem; margin-bottom:0.5rem;">${t('social.no_contacts','연락처가 없습니다')}</p>
                <button onclick="showAddContactModal()" class="btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem;">${t('social.add_contact_btn','➕ 연락처 추가')}</button>
            </div>`;
        return;
    }

    for (const doc of contacts.docs) {
        const contact = doc.data();
        const info = await getUserDisplayInfo(doc.id);
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div style="position:relative;">
                ${avatarHTML(info.photoURL, info.nickname, 44)}
                <span class="online-dot ${info.isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:0;right:0;"></span>
            </div>
            <div class="contact-info" style="flex:1;min-width:0;overflow:hidden;">
                <strong style="font-size:0.95rem;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${info.nickname}</strong>
                <p style="font-size:0.7rem; margin:0.1rem 0; color:var(--accent); opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${info.statusMessage || (info.lastSeen ? getTimeAgo(info.lastSeen) : '')}</p>
            </div>
            <div style="display:flex; gap:0.3rem; flex-direction:column;">
                <button onclick='startChatWithContact("${contact.email}")' class="btn-chat" style="font-size:0.8rem; padding:0.4rem 0.6rem;">${t('social.chat','채팅')}</button>
                <button onclick='deleteContact("${doc.id}", "${info.nickname}")' style="background:none; border:1px solid #fcc; border-radius:4px; padding:0.2rem 0.5rem; font-size:0.7rem; cursor:pointer; color:#c00;">🗑️</button>
            </div>`;
        contactList.appendChild(contactItem);
    }
}

async function startChatWithContact(email) {
    try {
        await startNewChat(email);
        document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sidebar-tabs .tab-btn')[0].classList.add('active');
        document.getElementById('chats-view').style.display = 'block';
        document.getElementById('contacts-view').style.display = 'none';
        showPage('messenger');
    } catch (error) {
        console.error('Chat start error:', error);
        showToast(t('social.chat_fail','채팅 시작 실패'), 'error');
    }
}

async function showNewChatModal() {
    const email = await showPromptModal(t('social.new_chat','새 채팅'), t('social.chat_email','채팅할 사용자 이메일'), '');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        if (otherEmail === currentUser.email) { showToast(t('social.no_self_chat','자기 자신과는 채팅할 수 없습니다'), 'warning'); return; }
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        if (users.empty) { showToast(t('social.user_not_found','사용자를 찾을 수 없습니다'), 'error'); return; }
        const otherUser = users.docs[0];
        const otherId = otherUser.id;
        const existingChat = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
        let chatId = null;
        for (const doc of existingChat.docs) {
            if (doc.data().participants.includes(otherId)) { chatId = doc.id; break; }
        }
        if (!chatId) {
            const newChat = await db.collection('chats').add({
                participants: [currentUser.uid, otherId],
                lastMessage: '', lastMessageTime: new Date(), createdAt: new Date(),
                unreadCount: {}, typing: {}
            });
            chatId = newChat.id;
        }
        await loadMessages();
        await openChat(chatId, otherId);
    } catch (error) {
        console.error('Start chat error:', error);
        showToast(t('social.chat_fail','채팅 시작 실패') + ': ' + error.message, 'error');
    }
}

// ===== Chat list search (filter) =====
function filterChatList(query) {
    const items = document.querySelectorAll('#chat-list .chat-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
    });
}

// ===== Format message time =====
function formatMsgTime(date) {
    if (!date) return '';
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = h % 12 || 12;
    return `${ampm} ${h12}:${m}`;
}

function formatDateLabel(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const days = ['일','월','화','수','목','금','토'];
    return `${y}년 ${m}월 ${d}일 ${days[date.getDay()]}요일`;
}

// ===== Load chat list =====
async function loadMessages() {
    if (!currentUser) return;
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    chatList.innerHTML = '';
    const chats = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
    if (chats.empty) { chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat','채팅을 시작하세요')}</p>`; return; }

    cachedChatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis?.() || 0;
        const bTime = b.data().lastMessageTime?.toMillis?.() || 0;
        return bTime - aTime;
    });

    for (const doc of cachedChatDocs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        const info = await getUserDisplayInfo(otherId);
        const unread = (chat.unreadCount && chat.unreadCount[currentUser.uid]) || 0;
        const lastTime = chat.lastMessageTime?.toDate?.();

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = doc.id;
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            <div style="position:relative;">
                ${avatarHTML(info.photoURL, info.nickname, 44)}
                <span class="online-dot ${info.isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:0;right:0;"></span>
            </div>
            <div class="chat-preview" style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${info.nickname}</strong>
                    ${lastTime ? `<span class="chat-time">${getTimeAgo(lastTime)}</span>` : ''}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <p style="flex:1;min-width:0;">${chat.lastMessage || t('social.no_messages','메시지 없음')}</p>
                    ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                </div>
            </div>`;
        chatList.appendChild(chatItem);
    }
}

// ===== Open chat =====
async function openChat(chatId, otherId) {
    if (chatUnsubscribe) chatUnsubscribe();
    if (chatDocUnsubscribe) chatDocUnsubscribe();
    currentChat = chatId;
    currentChatOtherId = otherId;

    // Mobile: show chat window
    const container = document.getElementById('messenger-container');
    if (container) container.classList.add('chat-open');

    const info = await getUserDisplayInfo(otherId);
    document.getElementById('chat-username').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;">
            ${avatarHTML(info.photoURL, info.nickname, 32)}
            <div>
                <strong>${info.nickname}</strong> ${onlineDotHTML(info.isOnline)}
                ${info.statusMessage ? `<div style="font-size:0.7rem;color:var(--accent);">${info.statusMessage}</div>` : ''}
            </div>
        </div>`;
    document.getElementById('chat-header-actions').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = 'flex';

    // Mark my unread as 0
    try {
        await db.collection('chats').doc(chatId).update({
            [`unreadCount.${currentUser.uid}`]: 0
        });
    } catch (e) { /* ignore */ }

    // Update chat list badge
    const chatItemEl = document.querySelector(`.chat-item[data-chat-id="${chatId}"] .unread-badge`);
    if (chatItemEl) chatItemEl.remove();

    // Listen for typing indicator from chat doc
    chatDocUnsubscribe = db.collection('chats').doc(chatId).onSnapshot((snap) => {
        const data = snap.data();
        if (!data) return;
        const typing = data.typing || {};
        const otherTyping = typing[otherId];
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.style.display = otherTyping ? 'flex' : 'none';
    });

    // Listen for messages
    chatUnsubscribe = db.collection('chats').doc(chatId)
        .collection('messages').orderBy('timestamp')
        .onSnapshot(async (snapshot) => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            if (snapshot.empty) {
                messagesDiv.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('social.send_first','메시지를 보내보세요!')}</p>`;
            }
            const senderCache = {};
            let lastDateStr = '';

            // Mark unread messages as read
            const unreadDocs = [];
            for (const doc of snapshot.docs) {
                const msg = doc.data();
                if (msg.senderId !== currentUser.uid && !(msg.readBy || []).includes(currentUser.uid)) {
                    unreadDocs.push(doc.ref);
                }
            }
            // Batch mark as read
            if (unreadDocs.length > 0) {
                const batch = db.batch();
                for (const ref of unreadDocs) {
                    batch.update(ref, { readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
                }
                batch.commit().catch(() => {});
            }

            for (const doc of snapshot.docs) {
                const msg = doc.data();
                const msgId = doc.id;
                const isMine = msg.senderId === currentUser.uid;
                const timestamp = msg.timestamp?.toDate?.() || new Date();

                // Date separator
                const dateStr = formatDateLabel(timestamp);
                if (dateStr !== lastDateStr) {
                    lastDateStr = dateStr;
                    const sep = document.createElement('div');
                    sep.className = 'date-separator';
                    sep.innerHTML = `<span>${dateStr}</span>`;
                    messagesDiv.appendChild(sep);
                }

                if (!senderCache[msg.senderId]) senderCache[msg.senderId] = await getUserDisplayInfo(msg.senderId);
                const senderInfo = senderCache[msg.senderId];

                const msgEl = document.createElement('div');
                msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;
                msgEl.dataset.msgId = msgId;

                // Build content
                let content = '';
                if (msg.deleted) {
                    content = `<span class="msg-deleted">🚫 ${t('social.msg_deleted','이 메시지는 삭제되었습니다')}</span>`;
                } else {
                    if (msg.imageUrl) {
                        content += `<img src="${msg.imageUrl}" style="max-width:200px;border-radius:8px;cursor:pointer;display:block;margin-bottom:0.3rem;" onclick="window.open('${msg.imageUrl}','_blank')">`;
                    }
                    if (msg.tokenAmount) {
                        content += `<div style="background:linear-gradient(135deg,#FFD700,#FFA000);color:#333;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;">💰 ${msg.tokenAmount} ${msg.tokenType}</div>`;
                    }
                    if (msg.text) content += `<span>${msg.text}</span>`;
                }

                // Read receipt for my messages
                let readReceipt = '';
                if (isMine && !msg.deleted) {
                    const readBy = msg.readBy || [];
                    const isRead = readBy.includes(otherId);
                    readReceipt = `<span class="msg-read-receipt ${isRead ? 'read' : 'sent'}">${isRead ? '✓✓' : '✓'}</span>`;
                }

                // Reactions display
                let reactionsHTML = '';
                if (msg.reactions && !msg.deleted) {
                    const entries = Object.entries(msg.reactions);
                    if (entries.length > 0) {
                        reactionsHTML = '<div class="msg-reactions">';
                        for (const [emoji, uids] of entries) {
                            if (!uids || uids.length === 0) continue;
                            const isMineReaction = uids.includes(currentUser.uid);
                            reactionsHTML += `<span class="msg-reaction-chip ${isMineReaction ? 'mine' : ''}" onclick="toggleReaction('${msgId}','${emoji}')">${emoji} ${uids.length > 1 ? uids.length : ''}</span>`;
                        }
                        reactionsHTML += '</div>';
                    }
                }

                // Action buttons (reaction + delete)
                let actionsHTML = '';
                if (!msg.deleted) {
                    const side = isMine ? 'left' : 'right';
                    actionsHTML = `<div class="msg-actions-bar ${side}" id="actions-${msgId}">`;
                    actionsHTML += `<button class="msg-action-btn" onclick="showReactionPicker('${msgId}')">😊</button>`;
                    if (isMine) actionsHTML += `<button class="msg-action-btn" onclick="deleteMessage('${msgId}')">🗑️</button>`;
                    actionsHTML += '</div>';
                }

                msgEl.innerHTML = `
                    ${!isMine ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : ''}
                    <div style="max-width:70%;" class="msg-actions-wrapper"
                        ontouchstart="msgTouchStart('${msgId}')" ontouchend="msgTouchEnd()" ontouchmove="msgTouchEnd()">
                        ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                        ${actionsHTML}
                        <div style="background:${isMine ? 'var(--text)' : '#f0f0f0'};color:${isMine ? 'white' : 'var(--text)'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                        ${reactionsHTML}
                        <div class="msg-time" style="${isMine ? 'justify-content:flex-end;' : ''}">${formatMsgTime(timestamp)}${readReceipt}</div>
                    </div>`;
                messagesDiv.appendChild(msgEl);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

    // Setup textarea typing events
    setupTypingListener();
}

// ===== Mobile: close chat, back to list =====
function closeChatMobile() {
    const container = document.getElementById('messenger-container');
    if (container) container.classList.remove('chat-open');
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
    currentChat = null;
    currentChatOtherId = null;
}

// ===== Typing indicator =====
function setupTypingListener() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.removeEventListener('input', handleTypingInput);
    input.addEventListener('input', handleTypingInput);
}

function handleTypingInput() {
    if (!currentChat || !currentUser) return;
    setTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTyping(false), 3000);
}

function setTyping(val) {
    if (!currentChat) return;
    db.collection('chats').doc(currentChat).update({
        [`typing.${currentUser.uid}`]: val
    }).catch(() => {});
}

// ===== Message input: Enter to send, Shift+Enter for newline =====
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e) => {
        const input = document.getElementById('message-input');
        if (!input || e.target !== input) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});

// Auto-resize textarea
document.addEventListener('input', (e) => {
    if (e.target.id === 'message-input' && e.target.tagName === 'TEXTAREA') {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
});

// ===== Send message =====
async function sendMessage() {
    if (!currentChat) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    setTyping(false);
    clearTimeout(typingTimeout);

    await db.collection('chats').doc(currentChat).collection('messages').add({
        senderId: currentUser.uid, text: text, timestamp: new Date(), readBy: [currentUser.uid]
    });

    // Update chat doc
    await db.collection('chats').doc(currentChat).update({
        lastMessage: text,
        lastMessageTime: new Date(),
        [`unreadCount.${currentChatOtherId}`]: firebase.firestore.FieldValue.increment(1)
    });

    // Notification for recipient
    try {
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        await db.collection('users').doc(currentChatOtherId).collection('notifications').add({
            type: 'messenger',
            message: `💬 ${myInfo.nickname}: ${text.substring(0, 50)}`,
            data: { chatId: currentChat, otherId: currentUser.uid },
            read: false,
            createdAt: new Date()
        });
    } catch (e) { /* notification is best-effort */ }

    input.value = '';
    input.style.height = 'auto';
}

// ===== Send image =====
async function sendChatImage() {
    if (!currentChat) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        if (!input.files[0]) return;
        try {
            showLoading(t('social.sending_image','이미지 전송 중...'));
            const file = input.files[0];
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            const resized = await resizeImage(dataUrl, 800);

            await db.collection('chats').doc(currentChat).collection('messages').add({
                senderId: currentUser.uid, text: '', imageUrl: resized, timestamp: new Date(), readBy: [currentUser.uid]
            });
            await db.collection('chats').doc(currentChat).update({
                lastMessage: '📷 사진',
                lastMessageTime: new Date(),
                [`unreadCount.${currentChatOtherId}`]: firebase.firestore.FieldValue.increment(1)
            });
            hideLoading();
            showToast(t('social.image_sent','📷 이미지 전송 완료'), 'success');
        } catch (e) {
            hideLoading();
            showToast(t('social.image_fail','이미지 전송 실패: ') + e.message, 'error');
        }
    };
    input.click();
}

// ===== Token send =====
async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    if (!userWallet || !currentWalletId) { showToast(t('social.connect_wallet','지갑을 먼저 연결하세요'), 'warning'); return; }

    const tokenChoice = await showPromptModal(t('social.select_token','토큰 선택'),
        '온체인:\n1. CRNY (' + (userWallet.balances?.crny || 0).toFixed(2) + ')\n' +
        '2. FNC (' + (userWallet.balances?.fnc || 0).toFixed(2) + ')\n' +
        '3. CRFN (' + (userWallet.balances?.crfn || 0).toFixed(2) + ')\n\n' +
        '오프체인:\n4. CRTD (' + (userWallet.offchainBalances?.crtd || 0) + ' pt)\n' +
        '5. CRAC (' + (userWallet.offchainBalances?.crac || 0) + ' pt)\n' +
        '6. CRGC (' + (userWallet.offchainBalances?.crgc || 0) + ' pt)\n' +
        '7. CREB (' + (userWallet.offchainBalances?.creb || 0) + ' pt)', '1');
    if (!tokenChoice) return;

    const tokenMap = { '1':'crny', '2':'fnc', '3':'crfn', '4':'crtd', '5':'crac', '6':'crgc', '7':'creb' };
    const tokenKey = tokenMap[tokenChoice];
    if (!tokenKey) { showToast(t('social.invalid_choice','잘못된 선택'), 'error'); return; }

    const isOffchain = isOffchainToken(tokenKey);
    const tokenName = tokenKey.toUpperCase();
    const balance = isOffchain ? (userWallet.offchainBalances?.[tokenKey] || 0) : (userWallet.balances?.[tokenKey] || 0);

    const amount = await showPromptModal(t('social.send_amount','전송 수량'), `${t('social.amount_to_send','전송할')} ${tokenName} (${t('social.balance','잔액')}: ${balance})`, '');
    if (!amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        showToast(t('social.insufficient','잔액이 부족하거나 잘못된 수량입니다'), 'error'); return;
    }
    const message = await showPromptModal(t('social.message','메시지'), t('social.msg_optional','메시지 (선택)'), '') || '';

    try {
        if (isOffchain) {
            const recipientDoc = await db.collection('users').doc(currentChatOtherId).get();
            const recipientOff = recipientDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(currentUser.uid).update({ [`offchainBalances.${tokenKey}`]: balance - amountNum });
            userWallet.offchainBalances[tokenKey] = balance - amountNum;
            await db.collection('users').doc(currentChatOtherId).update({ [`offchainBalances.${tokenKey}`]: (recipientOff[tokenKey] || 0) + amountNum });
        } else {
            await db.collection('users').doc(currentUser.uid).collection('wallets').doc(currentWalletId)
                .update({ [`balances.${tokenKey}`]: balance - amountNum });
            userWallet.balances[tokenKey] = balance - amountNum;
            const recipientWallets = await db.collection('users').doc(currentChatOtherId).collection('wallets').limit(1).get();
            if (!recipientWallets.empty) {
                const rBal = recipientWallets.docs[0].data().balances || {};
                await recipientWallets.docs[0].ref.update({ [`balances.${tokenKey}`]: (rBal[tokenKey] || 0) + amountNum });
            }
        }
        await db.collection('chats').doc(currentChat).collection('messages').add({
            senderId: currentUser.uid, text: message, tokenAmount: amountNum, tokenType: tokenName, timestamp: new Date(), readBy: [currentUser.uid]
        });
        await db.collection('chats').doc(currentChat).update({
            lastMessage: `💰 ${amountNum} ${tokenName} 전송`,
            lastMessageTime: new Date(),
            [`unreadCount.${currentChatOtherId}`]: firebase.firestore.FieldValue.increment(1)
        });
        await db.collection('transactions').add({ from: currentUser.uid, to: currentChatOtherId, amount: amountNum, token: tokenName, type: isOffchain ? 'messenger_offchain' : 'messenger_onchain', message, timestamp: new Date() });
        updateBalances();
        showToast(`✅ ${amountNum} ${tokenName} ${t('social.sent','전송 완료!')}`, 'success');
    } catch (error) {
        console.error('메신저 토큰 전송 실패:', error);
        showToast(t('social.send_fail','전송 실패: ') + error.message, 'error');
    }
}

// ===== Message delete (soft) =====
async function deleteMessage(msgId) {
    if (!currentChat) return;
    if (!await showConfirmModal(t('social.delete_msg','메시지 삭제'), t('social.confirm_delete_msg','이 메시지를 삭제하시겠습니까?'))) return;
    try {
        await db.collection('chats').doc(currentChat).collection('messages').doc(msgId).update({ deleted: true, text: '', imageUrl: null, tokenAmount: null, reactions: {} });
        showToast(t('social.msg_deleted_toast','메시지가 삭제되었습니다'), 'info');
    } catch (e) {
        showToast(t('social.delete_fail','삭제 실패'), 'error');
    }
}

// ===== Reactions =====
function showReactionPicker(msgId) {
    // Remove any existing picker
    document.querySelectorAll('.reaction-picker-popup').forEach(el => el.remove());

    const emojis = ['👍','❤️','😂','😮','😢','🔥'];
    const picker = document.createElement('div');
    picker.className = 'reaction-picker-popup';
    picker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid #ddd;border-radius:24px;padding:6px 10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;display:flex;gap:4px;';
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = 'font-size:1.4rem;background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:8px;transition:transform 0.1s;';
        btn.onmouseenter = () => btn.style.transform = 'scale(1.3)';
        btn.onmouseleave = () => btn.style.transform = 'scale(1)';
        btn.onclick = () => { toggleReaction(msgId, emoji); picker.remove(); };
        picker.appendChild(btn);
    });

    document.body.appendChild(picker);
    setTimeout(() => {
        const dismiss = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function toggleReaction(msgId, emoji) {
    if (!currentChat) return;
    const msgRef = db.collection('chats').doc(currentChat).collection('messages').doc(msgId);
    const msgDoc = await msgRef.get();
    if (!msgDoc.exists) return;
    const reactions = msgDoc.data().reactions || {};
    const uids = reactions[emoji] || [];
    if (uids.includes(currentUser.uid)) {
        // Remove my reaction
        reactions[emoji] = uids.filter(u => u !== currentUser.uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
        reactions[emoji] = [...uids, currentUser.uid];
    }
    await msgRef.update({ reactions });
}

// ===== Long press for mobile =====
function msgTouchStart(msgId) {
    msgLongPressTimer = setTimeout(() => {
        const actionsBar = document.getElementById('actions-' + msgId);
        if (actionsBar) {
            actionsBar.classList.toggle('show');
            setTimeout(() => actionsBar.classList.remove('show'), 4000);
        }
    }, 500);
}

function msgTouchEnd() {
    clearTimeout(msgLongPressTimer);
}

// ===== Chat message search =====
function toggleChatSearch() {
    const overlay = document.getElementById('chat-search-overlay');
    if (overlay.style.display === 'none') {
        overlay.style.display = 'flex';
        document.getElementById('msg-search-input').focus();
    } else {
        closeChatSearch();
    }
}

function closeChatSearch() {
    document.getElementById('chat-search-overlay').style.display = 'none';
    document.getElementById('msg-search-input').value = '';
    // Remove highlights
    document.querySelectorAll('.msg-highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
    });
}

function searchMessagesInChat(query) {
    // Remove old highlights first
    document.querySelectorAll('.msg-highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
    });
    if (!query.trim()) return;

    const msgs = document.getElementById('chat-messages');
    const walker = document.createTreeWalker(msgs, NodeFilter.SHOW_TEXT, null, false);
    const q = query.toLowerCase();
    const nodes = [];
    while (walker.nextNode()) {
        if (walker.currentNode.textContent.toLowerCase().includes(q)) {
            nodes.push(walker.currentNode);
        }
    }
    for (const node of nodes) {
        const text = node.textContent;
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const before = text.substring(0, idx);
        const match = text.substring(idx, idx + query.length);
        const after = text.substring(idx + query.length);
        const span = document.createElement('span');
        span.innerHTML = `${before}<span class="msg-highlight">${match}</span>${after}`;
        node.parentNode.replaceChild(span, node);
    }
    // Scroll to first match
    const first = msgs.querySelector('.msg-highlight');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== Chat menu (leave/delete) =====
function showChatMenu() {
    document.querySelectorAll('.chat-menu-dropdown').forEach(el => el.remove());
    const header = document.getElementById('chat-header');
    const menu = document.createElement('div');
    menu.className = 'chat-menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '48px';
    menu.style.right = '8px';
    menu.innerHTML = `
        <button class="chat-menu-item danger" onclick="leaveChat()">🚪 ${t('social.leave_chat','채팅방 나가기')}</button>`;
    header.style.position = 'relative';
    header.appendChild(menu);
    setTimeout(() => {
        const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function leaveChat() {
    if (!currentChat) return;
    if (!await showConfirmModal(t('social.leave_chat','채팅방 나가기'), t('social.confirm_leave','이 채팅방을 나가시겠습니까? 대화 내역이 삭제됩니다.'))) return;
    try {
        // Remove self from participants
        await db.collection('chats').doc(currentChat).update({
            participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
        if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
        currentChat = null;
        currentChatOtherId = null;
        closeChatMobile();
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-actions').style.display = 'none';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-username').innerHTML = `<div class="chat-empty-state"><div style="font-size:3rem;margin-bottom:1rem;">💬</div><p>채팅을 선택하세요</p></div>`;
        showToast(t('social.left_chat','채팅방을 나갔습니다'), 'info');
        loadMessages();
    } catch (e) {
        showToast(t('social.leave_fail','나가기 실패: ') + e.message, 'error');
    }
}

// ========== INSTAGRAM-STYLE SOCIAL FEED ==========
async function loadSocialFeed() {
    if (!currentUser) return;
    const feed = document.getElementById('social-feed');
    if (!feed) return;
    feed.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--accent);">📸 게시물 로딩 중...</p>';

    try {
        const posts = await db.collection('posts').limit(50).get();
        const sortedPosts = posts.docs.sort((a, b) => (b.data().timestamp?.toMillis?.() || 0) - (a.data().timestamp?.toMillis?.() || 0));
        feed.innerHTML = '';

        if (sortedPosts.length === 0) {
            feed.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                <p style="font-size:1.1rem;">${t('social.no_posts','아직 게시물이 없습니다')}</p>
                <p style="font-size:0.85rem;">${t('social.write_first','첫 게시물을 작성해보세요!')}</p></div>`;
            return;
        }

        // Collect video posts for shorts viewer
        _shortsVideoPosts = [];

        for (const doc of sortedPosts) {
            const post = doc.data();

            // Apply filter (shorts tab)
            const currentFilter = document.querySelector('.social-filter-tab.active')?.dataset?.filter;
            if (currentFilter === 'shorts' && !post.videoUrl) continue;

            const userInfo = await getUserDisplayInfo(post.userId);
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const commentCount = post.commentCount || 0;
            const isMyPost = post.userId === currentUser.uid;

            if (post.videoUrl) {
                _shortsVideoPosts.push({ id: doc.id, data: post, nickname: userInfo.nickname });
            }

            // Media HTML (image or video)
            let mediaHTML = '';
            if (post.videoUrl) {
                const filterStyle = post.videoFilter ? `filter:${post.videoFilter};` : '';
                const textOverlay = post.videoTextOverlay || '';
                const textPos = post.videoTextPosition || 'bottom';
                const textColor = post.videoTextColor || '#ffffff';
                const posCSS = textPos === 'top' ? 'top:10%' : textPos === 'center' ? 'top:45%' : 'bottom:10%';
                mediaHTML = `<div style="margin:0 -1.2rem;position:relative;background:#000;cursor:pointer;" onclick="openShortsViewer('${doc.id}')">
                    <video src="${post.videoUrl}" style="width:100%;display:block;max-height:400px;object-fit:contain;${filterStyle}" muted playsinline preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause();this.currentTime=0;"></video>
                    ${textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${posCSS};font-size:1.1rem;font-weight:700;color:${textColor};text-shadow:0 2px 4px rgba(0,0,0,0.8);pointer-events:none;">${textOverlay}</div>` : ''}
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.4);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="color:white;font-size:1.5rem;margin-left:4px;">▶</span></div>
                    ${post.duration ? `<span style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;">${Math.floor(post.duration)}s</span>` : ''}
                </div>`;
            } else if (post.imageUrl) {
                mediaHTML = `<div style="margin:0 -1.2rem;"><img src="${post.imageUrl}" style="width:100%;display:block;" loading="lazy"></div>`;
            }

            // Service link HTML
            let serviceLinkHTML = '';
            if (post.serviceLink) {
                const sl = post.serviceLink;
                const cfg = SERVICE_LINK_CONFIG[sl.type] || {};
                serviceLinkHTML = `<div style="margin:0.5rem 0;"><button onclick="navigateServiceLink('${sl.type}','${sl.id}')" style="width:100%;padding:0.6rem;border:none;border-radius:10px;background:${cfg.color || '#333'};color:white;font-weight:700;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.4rem;">${cfg.action || sl.action} — ${sl.title || ''}</button></div>`;
            }

            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.innerHTML = `
                <div class="post-header">
                    ${avatarHTML(userInfo.photoURL, userInfo.nickname, 36)}
                    <div class="post-info" style="flex:1;">
                        <strong>${userInfo.nickname}</strong>
                        <span>${timeAgo}</span>
                    </div>
                    ${isMyPost ? `<button onclick="deletePost('${doc.id}')" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#999;" title="삭제">⋯</button>` : ''}
                </div>
                ${mediaHTML}
                ${serviceLinkHTML}
                <div class="post-actions-bar" style="display:flex;align-items:center;gap:1.2rem;padding:0.6rem 0;">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})" class="post-action-btn" style="background:none;border:none;cursor:pointer;font-size:1.3rem;padding:0;line-height:1;display:flex;align-items:center;gap:0.3rem;transition:transform 0.15s;" onmousedown="this.style.transform='scale(1.1)'" onmouseup="this.style.transform='scale(1)'">${likedByMe ? '❤️' : '🤍'}<span style="font-size:0.85rem;color:var(--text);font-weight:600;">${likeCount || ''}</span></button>
                    <button onclick="toggleComments('${doc.id}')" class="post-action-btn" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:0;line-height:1;display:flex;align-items:center;gap:0.3rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span style="font-size:0.85rem;color:var(--text);font-weight:600;">${commentCount || ''}</span></button>
                    <button onclick="sharePost('${doc.id}')" class="post-action-btn" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:0;line-height:1;display:flex;align-items:center;gap:0.3rem;">📤<span style="font-size:0.85rem;color:var(--text);font-weight:600;">${post.shareCount || ''}</span></button>
                </div>
                <div style="font-size:0.85rem;">
                    ${likeCount > 0 ? `<div style="font-weight:700;margin-bottom:0.2rem;cursor:pointer;" onclick="showLikedUsers('${doc.id}')">${t('social.likes','좋아요')} ${likeCount}${t('social.count','개')}</div>` : ''}
                    ${post.text ? `<div><strong style="margin-right:0.3rem;">${userInfo.nickname}</strong>${truncateWalletAddresses(post.text)}</div>` : ''}
                    ${commentCount > 0 ? `<div style="color:var(--accent);margin-top:0.2rem;cursor:pointer;" onclick="toggleComments('${doc.id}')">${t('social.view_comments','댓글')} ${commentCount}${t('social.count','개')} ${t('social.view_all','모두 보기')}</div>` : ''}
                </div>
                <div id="comments-${doc.id}" style="display:none; margin-top:0.8rem; border-top:1px solid var(--border); padding-top:0.6rem;">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.5rem; align-items:center;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="${t('social.add_comment','댓글 달기...')}" style="flex:1; padding:0.5rem; border:none; border-bottom:1px solid var(--border); font-size:0.85rem; outline:none;" onkeypress="if(event.key==='Enter')addComment('${doc.id}')">
                        <button onclick="addComment('${doc.id}')" style="background:none;border:none;color:#0066cc;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('social.post','게시')}</button>
                    </div>
                </div>`;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `<div style="text-align:center; padding:3rem;">
            <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
            <p style="color:red;">${error.message}</p>
            <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">${t('common.refresh','새로고침')}</button></div>`;
    }
}

async function toggleLike(postId, isLiked) {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const data = post.data();
    let likedBy = data.likedBy || [];
    let likes = data.likes || 0;
    if (isLiked) {
        likedBy = likedBy.filter(uid => uid !== currentUser.uid);
        likes = Math.max(0, likes - 1);
    } else {
        likedBy.push(currentUser.uid);
        likes += 1;
    }
    await postRef.update({ likedBy, likes });
    loadSocialFeed();
}

async function showLikedUsers(postId) {
    const post = await db.collection('posts').doc(postId).get();
    const likedBy = post.data().likedBy || [];
    if (likedBy.length === 0) { showToast(t('social.no_likes','아직 좋아요가 없습니다'), 'info'); return; }
    let message = '';
    for (const uid of likedBy) {
        const info = await getUserDisplayInfo(uid);
        message += `${info.nickname}\n`;
    }
    await showConfirmModal(t('social.likes','좋아요'), message);
}

async function toggleComments(postId) {
    const div = document.getElementById(`comments-${postId}`);
    if (div.style.display === 'none') { div.style.display = 'block'; await loadComments(postId); }
    else div.style.display = 'none';
}

async function loadComments(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    list.innerHTML = '';
    const comments = await db.collection('posts').doc(postId).collection('comments').orderBy('timestamp', 'asc').get();
    if (comments.empty) { list.innerHTML = `<p style="text-align:center; color:var(--accent); font-size:0.8rem;">${t('social.first_comment','첫 댓글을 남겨보세요!')}</p>`; return; }
    for (const doc of comments.docs) {
        const c = doc.data();
        const info = await getUserDisplayInfo(c.userId);
        const el = document.createElement('div');
        el.style.cssText = 'margin-bottom:0.4rem; font-size:0.85rem; line-height:1.4;';
        el.innerHTML = `<strong style="margin-right:0.3rem;">${info.nickname}</strong>${truncateWalletAddresses(c.text)} <span style="font-size:0.7rem; color:var(--accent);">${getTimeAgo(c.timestamp.toDate())}</span>`;
        list.appendChild(el);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    if (!text) return;
    await db.collection('posts').doc(postId).collection('comments').add({ userId: currentUser.uid, text, timestamp: new Date() });
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    await postRef.update({ commentCount: (post.data().commentCount || 0) + 1 });
    input.value = '';
    await loadComments(postId);
    loadSocialFeed();
}

async function deletePost(postId) {
    if (!await showConfirmModal(t('social.delete_post','게시물 삭제'), t('social.confirm_delete','이 게시물을 삭제하시겠습니까?'))) return;
    try {
        await db.collection('posts').doc(postId).delete();
        showToast(t('social.post_deleted','게시물 삭제됨'), 'info');
        loadSocialFeed();
    } catch (e) { showToast(t('social.delete_fail','삭제 실패'), 'error'); }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return t('social.just_now','방금 전');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('social.min_ago','분 전')}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('social.hour_ago','시간 전')}`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t('social.day_ago','일 전')}`;
    return `${Math.floor(seconds / 604800)}${t('social.week_ago','주 전')}`;
}

// ========== VIDEO EDITOR STATE ==========
let _videoEditorState = { trimStart: 0, trimEnd: 0, filter: 'none', textOverlay: '', textPosition: 'bottom', textColor: '#ffffff' };
let _pendingServiceLink = null;

// ========== SERVICE LINK CONFIG ==========
const SERVICE_LINK_CONFIG = {
    artist:   { action: '💖 후원하기', color: '#E91E63', collection: 'artists', nameField: 'name', nav: (id) => { showPage('artist'); viewArtistDetail(id); } },
    campaign: { action: '💝 모금하기', color: '#4CAF50', collection: 'campaigns', nameField: 'title', nav: (id) => { showPage('fundraise'); showCampaignDetail(id); } },
    business: { action: '💰 투자하기', color: '#0066cc', collection: 'businesses', nameField: 'name', nav: (id) => { showPage('business'); viewBusinessDetail(id); } },
    art:      { action: '🎨 작품 구매', color: '#9C27B0', collection: 'artworks', nameField: 'title', nav: (id) => showPage('art') },
    book:     { action: '📚 책 구매', color: '#FF9800', collection: 'books', nameField: 'title', nav: (id) => showPage('books') },
    product:  { action: '🛒 상품 구매', color: '#2196F3', collection: 'products', nameField: 'name', nav: (id) => { showPage('product-detail'); renderProductDetail(id); } }
};

// ========== SERVICE LINK MODAL ==========
async function showServiceLinkModal() {
    const overlay = document.createElement('div');
    overlay.id = 'service-link-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:white;padding:1.5rem;border-radius:16px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;">
        <h3 style="margin-bottom:1rem;">🔗 서비스 연결</h3>
        <p style="font-size:0.85rem;color:#666;margin-bottom:1rem;">게시물에 연결할 서비스를 선택하세요</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem;">
            ${Object.entries(SERVICE_LINK_CONFIG).map(([type, cfg]) => `
                <button onclick="selectServiceType('${type}')" style="padding:0.8rem;border:2px solid #eee;border-radius:12px;cursor:pointer;background:white;font-size:0.85rem;font-weight:600;text-align:center;transition:all 0.2s;" onmouseover="this.style.borderColor='${cfg.color}';this.style.background='${cfg.color}11'" onmouseout="this.style.borderColor='#eee';this.style.background='white'">
                    ${cfg.action}
                </button>
            `).join('')}
        </div>
        <div id="service-link-search" style="display:none;">
            <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;">
                <input type="text" id="service-link-query" placeholder="검색..." style="flex:1;padding:0.6rem;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;">
                <button onclick="searchServiceItems()" style="padding:0.6rem 1rem;border:none;border-radius:8px;background:#1a1a2e;color:white;cursor:pointer;">검색</button>
            </div>
            <div id="service-link-results" style="max-height:250px;overflow-y:auto;"></div>
        </div>
        <div style="margin-top:1rem;text-align:right;">
            <button onclick="document.getElementById('service-link-modal').remove()" style="padding:0.5rem 1rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">취소</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

let _selectedServiceType = null;

async function selectServiceType(type) {
    _selectedServiceType = type;
    const searchDiv = document.getElementById('service-link-search');
    searchDiv.style.display = 'block';
    document.getElementById('service-link-query').value = '';
    document.getElementById('service-link-query').focus();
    // Auto-load first items
    await searchServiceItems();
}

async function searchServiceItems() {
    const type = _selectedServiceType;
    if (!type) return;
    const cfg = SERVICE_LINK_CONFIG[type];
    const query = document.getElementById('service-link-query').value.trim();
    const results = document.getElementById('service-link-results');
    results.innerHTML = '<p style="text-align:center;color:var(--accent);">로딩...</p>';

    try {
        let snap;
        if (query) {
            snap = await db.collection(cfg.collection).where(cfg.nameField, '>=', query).where(cfg.nameField, '<=', query + '\uf8ff').limit(10).get();
        } else {
            snap = await db.collection(cfg.collection).limit(10).get();
        }
        results.innerHTML = '';
        if (snap.empty) {
            results.innerHTML = '<p style="text-align:center;color:#999;font-size:0.85rem;">결과 없음</p>';
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const name = data[cfg.nameField] || doc.id;
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.6rem;border-bottom:1px solid #eee;cursor:pointer;';
            el.onmouseover = () => el.style.background = '#f9f9f9';
            el.onmouseout = () => el.style.background = 'white';
            el.innerHTML = `<span style="font-size:0.9rem;">${name}</span><button style="padding:0.3rem 0.6rem;border:none;border-radius:6px;background:${cfg.color};color:white;font-size:0.8rem;cursor:pointer;">선택</button>`;
            el.onclick = () => {
                _pendingServiceLink = { type, id: doc.id, title: name, action: cfg.action.replace(/[^\w가-힣\s]/g, '').trim() };
                document.getElementById('service-link-modal').remove();
                // Show preview
                const preview = document.getElementById('post-service-link-preview');
                preview.style.display = 'block';
                preview.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:${cfg.color}11;border:1px solid ${cfg.color}44;border-radius:8px;">
                    <span style="font-size:0.85rem;flex:1;">${cfg.action} - ${name}</span>
                    <button onclick="_pendingServiceLink=null;this.parentElement.parentElement.style.display='none';" style="background:none;border:none;cursor:pointer;font-size:1rem;">✕</button>
                </div>`;
            };
            results.appendChild(el);
        });
    } catch (e) {
        results.innerHTML = `<p style="color:red;text-align:center;font-size:0.85rem;">${e.message}</p>`;
    }
}

// ========== VIDEO EDITOR ==========
function openVideoEditor() {
    const videoInput = document.getElementById('post-video');
    if (!videoInput.files[0]) return;
    const url = URL.createObjectURL(videoInput.files[0]);

    const overlay = document.createElement('div');
    overlay.id = 'video-editor-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
    <div style="width:100%;max-width:400px;">
        <div style="position:relative;margin-bottom:1rem;">
            <video id="editor-video" src="${url}" style="width:100%;border-radius:12px;max-height:50vh;" playsinline></video>
            <div id="editor-text-overlay" style="position:absolute;left:0;right:0;text-align:center;font-size:1.2rem;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.8);pointer-events:none;"></div>
        </div>
        <div style="background:white;border-radius:12px;padding:1rem;">
            <h4 style="margin:0 0 0.8rem;">✂️ 영상 편집</h4>
            <!-- Trim -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#666;">트리밍 (구간 선택)</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">시작</span>
                    <input type="range" id="trim-start" min="0" max="60" value="0" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-start-val" style="font-size:0.75rem;min-width:30px;">0s</span>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">끝</span>
                    <input type="range" id="trim-end" min="0" max="60" value="60" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-end-val" style="font-size:0.75rem;min-width:30px;">60s</span>
                </div>
            </div>
            <!-- Filters -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#666;">필터</label>
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
                    <button onclick="setVideoFilter('none')" class="vfilter-btn active" style="padding:0.3rem 0.6rem;border:2px solid #1a1a2e;border-radius:8px;font-size:0.75rem;cursor:pointer;background:white;">원본</button>
                    <button onclick="setVideoFilter('grayscale(100%)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #ddd;border-radius:8px;font-size:0.75rem;cursor:pointer;background:white;">흑백</button>
                    <button onclick="setVideoFilter('sepia(40%) saturate(1.4)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #ddd;border-radius:8px;font-size:0.75rem;cursor:pointer;background:white;">따뜻한</button>
                    <button onclick="setVideoFilter('saturate(0.8) hue-rotate(20deg)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #ddd;border-radius:8px;font-size:0.75rem;cursor:pointer;background:white;">시원한</button>
                </div>
            </div>
            <!-- Text overlay -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#666;">텍스트 오버레이</label>
                <input type="text" id="editor-text-input" placeholder="텍스트 입력" maxlength="50" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;margin-top:0.3rem;box-sizing:border-box;" oninput="updateTextOverlay()">
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;align-items:center;">
                    <select id="editor-text-pos" style="padding:0.3rem;border:1px solid #ddd;border-radius:6px;font-size:0.8rem;" onchange="updateTextOverlay()">
                        <option value="top">상단</option><option value="center">중앙</option><option value="bottom" selected>하단</option>
                    </select>
                    <input type="color" id="editor-text-color" value="#ffffff" style="width:30px;height:30px;border:none;cursor:pointer;" onchange="updateTextOverlay()">
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="document.getElementById('video-editor-modal').remove()" style="flex:1;padding:0.6rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">취소</button>
                <button onclick="applyVideoEdits()" style="flex:1;padding:0.6rem;border:none;border-radius:8px;cursor:pointer;background:#1a1a2e;color:white;font-weight:700;">✅ 적용</button>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const video = document.getElementById('editor-video');
    video.onloadedmetadata = () => {
        const dur = Math.min(video.duration, 60);
        document.getElementById('trim-end').max = dur;
        document.getElementById('trim-start').max = dur;
        document.getElementById('trim-end').value = dur;
        document.getElementById('trim-end-val').textContent = dur.toFixed(1) + 's';
        _videoEditorState.trimEnd = dur;
        video.play().catch(() => {});
    };
}

function updateTrimPreview() {
    const s = parseFloat(document.getElementById('trim-start').value);
    const e = parseFloat(document.getElementById('trim-end').value);
    document.getElementById('trim-start-val').textContent = s.toFixed(1) + 's';
    document.getElementById('trim-end-val').textContent = e.toFixed(1) + 's';
    _videoEditorState.trimStart = s;
    _videoEditorState.trimEnd = e;
    const v = document.getElementById('editor-video');
    if (v) v.currentTime = s;
}

function setVideoFilter(filter) {
    _videoEditorState.filter = filter;
    const v = document.getElementById('editor-video');
    if (v) v.style.filter = filter;
    document.querySelectorAll('.vfilter-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = '#ddd'; });
    event.target.classList.add('active');
    event.target.style.borderColor = '#1a1a2e';
}

function updateTextOverlay() {
    const text = document.getElementById('editor-text-input').value;
    const pos = document.getElementById('editor-text-pos').value;
    const color = document.getElementById('editor-text-color').value;
    _videoEditorState.textOverlay = text;
    _videoEditorState.textPosition = pos;
    _videoEditorState.textColor = color;
    const overlay = document.getElementById('editor-text-overlay');
    overlay.textContent = text;
    overlay.style.color = color;
    overlay.style.top = pos === 'top' ? '10%' : pos === 'center' ? '45%' : '';
    overlay.style.bottom = pos === 'bottom' ? '10%' : '';
}

function applyVideoEdits() {
    document.getElementById('video-editor-modal').remove();
    showToast('✅ 편집 적용됨', 'success');
}

// ========== THUMBNAIL EXTRACTION ==========
function extractVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => {
            video.currentTime = Math.min(2, video.duration * 0.1);
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 480);
            canvas.height = (canvas.width / video.videoWidth) * video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(video.src);
            resolve({ thumbnailData: thumb, duration: video.duration });
        };
        video.onerror = () => resolve({ thumbnailData: null, duration: 0 });
    });
}

// ========== CREATE POST (with video + service link support) ==========
async function createPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const videoInput = document.getElementById('post-video');
    const text = textarea.value.trim();
    const hasImage = fileInput.files[0];
    const hasVideo = videoInput.files[0];
    if (!text && !hasImage && !hasVideo) { showToast(t('social.enter_content','내용 또는 이미지/영상을 입력하세요'), 'warning'); return; }

    try {
        showLoading(t('social.posting','게시 중...'));
        let imageUrl = null;
        let videoUrl = null;
        let thumbnailData = null;
        let duration = 0;

        if (hasImage) {
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(fileInput.files[0]); });
            imageUrl = await resizeImage(dataUrl, 1080);
        }

        if (hasVideo) {
            // Extract thumbnail first
            const thumbInfo = await extractVideoThumbnail(videoInput.files[0]);
            thumbnailData = thumbInfo.thumbnailData;
            duration = thumbInfo.duration;

            // Upload video to Firebase Storage
            const storageRef = firebase.storage().ref();
            const videoRef = storageRef.child(`videos/${currentUser.uid}/${Date.now()}.mp4`);
            
            // Show upload progress
            const uploadTask = videoRef.put(videoInput.files[0]);
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                        showLoading(`📤 영상 업로드 중... ${progress}%`);
                    },
                    reject,
                    async () => {
                        videoUrl = await uploadTask.snapshot.ref.getDownloadURL();
                        resolve();
                    }
                );
            });
        }

        const postData = {
            userId: currentUser.uid, text, imageUrl, likes: 0, likedBy: [], commentCount: 0, shareCount: 0, timestamp: new Date()
        };

        if (videoUrl) {
            postData.videoUrl = videoUrl;
            postData.thumbnailData = thumbnailData;
            postData.duration = duration;
            // Save editor metadata
            if (_videoEditorState.trimStart > 0 || _videoEditorState.trimEnd < duration) {
                postData.trimStart = _videoEditorState.trimStart;
                postData.trimEnd = _videoEditorState.trimEnd;
            }
            if (_videoEditorState.filter !== 'none') postData.videoFilter = _videoEditorState.filter;
            if (_videoEditorState.textOverlay) {
                postData.videoTextOverlay = _videoEditorState.textOverlay;
                postData.videoTextPosition = _videoEditorState.textPosition;
                postData.videoTextColor = _videoEditorState.textColor;
            }
        }

        if (_pendingServiceLink) {
            postData.serviceLink = _pendingServiceLink;
        }

        await db.collection('posts').add(postData);

        // Reset state
        textarea.value = '';
        fileInput.value = '';
        videoInput.value = '';
        document.getElementById('post-image-name').textContent = '';
        document.getElementById('post-video-preview').style.display = 'none';
        document.getElementById('post-service-link-preview').style.display = 'none';
        _pendingServiceLink = null;
        _videoEditorState = { trimStart: 0, trimEnd: 0, filter: 'none', textOverlay: '', textPosition: 'bottom', textColor: '#ffffff' };

        hideLoading();
        await loadSocialFeed();
        showToast(t('social.post_done','✅ 게시 완료!'), 'success');
    } catch (error) {
        hideLoading();
        console.error('Post error:', error);
        showToast(t('social.post_fail','게시 실패') + ': ' + error.message, 'error');
    }
}

// ========== SHARE POST ==========
async function sharePost(postId) {
    const shareUrl = `https://crowny-org.vercel.app/#post=${postId}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Crowny', text: '크라우니에서 공유된 게시물', url: shareUrl });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast('📋 링크가 복사되었습니다', 'success');
        }
        // Increment share count
        await db.collection('posts').doc(postId).update({ shareCount: firebase.firestore.FieldValue.increment(1) });
    } catch (e) {
        if (e.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(shareUrl); showToast('📋 링크가 복사되었습니다', 'success'); } catch (_) {}
        }
    }
}

// ========== SHORTS FULLSCREEN VIEWER ==========
let _shortsVideoPosts = [];
let _shortsCurrentIndex = 0;

function openShortsViewer(startPostId) {
    _shortsCurrentIndex = _shortsVideoPosts.findIndex(p => p.id === startPostId) || 0;
    renderShortsViewer();
}

function renderShortsViewer() {
    if (_shortsVideoPosts.length === 0) return;
    const post = _shortsVideoPosts[_shortsCurrentIndex];
    if (!post) return;

    let overlay = document.getElementById('shorts-viewer');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'shorts-viewer';
        document.body.appendChild(overlay);
    }
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;';

    const filterCSS = post.data.videoFilter || '';
    const textOverlay = post.data.videoTextOverlay || '';
    const textPos = post.data.videoTextPosition || 'bottom';
    const textColor = post.data.videoTextColor || '#ffffff';
    const posStyle = textPos === 'top' ? 'top:10%' : textPos === 'center' ? 'top:45%' : 'bottom:10%';

    const sl = post.data.serviceLink;
    let serviceLinkHTML = '';
    if (sl) {
        const cfg = SERVICE_LINK_CONFIG[sl.type] || {};
        serviceLinkHTML = `<button onclick="event.stopPropagation();navigateServiceLink('${sl.type}','${sl.id}')" style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);padding:0.7rem 1.5rem;border:none;border-radius:24px;background:${cfg.color || '#333'};color:white;font-weight:700;font-size:0.95rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.3);z-index:10;white-space:nowrap;">${cfg.action || sl.action}</button>`;
    }

    overlay.innerHTML = `
    <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;" id="shorts-container">
        <video id="shorts-video" src="${post.data.videoUrl}" style="max-width:100%;max-height:100%;object-fit:contain;${filterCSS ? 'filter:'+filterCSS+';' : ''}" playsinline loop muted autoplay
            ${post.data.trimStart ? `data-trim-start="${post.data.trimStart}"` : ''} ${post.data.trimEnd ? `data-trim-end="${post.data.trimEnd}"` : ''}></video>
        ${textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${posStyle};font-size:1.4rem;font-weight:700;color:${textColor};text-shadow:0 2px 6px rgba(0,0,0,0.8);pointer-events:none;padding:0 1rem;">${textOverlay}</div>` : ''}
        
        <!-- Close -->
        <button onclick="closeShortsViewer()" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:1.2rem;z-index:10;">✕</button>
        
        <!-- Info overlay -->
        <div style="position:absolute;bottom:20px;left:16px;right:80px;color:white;z-index:5;">
            <strong style="font-size:0.95rem;">${post.nickname || '사용자'}</strong>
            <p style="font-size:0.85rem;margin:0.2rem 0;opacity:0.9;">${(post.data.text || '').substring(0, 100)}</p>
        </div>

        <!-- Side actions -->
        <div style="position:absolute;right:12px;bottom:100px;display:flex;flex-direction:column;gap:1rem;align-items:center;z-index:5;">
            <button onclick="event.stopPropagation();toggleLike('${post.id}',${(post.data.likedBy||[]).includes(currentUser?.uid)})" style="background:none;border:none;cursor:pointer;color:white;text-align:center;">
                <div style="font-size:1.5rem;">${(post.data.likedBy||[]).includes(currentUser?.uid) ? '❤️' : '🤍'}</div>
                <div style="font-size:0.75rem;">${post.data.likes || 0}</div>
            </button>
            <button onclick="event.stopPropagation();closeShortsViewer();toggleComments('${post.id}')" style="background:none;border:none;cursor:pointer;color:white;text-align:center;">
                <div style="font-size:1.5rem;">💬</div>
                <div style="font-size:0.75rem;">${post.data.commentCount || 0}</div>
            </button>
            <button onclick="event.stopPropagation();sharePost('${post.id}')" style="background:none;border:none;cursor:pointer;color:white;text-align:center;">
                <div style="font-size:1.5rem;">📤</div>
                <div style="font-size:0.75rem;">${post.data.shareCount || 0}</div>
            </button>
        </div>

        ${serviceLinkHTML}

        <!-- Nav arrows -->
        ${_shortsCurrentIndex > 0 ? `<button onclick="event.stopPropagation();navigateShorts(-1)" style="position:absolute;top:50%;left:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:white;font-size:1.2rem;z-index:10;">▲</button>` : ''}
        ${_shortsCurrentIndex < _shortsVideoPosts.length - 1 ? `<button onclick="event.stopPropagation();navigateShorts(1)" style="position:absolute;top:50%;right:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:white;font-size:1.2rem;z-index:10;">▼</button>` : ''}
    </div>`;

    // Toggle mute on tap
    const video = document.getElementById('shorts-video');
    overlay.querySelector('#shorts-container').onclick = () => { video.muted = !video.muted; };

    // Handle trim
    if (post.data.trimStart) video.currentTime = post.data.trimStart;
    video.ontimeupdate = () => {
        if (post.data.trimEnd && video.currentTime >= post.data.trimEnd) {
            video.currentTime = post.data.trimStart || 0;
        }
    };

    // Swipe support
    let touchStartY = 0;
    overlay.ontouchstart = (e) => { touchStartY = e.touches[0].clientY; };
    overlay.ontouchend = (e) => {
        const diff = touchStartY - e.changedTouches[0].clientY;
        if (Math.abs(diff) > 60) navigateShorts(diff > 0 ? 1 : -1);
    };
}

function navigateShorts(dir) {
    const next = _shortsCurrentIndex + dir;
    if (next >= 0 && next < _shortsVideoPosts.length) {
        _shortsCurrentIndex = next;
        renderShortsViewer();
    }
}

function closeShortsViewer() {
    const v = document.getElementById('shorts-viewer');
    if (v) v.remove();
}

function navigateServiceLink(type, id) {
    closeShortsViewer();
    const cfg = SERVICE_LINK_CONFIG[type];
    if (cfg && cfg.nav) cfg.nav(id);
}

// ========== Contact management ==========
async function editContact(contactDocId, currentName) {
    const newName = await showPromptModal('연락처 이름 변경', '새 이름을 입력하세요', currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(contactDocId).update({ name: newName.trim() });
        showToast('✅ 연락처 이름이 변경되었습니다', 'success');
        loadContacts();
    } catch (error) { showToast('변경 실패: ' + error.message, 'error'); }
}

// ========== SOCIAL FEED FILTER ==========
function setSocialFilter(filter) {
    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#999';
        b.style.borderBottomColor = 'transparent';
    });
    const btn = document.querySelector(`.social-filter-tab[data-filter="${filter}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.style.color = 'var(--text)';
        btn.style.borderBottomColor = 'var(--text)';
    }
    loadSocialFeed();
}

// ========== DEEP LINK: #post={id} ==========
function handlePostDeepLink() {
    const hash = window.location.hash;
    const match = hash.match(/post=([^&]+)/);
    if (match) {
        const postId = match[1];
        showPage('social');
        // Scroll to post or open shorts if video
        setTimeout(async () => {
            const doc = await db.collection('posts').doc(postId).get();
            if (doc.exists && doc.data().videoUrl) {
                _shortsVideoPosts = [{ id: postId, data: doc.data(), nickname: '' }];
                openShortsViewer(postId);
            }
        }, 1000);
    }
}
window.addEventListener('hashchange', handlePostDeepLink);
window.addEventListener('load', () => setTimeout(handlePostDeepLink, 2000));

async function deleteContact(contactDocId, contactName) {
    if (!await showConfirmModal(t('social.delete_contact','연락처 삭제'), `"${contactName}" ${t('social.confirm_delete_contact','연락처를 삭제하시겠습니까?')}`)) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(contactDocId).delete();
        showToast(t('social.contact_deleted','✅ 연락처가 삭제되었습니다'), 'success');
        loadContacts();
    } catch (error) { showToast(t('social.delete_fail','삭제 실패') + ': ' + error.message, 'error'); }
}
