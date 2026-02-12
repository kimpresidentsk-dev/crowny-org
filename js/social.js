// ===== social.js - 유저데이터, 레퍼럴, 메신저, 소셜피드 (v2.0 Instagram-style) =====

// ========== USER PROFILE MANAGEMENT ==========
async function loadUserData() {
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
}

// Get user display info (nickname + photo)
async function getUserDisplayInfo(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) return { nickname: '알 수 없음', photoURL: '', email: '' };
        const data = doc.data();
        return {
            nickname: data.nickname || data.displayName || data.email?.split('@')[0] || '사용자',
            photoURL: data.photoURL || '',
            email: data.email || '',
            statusMessage: data.statusMessage || ''
        };
    } catch (e) {
        return { nickname: '알 수 없음', photoURL: '', email: '' };
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
        <h3 style="margin-bottom:1rem;">✏️ 프로필 편집</h3>
        <div style="text-align:center; margin-bottom:1rem;">
            <div id="profile-preview-avatar" style="display:inline-block;">${avatarHTML(data.photoURL, data.nickname, 80)}</div>
            <div style="margin-top:0.5rem;">
                <label for="profile-photo-input" style="color:#0066cc; cursor:pointer; font-size:0.85rem; font-weight:600;">📷 사진 변경</label>
                <input type="file" id="profile-photo-input" accept="image/*" style="display:none;" onchange="previewProfilePhoto(this)">
            </div>
        </div>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:#666;">닉네임</label>
                <input type="text" id="profile-edit-nickname" value="${data.nickname || ''}" placeholder="닉네임" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:#666;">상태 메시지</label>
                <input type="text" id="profile-edit-status" value="${data.statusMessage || ''}" placeholder="상태 메시지" maxlength="50" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <p style="font-size:0.75rem; color:#999;">이메일: ${data.email}</p>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="document.getElementById('profile-edit-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">취소</button>
            <button onclick="saveProfile()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#1a1a2e;color:white;font-weight:700;">저장</button>
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

    if (!nickname) { showToast('닉네임을 입력하세요', 'warning'); return; }

    try {
        showLoading('프로필 저장 중...');
        const updates = { nickname, statusMessage };

        if (photoInput.files[0]) {
            const file = photoInput.files[0];
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            updates.photoURL = await resizeImage(dataUrl, 200);
        }

        await db.collection('users').doc(currentUser.uid).update(updates);
        hideLoading();
        showToast('✅ 프로필 저장 완료!', 'success');
        document.getElementById('profile-edit-modal')?.remove();

        // Update sidebar user info
        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = nickname;
    } catch (e) {
        hideLoading();
        showToast('저장 실패: ' + e.message, 'error');
    }
}

// 소개자 정보 로드
async function loadReferralInfo() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) codeEl.textContent = data.referralCode || '미생성';
        const countEl = document.getElementById('my-referral-count');
        if (countEl) countEl.textContent = `${data.referralCount || 0}명`;
        const earnings = data.referralEarnings || {};
        const earnCrny = document.getElementById('referral-earn-crny');
        const earnFnc = document.getElementById('referral-earn-fnc');
        const earnCrfn = document.getElementById('referral-earn-crfn');
        if (earnCrny) earnCrny.textContent = earnings.crny || 0;
        if (earnFnc) earnFnc.textContent = earnings.fnc || 0;
        if (earnCrfn) earnCrfn.textContent = earnings.crfn || 0;

        // Update sidebar with nickname
        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = data.nickname || data.email;
    } catch (error) {
        console.error('소개자 정보 로드 실패:', error);
    }
}

async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    if (!code || code === '미생성') { showToast('먼저 소개 코드를 생성하세요', 'warning'); return; }
    try {
        await navigator.clipboard.writeText(code);
        showToast(`📋 소개 코드 복사됨: ${code}`, 'success');
    } catch (e) {
        await showPromptModal('소개 코드', '소개 코드를 복사하세요', code);
    }
}

// ========== MESSENGER ==========
let currentChat = null;
let currentChatOtherId = null;
let chatUnsubscribe = null;

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

async function showAddContactModal() {
    const email = await showPromptModal('연락처 추가', '추가할 연락처 이메일', '');
    if (!email) return;
    const users = await db.collection('users').where('email', '==', email).get();
    if (users.empty) { showToast('사용자를 찾을 수 없습니다', 'error'); return; }
    const userId = users.docs[0].id;
    const userData = users.docs[0].data();
    const name = userData.nickname || userData.displayName || email;
    await db.collection('users').doc(currentUser.uid)
        .collection('contacts').doc(userId).set({
            email: email,
            name: name,
            addedAt: new Date()
        });
    showToast('✅ 연락처에 추가되었습니다', 'success');
    loadContacts();
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
                <p style="font-size:0.95rem; margin-bottom:0.5rem;">연락처가 없습니다</p>
                <button onclick="showAddContactModal()" class="btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem;">➕ 연락처 추가</button>
            </div>`;
        return;
    }

    for (const doc of contacts.docs) {
        const contact = doc.data();
        const info = await getUserDisplayInfo(doc.id);
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            ${avatarHTML(info.photoURL, info.nickname, 44)}
            <div class="contact-info" style="flex:1;">
                <strong style="font-size:0.95rem;">${info.nickname}</strong>
                <p style="font-size:0.75rem; margin:0.1rem 0; color:var(--accent);">${info.statusMessage || info.email}</p>
            </div>
            <div style="display:flex; gap:0.3rem; flex-direction:column;">
                <button onclick='startChatWithContact("${contact.email}")' class="btn-chat" style="font-size:0.8rem; padding:0.4rem 0.6rem;">채팅</button>
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
        showToast('채팅 시작 실패', 'error');
    }
}

async function showNewChatModal() {
    const email = await showPromptModal('새 채팅', '채팅할 사용자 이메일', '');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        if (otherEmail === currentUser.email) { showToast('자기 자신과는 채팅할 수 없습니다', 'warning'); return; }
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        if (users.empty) { showToast('사용자를 찾을 수 없습니다', 'error'); return; }
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
                lastMessage: '', lastMessageTime: new Date(), createdAt: new Date()
            });
            chatId = newChat.id;
        }
        await loadMessages();
        await openChat(chatId, otherId);
    } catch (error) {
        console.error('Start chat error:', error);
        showToast('채팅 시작 실패: ' + error.message, 'error');
    }
}

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    const chats = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
    if (chats.empty) { chatList.innerHTML = '<p style="padding:1rem; color:var(--accent); text-align:center;">채팅을 시작하세요</p>'; return; }

    const chatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis?.() || 0;
        const bTime = b.data().lastMessageTime?.toMillis?.() || 0;
        return bTime - aTime;
    });

    for (const doc of chatDocs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        const info = await getUserDisplayInfo(otherId);
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            ${avatarHTML(info.photoURL, info.nickname, 44)}
            <div class="chat-preview">
                <strong>${info.nickname}</strong>
                <p>${chat.lastMessage || '메시지 없음'}</p>
            </div>`;
        chatList.appendChild(chatItem);
    }
}

async function openChat(chatId, otherId) {
    if (chatUnsubscribe) chatUnsubscribe();
    currentChat = chatId;
    currentChatOtherId = otherId;
    const info = await getUserDisplayInfo(otherId);
    document.getElementById('chat-username').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;">
            ${avatarHTML(info.photoURL, info.nickname, 32)}
            <div><strong>${info.nickname}</strong>${info.statusMessage ? `<div style="font-size:0.7rem;color:var(--accent);">${info.statusMessage}</div>` : ''}</div>
        </div>`;
    document.querySelector('.chat-window').style.display = 'flex';

    chatUnsubscribe = db.collection('chats').doc(chatId)
        .collection('messages').orderBy('timestamp')
        .onSnapshot(async (snapshot) => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            if (snapshot.empty) {
                messagesDiv.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">메시지를 보내보세요!</p>';
            }
            // Cache sender info
            const senderCache = {};
            for (const doc of snapshot.docs) {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                if (!senderCache[msg.senderId]) senderCache[msg.senderId] = await getUserDisplayInfo(msg.senderId);
                const senderInfo = senderCache[msg.senderId];

                const msgEl = document.createElement('div');
                msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;

                let content = '';
                if (msg.imageUrl) {
                    content += `<img src="${msg.imageUrl}" style="max-width:200px;border-radius:8px;cursor:pointer;display:block;margin-bottom:0.3rem;" onclick="window.open('${msg.imageUrl}','_blank')">`;
                }
                if (msg.tokenAmount) {
                    content += `<div style="background:linear-gradient(135deg,#FFD700,#FFA000);color:#333;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;">💰 ${msg.tokenAmount} ${msg.tokenType}</div>`;
                }
                if (msg.text) content += `<span>${msg.text}</span>`;

                msgEl.innerHTML = `
                    ${!isMine ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : ''}
                    <div style="max-width:70%;">
                        ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                        <div style="background:${isMine ? 'var(--text)' : '#f0f0f0'};color:${isMine ? 'white' : 'var(--text)'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                    </div>`;
                messagesDiv.appendChild(msgEl);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
}

async function sendMessage() {
    if (!currentChat) { showToast('채팅을 선택하세요', 'warning'); return; }
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    await db.collection('chats').doc(currentChat).collection('messages').add({
        senderId: currentUser.uid, text: text, timestamp: new Date()
    });
    await db.collection('chats').doc(currentChat).update({ lastMessage: text, lastMessageTime: new Date() });
    input.value = '';
}

// Send image in chat
async function sendChatImage() {
    if (!currentChat) { showToast('채팅을 선택하세요', 'warning'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        if (!input.files[0]) return;
        try {
            showLoading('이미지 전송 중...');
            const file = input.files[0];
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            const resized = await resizeImage(dataUrl, 800);

            await db.collection('chats').doc(currentChat).collection('messages').add({
                senderId: currentUser.uid, text: '', imageUrl: resized, timestamp: new Date()
            });
            await db.collection('chats').doc(currentChat).update({ lastMessage: '📷 사진', lastMessageTime: new Date() });
            hideLoading();
            showToast('📷 이미지 전송 완료', 'success');
        } catch (e) {
            hideLoading();
            showToast('이미지 전송 실패: ' + e.message, 'error');
        }
    };
    input.click();
}

async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) { showToast('채팅을 선택하세요', 'warning'); return; }
    if (!userWallet || !currentWalletId) { showToast('지갑을 먼저 연결하세요', 'warning'); return; }

    const tokenChoice = await showPromptModal('토큰 선택',
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
    if (!tokenKey) { showToast('잘못된 선택', 'error'); return; }

    const isOffchain = isOffchainToken(tokenKey);
    const tokenName = tokenKey.toUpperCase();
    const balance = isOffchain ? (userWallet.offchainBalances?.[tokenKey] || 0) : (userWallet.balances?.[tokenKey] || 0);

    const amount = await showPromptModal('전송 수량', `전송할 ${tokenName} 수량 (잔액: ${balance})`, '');
    if (!amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        showToast(`잔액이 부족하거나 잘못된 수량입니다`, 'error'); return;
    }
    const message = await showPromptModal('메시지', '메시지 (선택)', '') || '';

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
            senderId: currentUser.uid, text: message, tokenAmount: amountNum, tokenType: tokenName, timestamp: new Date()
        });
        await db.collection('chats').doc(currentChat).update({ lastMessage: `💰 ${amountNum} ${tokenName} 전송`, lastMessageTime: new Date() });
        await db.collection('transactions').add({ from: currentUser.uid, to: currentChatOtherId, amount: amountNum, token: tokenName, type: isOffchain ? 'messenger_offchain' : 'messenger_onchain', message, timestamp: new Date() });
        updateBalances();
        showToast(`✅ ${amountNum} ${tokenName} 전송 완료!`, 'success');
    } catch (error) {
        console.error('메신저 토큰 전송 실패:', error);
        showToast('전송 실패: ' + error.message, 'error');
    }
}

// ========== INSTAGRAM-STYLE SOCIAL FEED ==========
async function loadSocialFeed() {
    const feed = document.getElementById('social-feed');
    feed.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--accent);">📸 게시물 로딩 중...</p>';

    try {
        const posts = await db.collection('posts').limit(50).get();
        const sortedPosts = posts.docs.sort((a, b) => (b.data().timestamp?.toMillis?.() || 0) - (a.data().timestamp?.toMillis?.() || 0));
        feed.innerHTML = '';

        if (sortedPosts.length === 0) {
            feed.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                <p style="font-size:1.1rem;">아직 게시물이 없습니다</p>
                <p style="font-size:0.85rem;">첫 게시물을 작성해보세요!</p></div>`;
            return;
        }

        for (const doc of sortedPosts) {
            const post = doc.data();
            const userInfo = await getUserDisplayInfo(post.userId);
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const commentCount = post.commentCount || 0;
            const isMyPost = post.userId === currentUser.uid;

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
                ${post.imageUrl ? `<div style="margin:0 -1.2rem;"><img src="${post.imageUrl}" style="width:100%;display:block;" loading="lazy"></div>` : ''}
                <div class="post-actions-bar" style="display:flex;align-items:center;gap:1rem;padding:0.6rem 0;">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})" style="background:none;border:none;cursor:pointer;font-size:1.4rem;padding:0;line-height:1;transition:transform 0.15s;" onmousedown="this.style.transform='scale(1.2)'" onmouseup="this.style.transform='scale(1)'">${likedByMe ? '❤️' : '🤍'}</button>
                    <button onclick="toggleComments('${doc.id}')" style="background:none;border:none;cursor:pointer;font-size:1.3rem;padding:0;line-height:1;">💬</button>
                </div>
                <div style="font-size:0.85rem;">
                    ${likeCount > 0 ? `<div style="font-weight:700;margin-bottom:0.2rem;cursor:pointer;" onclick="showLikedUsers('${doc.id}')">좋아요 ${likeCount}개</div>` : ''}
                    ${post.text ? `<div><strong style="margin-right:0.3rem;">${userInfo.nickname}</strong>${post.text}</div>` : ''}
                    ${commentCount > 0 ? `<div style="color:var(--accent);margin-top:0.2rem;cursor:pointer;" onclick="toggleComments('${doc.id}')">댓글 ${commentCount}개 모두 보기</div>` : ''}
                </div>
                <div id="comments-${doc.id}" style="display:none; margin-top:0.8rem; border-top:1px solid var(--border); padding-top:0.6rem;">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.5rem; align-items:center;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="댓글 달기..." style="flex:1; padding:0.5rem; border:none; border-bottom:1px solid var(--border); font-size:0.85rem; outline:none;" onkeypress="if(event.key==='Enter')addComment('${doc.id}')">
                        <button onclick="addComment('${doc.id}')" style="background:none;border:none;color:#0066cc;font-weight:700;cursor:pointer;font-size:0.85rem;">게시</button>
                    </div>
                </div>`;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `<div style="text-align:center; padding:3rem;">
            <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
            <p style="color:red;">${error.message}</p>
            <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">다시 시도</button></div>`;
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
    if (likedBy.length === 0) { showToast('아직 좋아요가 없습니다', 'info'); return; }
    let message = '';
    for (const uid of likedBy) {
        const info = await getUserDisplayInfo(uid);
        message += `${info.nickname}\n`;
    }
    await showConfirmModal('좋아요', message);
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
    if (comments.empty) { list.innerHTML = '<p style="text-align:center; color:var(--accent); font-size:0.8rem;">첫 댓글을 남겨보세요!</p>'; return; }
    for (const doc of comments.docs) {
        const c = doc.data();
        const info = await getUserDisplayInfo(c.userId);
        const el = document.createElement('div');
        el.style.cssText = 'margin-bottom:0.4rem; font-size:0.85rem; line-height:1.4;';
        el.innerHTML = `<strong style="margin-right:0.3rem;">${info.nickname}</strong>${c.text} <span style="font-size:0.7rem; color:var(--accent);">${getTimeAgo(c.timestamp.toDate())}</span>`;
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
    loadSocialFeed(); // Refresh counts
}

async function deletePost(postId) {
    if (!await showConfirmModal('게시물 삭제', '이 게시물을 삭제하시겠습니까?')) return;
    try {
        await db.collection('posts').doc(postId).delete();
        showToast('게시물 삭제됨', 'info');
        loadSocialFeed();
    } catch (e) { showToast('삭제 실패', 'error'); }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`;
    return `${Math.floor(seconds / 604800)}주 전`;
}

async function createPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const text = textarea.value.trim();
    if (!text && !fileInput.files[0]) { showToast('내용 또는 이미지를 입력하세요', 'warning'); return; }

    try {
        showLoading('게시 중...');
        let imageUrl = null;
        if (fileInput.files[0]) {
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(fileInput.files[0]); });
            imageUrl = await resizeImage(dataUrl, 1080);
        }
        await db.collection('posts').add({
            userId: currentUser.uid, text, imageUrl, likes: 0, likedBy: [], commentCount: 0, timestamp: new Date()
        });
        textarea.value = '';
        fileInput.value = '';
        document.getElementById('post-image-name').textContent = '';
        hideLoading();
        await loadSocialFeed();
        showToast('✅ 게시 완료!', 'success');
    } catch (error) {
        hideLoading();
        console.error('Post error:', error);
        showToast('게시 실패', 'error');
    }
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

async function deleteContact(contactDocId, contactName) {
    if (!await showConfirmModal('연락처 삭제', `"${contactName}" 연락처를 삭제하시겠습니까?`)) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(contactDocId).delete();
        showToast('✅ 연락처가 삭제되었습니다', 'success');
        loadContacts();
    } catch (error) { showToast('삭제 실패: ' + error.message, 'error'); }
}
