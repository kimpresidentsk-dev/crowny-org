// ===== social.js - 유저데이터, 레퍼럴, 메신저, 소셜피드 =====
async function loadUserData() {
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
}

// 소개자 정보 로드
async function loadReferralInfo() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const data = userDoc.data();
        
        // 소개 코드
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) codeEl.textContent = data.referralCode || '미생성';
        
        // 초대 수
        const countEl = document.getElementById('my-referral-count');
        if (countEl) countEl.textContent = `${data.referralCount || 0}명`;
        
        // 수익
        const earnings = data.referralEarnings || {};
        const earnCrny = document.getElementById('referral-earn-crny');
        const earnFnc = document.getElementById('referral-earn-fnc');
        const earnCrfn = document.getElementById('referral-earn-crfn');
        if (earnCrny) earnCrny.textContent = earnings.crny || 0;
        if (earnFnc) earnFnc.textContent = earnings.fnc || 0;
        if (earnCrfn) earnCrfn.textContent = earnings.crfn || 0;
    } catch (error) {
        console.error('소개자 정보 로드 실패:', error);
    }
}

// 소개 코드 복사
async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    
    if (!code || code === '미생성') {
        alert('먼저 소개 코드를 생성하세요');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(code);
        alert(`📋 소개 코드 복사됨: ${code}`);
    } catch (e) {
        prompt('소개 코드를 복사하세요:', code);
    }
}

// ========== MESSENGER ==========
let currentChat = null;
let currentChatOtherId = null;

function showChats() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
}

function showContacts() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'block';
    loadContacts();
}

async function showAddContactModal() {
    const email = prompt('추가할 연락처 이메일:');
    if (!email) return;
    
    const name = prompt('표시 이름 (선택):') || email;
    
    // Check if user exists
    const users = await db.collection('users').where('email', '==', email).get();
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const userId = users.docs[0].id;
    
    // Add to contacts
    await db.collection('users').doc(currentUser.uid)
        .collection('contacts').doc(userId).set({
            email: email,
            name: name,
            addedAt: new Date()
        });
    
    alert('✅ 연락처에 추가되었습니다');
    loadContacts();
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    contactList.innerHTML = '<p style="padding:1rem; text-align:center;">📋 로딩 중...</p>';
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    contactList.innerHTML = '';
    
    if (contacts.empty) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">👥</p>
                <p style="font-size:1.1rem; margin-bottom:0.5rem;">연락처가 없습니다</p>
                <p style="font-size:0.85rem; margin-bottom:1.5rem;">첫 연락처를 추가해보세요!</p>
                <button onclick="showAddContact()" class="btn-primary">➕ 연락처 추가</button>
            </div>
        `;
        return;
    }
    
    for (const doc of contacts.docs) {
        const contact = doc.data();
        
        // Get wallet address
        const users = await db.collection('users').where('email', '==', contact.email).get();
        let walletAddr = '';
        if (!users.empty) {
            const userData = users.docs[0].data();
            if (userData.walletAddress) {
                const addr = userData.walletAddress;
                walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
            }
        }
        
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="contact-info" style="flex:1;">
                <strong style="font-size:0.95rem;">${contact.name}</strong>
                <p style="font-size:0.75rem; margin:0.2rem 0;">${contact.email}</p>
                ${walletAddr ? `<p style="font-size:0.7rem; color:var(--accent); margin:0;">💳 ${walletAddr}</p>` : ''}
            </div>
            <div style="display:flex; gap:0.3rem; flex-direction:column;">
                <button onclick='startChatWithContact("${contact.email}")' class="btn-chat" style="font-size:0.8rem; padding:0.4rem 0.6rem;">채팅</button>
                <button onclick='editContact("${doc.id}", "${contact.name}")' style="background:none; border:1px solid #ddd; border-radius:4px; padding:0.2rem 0.5rem; font-size:0.7rem; cursor:pointer; color:#666;">✏️</button>
                <button onclick='deleteContact("${doc.id}", "${contact.name}")' style="background:none; border:1px solid #fcc; border-radius:4px; padding:0.2rem 0.5rem; font-size:0.7rem; cursor:pointer; color:#c00;">🗑️</button>
            </div>
        `;
        contactList.appendChild(contactItem);
    }
}

async function startChatWithContact(email) {
    try {
        await startNewChat(email);
        
        // Switch to chats tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('chats-view').style.display = 'block';
        document.getElementById('contacts-view').style.display = 'none';
        
        // Show messenger page
        showPage('messenger');
    } catch (error) {
        console.error('Chat start error:', error);
        alert('채팅 시작 실패');
    }
}

function showNewChatModal() {
    const email = prompt('채팅할 사용자 이메일:');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        console.log('Starting chat with:', otherEmail);
        
        if (otherEmail === currentUser.email) {
            alert('자기 자신과는 채팅할 수 없습니다');
            return;
        }
        
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        console.log('Found users:', users.size);
        
        if (users.empty) {
            alert('사용자를 찾을 수 없습니다');
            return;
        }
        
        const otherUser = users.docs[0];
        const otherId = otherUser.id;
        console.log('Other user ID:', otherId);
        
        // Check if chat exists
        const existingChat = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .get();
        
        console.log('Existing chats:', existingChat.size);
        
        let chatId = null;
        
        for (const doc of existingChat.docs) {
            const chat = doc.data();
            if (chat.participants.includes(otherId)) {
                chatId = doc.id;
                console.log('Found existing chat:', chatId);
                break;
            }
        }
        
        // Create new chat if not exists
        if (!chatId) {
            console.log('Creating new chat...');
            const newChat = await db.collection('chats').add({
                participants: [currentUser.uid, otherId],
                otherEmail: otherEmail,
                myEmail: currentUser.email,
                lastMessage: '',
                lastMessageTime: new Date(),
                createdAt: new Date()
            });
            chatId = newChat.id;
            console.log('Created chat:', chatId);
        }
        
        await loadMessages();
        await openChat(chatId, otherId);
        console.log('Chat opened successfully');
    } catch (error) {
        console.error('Start chat error:', error);
        alert('채팅 시작 실패: ' + error.message);
    }
}

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    const chats = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    if (chats.empty) {
        chatList.innerHTML = '<p style="padding:1rem; color:var(--accent);">채팅을 시작하세요</p>';
        return;
    }
    
    // Sort manually
    const chatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis() || 0;
        const bTime = b.data().lastMessageTime?.toMillis() || 0;
        return bTime - aTime;
    });
    
    for (const doc of chatDocs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        
        const otherUserDoc = await db.collection('users').doc(otherId).get();
        const otherEmail = otherUserDoc.data().email;
        
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="chat-preview">
                <strong>${otherEmail}</strong>
                <p>${chat.lastMessage || '메시지 없음'}</p>
            </div>
        `;
        chatList.appendChild(chatItem);
    }
}

async function openChat(chatId, otherId) {
    currentChat = chatId;
    currentChatOtherId = otherId;
    
    const otherUser = await db.collection('users').doc(otherId).get();
    const otherEmail = otherUser.data().email;
    document.getElementById('chat-username').textContent = otherEmail;
    
    // Show chat window
    document.querySelector('.chat-window').style.display = 'flex';
    
    // Real-time listener
    db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            
            if (snapshot.empty) {
                messagesDiv.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">메시지를 보내보세요!</p>';
            }
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                
                const msgEl = document.createElement('div');
                msgEl.style.cssText = `
                    background: ${isMine ? 'var(--text)' : 'var(--bg)'};
                    color: ${isMine ? 'white' : 'var(--text)'};
                    padding: 0.8rem;
                    border-radius: 12px;
                    margin-bottom: 0.5rem;
                    max-width: 70%;
                    margin-left: ${isMine ? 'auto' : '0'};
                    word-break: break-word;
                `;
                
                let content = msg.text;
                if (msg.tokenAmount) {
                    content = `💰 ${msg.tokenAmount} ${msg.tokenType} 전송\n${msg.text || ''}`;
                }
                
                msgEl.textContent = content;
                messagesDiv.appendChild(msgEl);
            });
            
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    
    console.log('Chat opened:', chatId, 'with', otherEmail);
}

async function sendMessage() {
    if (!currentChat) {
        alert('채팅을 선택하세요');
        return;
    }
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('chats').doc(currentChat)
        .collection('messages').add({
            senderId: currentUser.uid,
            text: text,
            timestamp: new Date()
        });
    
    await db.collection('chats').doc(currentChat).update({
        lastMessage: text,
        lastMessageTime: new Date()
    });
    
    input.value = '';
}

async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) {
        alert('채팅을 선택하세요');
        return;
    }
    if (!userWallet || !currentWalletId) {
        alert('지갑을 먼저 연결하세요');
        return;
    }
    
    // 토큰 선택 (온체인 + 오프체인)
    const tokenChoice = prompt(
        '전송할 토큰을 선택하세요:\n\n' +
        '온체인:\n1. CRNY (' + (userWallet.balances?.crny || 0).toFixed(2) + ')\n' +
        '2. FNC (' + (userWallet.balances?.fnc || 0).toFixed(2) + ')\n' +
        '3. CRFN (' + (userWallet.balances?.crfn || 0).toFixed(2) + ')\n\n' +
        '오프체인:\n4. CRTD (' + (userWallet.offchainBalances?.crtd || 0) + ' pt)\n' +
        '5. CRAC (' + (userWallet.offchainBalances?.crac || 0) + ' pt)\n' +
        '6. CRGC (' + (userWallet.offchainBalances?.crgc || 0) + ' pt)\n' +
        '7. CREB (' + (userWallet.offchainBalances?.creb || 0) + ' pt)\n\n번호:', '1');
    if (!tokenChoice) return;
    
    const tokenMap = { '1':'crny', '2':'fnc', '3':'crfn', '4':'crtd', '5':'crac', '6':'crgc', '7':'creb' };
    const tokenKey = tokenMap[tokenChoice];
    if (!tokenKey) { alert('잘못된 선택'); return; }
    
    const isOffchain = isOffchainToken(tokenKey);
    const tokenName = tokenKey.toUpperCase();
    const balance = isOffchain 
        ? (userWallet.offchainBalances?.[tokenKey] || 0) 
        : (userWallet.balances?.[tokenKey] || 0);
    
    const amount = prompt(`전송할 ${tokenName} 수량:\n잔액: ${balance}`);
    if (!amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        alert(`잔액이 부족하거나 잘못된 수량입니다\n잔액: ${balance} ${tokenName}`);
        return;
    }
    
    const message = prompt('메시지 (선택):') || '';
    
    try {
        if (isOffchain) {
            // 오프체인: user doc의 offchainBalances 사용
            const recipientDoc = await db.collection('users').doc(currentChatOtherId).get();
            const recipientOff = recipientDoc.data()?.offchainBalances || {};
            
            // 발신자 차감
            await db.collection('users').doc(currentUser.uid).update({
                [`offchainBalances.${tokenKey}`]: balance - amountNum
            });
            userWallet.offchainBalances[tokenKey] = balance - amountNum;
            
            // 수신자 적립
            await db.collection('users').doc(currentChatOtherId).update({
                [`offchainBalances.${tokenKey}`]: (recipientOff[tokenKey] || 0) + amountNum
            });
        } else {
            // 온체인: wallets subcollection 사용
            await db.collection('users').doc(currentUser.uid)
                .collection('wallets').doc(currentWalletId)
                .update({ [`balances.${tokenKey}`]: balance - amountNum });
            userWallet.balances[tokenKey] = balance - amountNum;
            
            // 수신자 지갑 (첫 번째 지갑)
            const recipientWallets = await db.collection('users').doc(currentChatOtherId)
                .collection('wallets').limit(1).get();
            if (!recipientWallets.empty) {
                const rBal = recipientWallets.docs[0].data().balances || {};
                await recipientWallets.docs[0].ref.update({
                    [`balances.${tokenKey}`]: (rBal[tokenKey] || 0) + amountNum
                });
            }
        }
        
        // 채팅 메시지 기록
        await db.collection('chats').doc(currentChat)
            .collection('messages').add({
                senderId: currentUser.uid,
                text: message,
                tokenAmount: amountNum,
                tokenType: tokenName,
                timestamp: new Date()
            });
        
        await db.collection('chats').doc(currentChat).update({
            lastMessage: `💰 ${amountNum} ${tokenName} 전송`,
            lastMessageTime: new Date()
        });
        
        // 트랜잭션 기록
        await db.collection('transactions').add({
            from: currentUser.uid,
            to: currentChatOtherId,
            amount: amountNum,
            token: tokenName,
            type: isOffchain ? 'messenger_offchain' : 'messenger_onchain',
            message: message,
            timestamp: new Date()
        });
        
        updateBalances();
        alert(`✅ ${amountNum} ${tokenName} 전송 완료!`);
    } catch (error) {
        console.error('메신저 토큰 전송 실패:', error);
        alert('전송 실패: ' + error.message);
    }
}

// ========== SOCIAL FEED ==========
async function loadSocialFeed() {
    const feed = document.getElementById('social-feed');
    feed.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--accent);">📸 게시물 로딩 중...</p>';
    
    try {
        const posts = await db.collection('posts')
            .limit(50)
            .get();
        
        // Sort manually
        const sortedPosts = posts.docs.sort((a, b) => {
            const aTime = a.data().timestamp?.toMillis() || 0;
            const bTime = b.data().timestamp?.toMillis() || 0;
            return bTime - aTime;
        });
        
        feed.innerHTML = '';
        
        if (sortedPosts.length === 0) {
            feed.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                    <p style="font-size:1.2rem; margin-bottom:0.5rem;">아직 게시물이 없습니다</p>
                    <p style="font-size:0.9rem;">첫 게시물을 작성해보세요!</p>
                </div>
            `;
            return;
        }
        
        for (const doc of sortedPosts) {
            const post = doc.data();
            
            // Get user info
            const userDoc = await db.collection('users').doc(post.userId).get();
            const userData = userDoc.exists ? userDoc.data() : { email: '알 수 없음' };
            const userName = userData.nickname || userData.displayName || userData.email;
            
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            
            // Likes display
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const likeButton = likedByMe ? '❤️' : '🤍';
            
            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">👤</div>
                    <div class="post-info">
                        <strong>${userName}</strong>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <div class="post-content">
                    <p>${post.text}</p>
                    ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:8px; margin-top:0.5rem;">` : ''}
                </div>
                <div class="post-actions">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})">${likeButton} ${likeCount}</button>
                    <button onclick="showLikedUsers('${doc.id}')">👥 좋아요</button>
                    <button onclick="toggleComments('${doc.id}')">💬 댓글 ${(post.commentCount || 0)}</button>
                </div>
                <div id="comments-${doc.id}" style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border);">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="댓글 입력..." style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
                        <button onclick="addComment('${doc.id}')" class="btn-primary" style="padding:0.5rem 1rem;">작성</button>
                    </div>
                </div>
            `;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
                <p style="color:red; margin-bottom:0.5rem;">로딩 실패</p>
                <p style="font-size:0.85rem; color:var(--accent);">${error.message}</p>
                <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">다시 시도</button>
            </div>
        `;
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
    const data = post.data();
    const likedBy = data.likedBy || [];
    
    if (likedBy.length === 0) {
        alert('아직 좋아요가 없습니다');
        return;
    }
    
    let message = '좋아요 한 사람:\n\n';
    for (const uid of likedBy) {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        message += `👤 ${userName}\n`;
    }
    
    alert(message);
}

async function toggleComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);
    
    if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsDiv.style.display = 'none';
    }
}

async function loadComments(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    commentList.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩 중...</p>';
    
    const comments = await db.collection('posts').doc(postId)
        .collection('comments')
        .orderBy('timestamp', 'asc')
        .get();
    
    commentList.innerHTML = '';
    
    if (comments.empty) {
        commentList.innerHTML = '<p style="text-align:center; color:var(--accent); font-size:0.85rem;">첫 댓글을 남겨보세요!</p>';
        return;
    }
    
    for (const doc of comments.docs) {
        const comment = doc.data();
        const userDoc = await db.collection('users').doc(comment.userId).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        
        const commentEl = document.createElement('div');
        commentEl.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        commentEl.innerHTML = `
            <strong style="font-size:0.85rem;">${userName}</strong>
            <p style="margin:0.3rem 0 0 0; font-size:0.9rem;">${comment.text}</p>
            <span style="font-size:0.75rem; color:var(--accent);">${getTimeAgo(comment.timestamp.toDate())}</span>
        `;
        commentList.appendChild(commentEl);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('posts').doc(postId).collection('comments').add({
        userId: currentUser.uid,
        text: text,
        timestamp: new Date()
    });
    
    // Update comment count
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    await postRef.update({
        commentCount: (post.data().commentCount || 0) + 1
    });
    
    input.value = '';
    await loadComments(postId);
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
}

async function createPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const text = textarea.value.trim();
    
    if (!text && !fileInput.files[0]) {
        alert('내용 또는 이미지를 입력하세요');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload image if exists
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            imageUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        
        await db.collection('posts').add({
            userId: currentUser.uid,
            text: text,
            imageUrl: imageUrl,
            likes: 0,
            likedBy: [],
            commentCount: 0,
            timestamp: new Date()
        });
        
        textarea.value = '';
        fileInput.value = '';
        await loadSocialFeed();
        alert('✅ 게시 완료!');
    } catch (error) {
        console.error('Post error:', error);
        alert('게시 실패');
    }
}

async function likePost(postId, currentLikes) {
    try {
        await db.collection('posts').doc(postId).update({
            likes: currentLikes + 1
        });
        
        await loadSocialFeed();
    } catch (error) {
        console.error('Like error:', error);
    }
}

// ========== 연락처 편집/삭제 ==========
async function editContact(contactDocId, currentName) {
    const newName = prompt('연락처 이름 변경:', currentName);
    if (!newName || newName.trim() === currentName) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('contacts').doc(contactDocId)
            .update({ name: newName.trim() });
        alert('✅ 연락처 이름이 변경되었습니다');
        loadContacts();
    } catch (error) {
        alert('변경 실패: ' + error.message);
    }
}

async function deleteContact(contactDocId, contactName) {
    if (!confirm(`"${contactName}" 연락처를 삭제하시겠습니까?`)) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('contacts').doc(contactDocId).delete();
        alert('✅ 연락처가 삭제되었습니다');
        loadContacts();
    } catch (error) {
        alert('삭제 실패: ' + error.message);
    }
}

