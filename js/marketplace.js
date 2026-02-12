// ===== marketplace.js - 쇼핑몰, 모금, 에너지, 비즈니스, 아티스트, 출판, P2P크레딧 =====
async function loadMallProducts() {
    const container = document.getElementById('mall-products');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const brandFilter = window._mallBrandFilter || null;
        let query = db.collection('products').where('status', '==', 'active');
        if (brandFilter) query = query.where('category', '==', brandFilter);
        const docs = await query.orderBy('createdAt', 'desc').limit(30).get();
        if (docs.empty) { container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 상품이 없습니다</p>'; return; }
        container.innerHTML = '';
        docs.forEach(d => {
            const p = d.data();
            container.innerHTML += `
                <div onclick="viewProduct('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    <div style="height:140px; overflow:hidden; background:#f0f0f0;"><img src="${p.imageData}" style="width:100%; height:100%; object-fit:cover;"></div>
                    <div style="padding:0.6rem;">
                        <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${MALL_CATEGORIES[p.category] || ''} · ${p.sellerNickname || '판매자'}</div>
                        <div style="font-weight:700; color:#0066cc; margin-top:0.3rem;">${p.price} ${p.priceToken}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">재고: ${p.stock - (p.sold||0)}개</div>
                    </div>
                </div>`;
        });
    } catch (e) { container.innerHTML = `<p style="color:red; grid-column:1/-1;">${e.message}</p>`; }
}

async function viewProduct(id) {
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) return;
    const p = doc.data(); const isOwner = currentUser?.uid === p.sellerId;
    const remaining = p.stock - (p.sold || 0);
    const modal = document.createElement('div');
    modal.id = 'product-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <img src="${p.imageData}" style="width:100%; border-radius:12px 12px 0 0; max-height:40vh; object-fit:contain; background:#f0f0f0;">
        <div style="padding:1.2rem;">
            <h3>${p.title}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.5rem 0;">${MALL_CATEGORIES[p.category]} · 판매자: ${p.sellerNickname || p.sellerEmail}</p>
            ${p.description ? `<p style="font-size:0.9rem; margin-bottom:1rem;">${p.description}</p>` : ''}
            <div style="font-size:1.2rem; font-weight:700; color:#0066cc; margin-bottom:0.5rem;">${p.price} ${p.priceToken}</div>
            <div style="font-size:0.85rem; color:var(--accent); margin-bottom:1rem;">재고: ${remaining}개</div>
            ${!isOwner && remaining > 0 ? `<button onclick="buyProduct('${id}')" style="background:#0066cc; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%;">🛒 구매하기</button>` : ''}
            ${remaining <= 0 ? '<p style="color:#cc0000; font-weight:700; text-align:center;">품절</p>' : ''}
        </div></div>`;
    document.body.appendChild(modal);
}

async function buyProduct(id) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('products').doc(id).get();
        const p = doc.data();
        if ((p.stock - (p.sold||0)) <= 0) { showToast('품절입니다', 'warning'); return; }
        const tk = p.priceToken.toLowerCase();
        
        if (!await showConfirmModal('구매 확인', `"${p.title}"\n${p.price} ${p.priceToken}로 구매하시겠습니까?`)) return;
        
        if (isOffchainToken(tk)) {
            // 오프체인 토큰 결제
            const success = await spendOffchainPoints(tk, p.price, `몰 구매: ${p.title}`);
            if (!success) return;
            // 판매자에게 적립
            const sellerOff = (await db.collection('users').doc(p.sellerId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(p.sellerId).update({
                [`offchainBalances.${tk}`]: (sellerOff[tk] || 0) + p.price
            });
            // CRGC 구매 시 기부풀 자동 적립
            if (tk === 'crgc' && typeof autoGivingPoolContribution === 'function') {
                await autoGivingPoolContribution(p.price);
            }
        } else {
            // 온체인 토큰 결제
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < p.price) { showToast(`${p.priceToken} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - p.price });
            const sellerW = await db.collection('users').doc(p.sellerId).collection('wallets').limit(1).get();
            if (!sellerW.empty) { const sb = sellerW.docs[0].data().balances||{}; await sellerW.docs[0].ref.update({ [`balances.${tk}`]: (sb[tk]||0) + p.price }); }
        }
        
        await db.collection('products').doc(id).update({ sold: (p.sold||0) + 1 });
        await db.collection('orders').add({ productId:id, productTitle:p.title, buyerId:currentUser.uid, buyerEmail:currentUser.email, sellerId:p.sellerId, amount:p.price, token:p.priceToken, status:'paid', createdAt:new Date() });
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, p.price, p.priceToken);
        showToast(`🎉 "${p.title}" 구매 완료!`, 'success');
        document.getElementById('product-modal')?.remove();
        loadMallProducts(); loadUserWallet();
    } catch (e) { showToast('구매 실패: ' + e.message, 'error'); }
}

async function loadMyOrders() { const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try { const o = await db.collection('orders').where('buyerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
    if (o.empty) { c.innerHTML='<p style="color:var(--accent);">주문 내역 없음</p>'; return; }
    c.innerHTML=''; o.forEach(d => { const x=d.data(); c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;"><strong>${x.productTitle}</strong> — ${x.amount} ${x.token} <span style="color:var(--accent);">· ${x.status}</span></div>`; });
    } catch(e) { c.innerHTML=e.message; } }

async function loadMyProducts() { const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try { const o = await db.collection('products').where('sellerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
    if (o.empty) { c.innerHTML='<p style="color:var(--accent);">등록 상품 없음</p>'; return; }
    c.innerHTML=''; o.forEach(d => { const x=d.data(); c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;"><strong>${x.title}</strong> — ${x.price} ${x.priceToken} · 판매: ${x.sold||0}/${x.stock}</div>`; });
    } catch(e) { c.innerHTML=e.message; } }

// ========== FUNDRAISE - 모금/기부 ==========

async function createCampaign() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const title = document.getElementById('fund-title').value.trim();
    const goal = parseFloat(document.getElementById('fund-goal').value);
    if (!title || !goal) { showToast('제목과 목표 금액을 입력하세요', 'warning'); return; }
    const imageFile = document.getElementById('fund-image').files[0];
    
    try {
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const days = parseInt(document.getElementById('fund-days').value) || 30;
        
        const platformFee = parseFloat(document.getElementById('fund-fee')?.value) || 2.5;
        await db.collection('campaigns').add({
            title, description: document.getElementById('fund-desc').value.trim(),
            category: document.getElementById('fund-category').value,
            goal, raised: 0, token: document.getElementById('fund-token').value,
            backers: 0, imageData, platformFee,
            creatorId: currentUser.uid, creatorEmail: currentUser.email,
            creatorNickname: userDoc.data()?.nickname || '',
            endDate: new Date(Date.now() + days * 86400000),
            status: 'active', createdAt: new Date()
        });
        
        showToast(`💝 "${title}" 캠페인 시작!`, 'success');
        document.getElementById('fund-title').value = '';
        document.getElementById('fund-desc').value = '';
        loadCampaigns();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadCampaigns() {
    const c = document.getElementById('fund-campaigns');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('campaigns').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">캠페인이 없습니다. 첫 캠페인을 만들어보세요!</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => {
            const x = d.data();
            const pct = Math.min(100, Math.round((x.raised / x.goal) * 100));
            c.innerHTML += `
                <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:180px; object-fit:cover;">` : ''}
                    <div style="padding:1rem;">
                        <h4 style="margin-bottom:0.3rem;">${x.title}</h4>
                        <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${x.creatorNickname || x.creatorEmail} · ${x.backers}명 참여</p>
                        <p style="font-size:0.75rem; color:#2e7d32; margin-bottom:0.5rem;">💰 수수료 ${x.platformFee||2.5}% · 수령 ${100-(x.platformFee||2.5)}%</p>
                        <div style="background:#e0e0e0; height:8px; border-radius:4px; margin-bottom:0.5rem;">
                            <div style="background:#4CAF50; height:100%; border-radius:4px; width:${pct}%;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                            <span style="font-weight:700;">${x.raised} / ${x.goal} ${x.token}</span>
                            <span style="color:var(--accent);">${pct}%</span>
                        </div>
                        <button onclick="donateCampaign('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.8rem; font-weight:700;">💝 기부하기</button>
                    </div>
                </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function donateCampaign(id) {
    const amountStr = await showPromptModal('기부 금액', '기부할 금액을 입력하세요', '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        const camp = doc.data();
        const tk = camp.token.toLowerCase();
        const platformFee = amount * ((camp.platformFee || 2.5) / 100);
        const creatorReceive = amount - platformFee;
        
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `기부: ${camp.title}`);
            if (!success) return;
            const creatorOff = (await db.collection('users').doc(camp.creatorId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(camp.creatorId).update({
                [`offchainBalances.${tk}`]: (creatorOff[tk] || 0) + creatorReceive
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < amount) { showToast('잔액 부족', 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
            const creatorW = await db.collection('users').doc(camp.creatorId).collection('wallets').limit(1).get();
            if (!creatorW.empty) { const cb = creatorW.docs[0].data().balances||{}; await creatorW.docs[0].ref.update({ [`balances.${tk}`]: (cb[tk]||0) + creatorReceive }); }
        }
        
        await db.collection('campaigns').doc(id).update({ raised: camp.raised + amount, backers: camp.backers + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:camp.creatorId, amount, token:camp.token, type:'donation', campaignId:id, platformFee, creatorReceive, timestamp:new Date() });
        await db.collection('platform_fees').add({ campaignId:id, amount:platformFee, token:camp.token, fromUser:currentUser.uid, timestamp:new Date() });
        showToast(`💝 ${amount} ${camp.token} 기부 완료!`, 'success');
        loadCampaigns(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== ENERGY - 에너지 사업 ==========

async function loadEnergyProjects() {
    const c = document.getElementById('energy-projects');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('energy_projects').where('status','==','active').orderBy('createdAt','desc').limit(10).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">등록된 프로젝트가 없습니다. 관리자가 프로젝트를 등록할 수 있습니다.</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data(); const pct = Math.min(100, Math.round((x.invested / x.goal)*100));
            c.innerHTML += `<div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:0.8rem;">
                <h4>⚡ ${x.title}</h4><p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.location || ''} · ${x.capacity || ''}kW · 예상 수익률 ${x.returnRate || 0}%</p>
                <div style="font-size:0.8rem; color:#2e7d32; margin-top:0.3rem;">💰 예상 수익: 투자금 × ${x.returnRate||0}% = <strong>연 ${x.returnRate||0}%</strong></div>
                <div style="font-size:0.75rem; color:var(--accent);">👥 투자자 ${x.investors||0}명</div>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#ff9800; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${x.invested||0}/${x.goal} CRNY</span><span>${pct}%</span></div>
                <button onclick="investEnergy('${d.id}')" style="background:#ff9800; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">☀️ 투자하기</button>
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function investEnergy(id) {
    const tokenChoice = await showPromptModal('투자 토큰 선택', 'CRNY: 1\nCREB (에코·바이오): 2', '1');
    const tk = tokenChoice === '2' ? 'creb' : 'crny';
    const tkName = tk.toUpperCase();
    const amountStr = await showPromptModal('투자 금액', `${tkName} 금액을 입력하세요`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `에너지 투자: ${id}`);
            if (!success) return;
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < amount) { showToast(`${tkName} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
        }
        const doc = await db.collection('energy_projects').doc(id).get();
        await db.collection('energy_projects').doc(id).update({ invested: (doc.data().invested||0) + amount, investors: (doc.data().investors||0) + 1 });
        await db.collection('energy_investments').add({ projectId:id, userId:currentUser.uid, amount, token:tkName, timestamp:new Date() });
        showToast(`☀️ ${amount} ${tkName} 투자 완료!`, 'success'); loadEnergyProjects(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== BUSINESS - 크라우니 생태계 ==========

async function registerBusiness() {
    if (!currentUser) return;
    const name = document.getElementById('biz-name').value.trim();
    if (!name) { showToast('사업체명을 입력하세요', 'warning'); return; }
    try {
        const imageFile = document.getElementById('biz-image').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('businesses').add({
            name, description: document.getElementById('biz-desc').value.trim(),
            category: document.getElementById('biz-category').value,
            country: document.getElementById('biz-country').value.trim(),
            website: document.getElementById('biz-website').value.trim(),
            imageData, ownerId: currentUser.uid, ownerEmail: currentUser.email,
            ownerNickname: userDoc.data()?.nickname || '',
            rating: 0, reviews: 0, status: 'active', createdAt: new Date()
        });
        showToast(`🏢 "${name}" 등록 완료!`, 'success');
        document.getElementById('biz-name').value = '';
        loadBusinessList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadBusinessList() {
    const c = document.getElementById('business-list');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('businesses').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">등록된 사업체가 없습니다</p>'; return; }
        const BIZ_CATS = {retail:'🏪',food:'🍽️',service:'🔧',tech:'💻',education:'📖',health:'💊',logistics:'🚚',entertainment:'🎭',other:'🏢'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div style="background:white; padding:1rem; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08); display:flex; gap:1rem; align-items:center;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:70px; height:70px; border-radius:8px; object-fit:cover;">` : `<div style="width:70px; height:70px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${BIZ_CATS[x.category]||'🏢'}</div>`}
                <div style="flex:1;"><h4>${x.name}</h4><p style="font-size:0.8rem; color:var(--accent);">${BIZ_CATS[x.category]||''} · ${x.country||''} · ${x.ownerNickname||x.ownerEmail}</p>
                ${x.description ? `<p style="font-size:0.85rem; margin-top:0.3rem;">${x.description.slice(0,80)}${x.description.length>80?'...':''}</p>` : ''}
                ${x.website ? `<a href="${x.website}" target="_blank" style="font-size:0.8rem;">🔗 웹사이트</a>` : ''}</div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

// ========== ARTIST - 엔터테인먼트 ==========

async function registerArtist() {
    if (!currentUser) return;
    const name = document.getElementById('artist-name').value.trim();
    if (!name) { showToast('아티스트명을 입력하세요', 'warning'); return; }
    try {
        const imageFile = document.getElementById('artist-photo').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 400);
        await db.collection('artists').add({
            name, bio: document.getElementById('artist-bio').value.trim(),
            genre: document.getElementById('artist-genre').value,
            imageData, userId: currentUser.uid, email: currentUser.email,
            fans: 0, totalSupport: 0, status: 'active', createdAt: new Date()
        });
        showToast(`🌟 "${name}" 등록 완료!`, 'success');
        document.getElementById('artist-name').value = '';
        loadArtistList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadArtistList() {
    const c = document.getElementById('artist-list');
    if (!c) return; c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const docs = await db.collection('artists').where('status','==','active').orderBy('fans','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 아티스트가 없습니다</p>'; return; }
        const GENRES = {music:'🎵',dance:'💃',acting:'🎬',comedy:'😂',creator:'📹',model:'📷',dj:'🎧',other:'🌟'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div style="background:white; border-radius:10px; overflow:hidden; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:160px; overflow:hidden; background:linear-gradient(135deg,#9C27B0,#E91E63);">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:white;">${GENRES[x.genre]||'🌟'}</div>`}</div>
                <div style="padding:0.6rem;"><div style="font-weight:700;">${x.name}</div>
                <div style="font-size:0.75rem; color:var(--accent);">${GENRES[x.genre]||''} · 팬 ${x.fans}명</div>
                <button onclick="supportArtist('${d.id}')" style="background:#E91E63; color:white; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; margin-top:0.4rem; font-size:0.8rem;">💖 후원</button>
                </div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function supportArtist(id) {
    const tokenChoice = await showPromptModal('후원 토큰 선택', 'CRNY: 1\nCRAC (아트·엔터): 2', '1');
    const tk = tokenChoice === '2' ? 'crac' : 'crny';
    const tkName = tk.toUpperCase();
    const amountStr = await showPromptModal('후원 금액', `${tkName} 금액을 입력하세요`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `아티스트 후원: ${id}`);
            if (!success) return;
            const doc = await db.collection('artists').doc(id).get(); const artist = doc.data();
            const artistOff = (await db.collection('users').doc(artist.userId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(artist.userId).update({
                [`offchainBalances.${tk}`]: (artistOff[tk] || 0) + amount
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < amount) { showToast(`${tkName} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
            const doc = await db.collection('artists').doc(id).get(); const artist = doc.data();
            const artistW = await db.collection('users').doc(artist.userId).collection('wallets').limit(1).get();
            if (!artistW.empty) { const ab = artistW.docs[0].data().balances||{}; await artistW.docs[0].ref.update({ [`balances.${tk}`]: (ab[tk]||0) + amount }); }
        }
        const doc2 = await db.collection('artists').doc(id).get(); const artist2 = doc2.data();
        await db.collection('artists').doc(id).update({ totalSupport: (artist2.totalSupport||0) + amount, fans: (artist2.fans||0) + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:artist2.userId, amount, token:tkName, type:'artist_support', artistId:id, timestamp:new Date() });
        showToast(`💖 ${artist2.name}에게 ${amount} ${tkName} 후원!`, 'success'); loadArtistList(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== BOOKS - 출판 ==========

async function registerBook() {
    if (!currentUser) return;
    const title = document.getElementById('book-title').value.trim();
    const price = parseFloat(document.getElementById('book-price').value);
    if (!title) { showToast('책 제목을 입력하세요', 'warning'); return; }
    try {
        const coverFile = document.getElementById('book-cover').files[0];
        let imageData = '';
        if (coverFile) imageData = await fileToBase64Resized(coverFile, 400);
        await db.collection('books').add({
            title, author: document.getElementById('book-author').value.trim(),
            description: document.getElementById('book-desc').value.trim(),
            genre: document.getElementById('book-genre').value,
            price: price || 0, priceToken: document.getElementById('book-token').value,
            imageData, publisherId: currentUser.uid, publisherEmail: currentUser.email,
            sold: 0, rating: 0, reviews: 0, status: 'active', createdAt: new Date()
        });
        showToast(`📚 "${title}" 등록 완료!`, 'success');
        document.getElementById('book-title').value = '';
        loadBooksList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadBooksList() {
    const c = document.getElementById('books-list');
    if (!c) return; c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const docs = await db.collection('books').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 책이 없습니다</p>'; return; }
        const GENRES = {novel:'📕',essay:'📗',selfhelp:'📘',business:'📙',tech:'💻',poetry:'🖋️',children:'🧒',comic:'📒',other:'📚'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div onclick="buyBook('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:180px; overflow:hidden; background:#f5f0e8;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:contain;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem;">${GENRES[x.genre]||'📚'}</div>`}</div>
                <div style="padding:0.5rem;"><div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.title}</div>
                <div style="font-size:0.7rem; color:var(--accent);">${x.author||'저자 미상'}</div>
                <div style="font-weight:700; color:#0066cc; font-size:0.85rem; margin-top:0.2rem;">${x.price>0 ? x.price+' '+x.priceToken : '무료'}</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function buyBook(id) {
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return; const b = doc.data();
    if (b.publisherId === currentUser?.uid) { showToast('본인 책입니다', 'info'); return; }
    if (b.price <= 0) { showToast(`📖 "${b.title}" — 무료 열람!`, 'info'); return; }
    const tk = b.priceToken.toLowerCase();
    if (!await showConfirmModal('책 구매', `"${b.title}"\n${b.price} ${b.priceToken}로 구매하시겠습니까?`)) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, b.price, `책 구매: ${b.title}`);
            if (!success) return;
            const pubOff = (await db.collection('users').doc(b.publisherId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(b.publisherId).update({
                [`offchainBalances.${tk}`]: (pubOff[tk] || 0) + b.price
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < b.price) { showToast('잔액 부족', 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - b.price });
            const pubW = await db.collection('users').doc(b.publisherId).collection('wallets').limit(1).get();
            if (!pubW.empty) { const pb = pubW.docs[0].data().balances||{}; await pubW.docs[0].ref.update({ [`balances.${tk}`]: (pb[tk]||0) + b.price }); }
        }
        await db.collection('books').doc(id).update({ sold: (b.sold||0) + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:b.publisherId, amount:b.price, token:b.priceToken, type:'book_purchase', bookId:id, timestamp:new Date() });
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, b.price, b.priceToken);
        showToast(`📖 "${b.title}" 구매 완료!`, 'success'); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== CREDIT - P2P 크레딧 ==========

function showCreditTab(tab) {
    document.querySelectorAll('.credit-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.credit-tab').forEach(t => {
        t.style.background = 'white'; t.style.color = 'var(--text)'; t.style.borderColor = 'var(--border)';
    });
    document.getElementById(`credit-${tab}`).style.display = 'block';
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; btn.style.borderColor = 'var(--primary)'; }
}

// 환전 (수수료 0%)
// swapTokens() → 위 오프체인 섹션으로 통합 이동됨

// 품앗이 요청 (무이자 P2P)
async function requestPumasi() {
    if (!currentUser) return;
    const amount = parseFloat(document.getElementById('pumasi-amount').value);
    const reason = document.getElementById('pumasi-reason').value.trim();
    const days = parseInt(document.getElementById('pumasi-days').value) || 30;
    if (!amount || !reason) { showToast('금액과 사유를 입력하세요', 'warning'); return; }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('pumasi_requests').add({
            requesterId: currentUser.uid, requesterEmail: currentUser.email,
            requesterNickname: userDoc.data()?.nickname || '',
            amount, reason, days, interest: 0,
            raised: 0, backers: 0,
            dueDate: new Date(Date.now() + days * 86400000),
            status: 'active', createdAt: new Date()
        });
        showToast(`🤝 품앗이 ${amount} CRNY 요청 완료!`, 'success');
        loadPumasiList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadPumasiList() {
    const c = document.getElementById('pumasi-list');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('pumasi_requests').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">요청이 없습니다</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data(); const pct = Math.min(100, Math.round((x.raised/x.amount)*100));
            c.innerHTML += `<div style="background:white; padding:1rem; border-radius:8px; margin-bottom:0.5rem;">
                <div style="display:flex; justify-content:space-between;"><strong>${x.requesterNickname || x.requesterEmail}</strong><span style="color:#0066cc; font-weight:700;">${x.amount} CRNY</span></div>
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.reason}</p>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#4CAF50; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${x.raised}/${x.amount} · ${x.backers}명</span><span style="color:#4CAF50;">이자 0%</span></div>
                ${x.requesterId !== currentUser?.uid ? `<button onclick="contributePumasi('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">🤝 도와주기</button>` : ''}
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function contributePumasi(id) {
    const tokenChoice = await showPromptModal('도와줄 토큰 선택', 'CRNY: 1\n오프체인 토큰: 2', '1');
    let tk = 'crny';
    if (tokenChoice === '2') {
        const offChoice = await showPromptModal('오프체인 토큰 선택', 'CRTD: 4\nCRAC: 5\nCRGC: 6\nCREB: 7', '4');
        const offMap = { '4':'crtd', '5':'crac', '6':'crgc', '7':'creb' };
        tk = offMap[offChoice] || 'crtd';
    }
    const tkName = tk.toUpperCase();
    const amountStr = await showPromptModal('도와줄 금액', `${tkName} 금액을 입력하세요`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `품앗이 기여: ${id}`);
            if (!success) return;
            const doc = await db.collection('pumasi_requests').doc(id).get(); const req = doc.data();
            const reqOff = (await db.collection('users').doc(req.requesterId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(req.requesterId).update({
                [`offchainBalances.${tk}`]: (reqOff[tk] || 0) + amount
            });
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < amount) { showToast(`${tkName} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
            const doc = await db.collection('pumasi_requests').doc(id).get(); const req = doc.data();
            const reqW = await db.collection('users').doc(req.requesterId).collection('wallets').limit(1).get();
            if (!reqW.empty) { const rb = reqW.docs[0].data().balances||{}; await reqW.docs[0].ref.update({ [`balances.${tk}`]: (rb[tk]||0) + amount }); }
        }
        const doc2 = await db.collection('pumasi_requests').doc(id).get(); const req2 = doc2.data();
        await db.collection('pumasi_requests').doc(id).update({ raised: req2.raised + amount, backers: req2.backers + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:req2.requesterId, amount, token:tkName, type:'pumasi', pumasiId:id, timestamp:new Date() });
        showToast(`🤝 ${amount} ${tkName} 도움 완료!`, 'success'); loadPumasiList(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// 보험 신청
async function requestInsurance() {
    if (!currentUser) return;
    const type = document.getElementById('insurance-type').value;
    const amount = parseFloat(document.getElementById('insurance-amount').value);
    const reason = document.getElementById('insurance-reason').value.trim();
    if (!amount || !reason) { showToast('금액과 사유를 입력하세요', 'warning'); return; }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('insurance_requests').add({
            requesterId: currentUser.uid, requesterEmail: currentUser.email,
            requesterNickname: userDoc.data()?.nickname || '',
            type, amount, reason,
            status: 'pending', // 중간 관리자 승인 필요
            approvedBy: null, funded: 0,
            createdAt: new Date()
        });
        showToast('🛡️ 보험 신청 완료! 중간 관리자의 검토 후 승인됩니다.', 'success');
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// 기부
async function quickDonate() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const amount = parseFloat(document.getElementById('donate-amount').value);
    const token = document.getElementById('donate-token-type').value;
    const target = document.getElementById('donate-target').value;
    if (!amount || amount < 1) { showToast('최소 1 이상 기부해주세요', 'warning'); return; }
    
    try {
        const tk = token.toLowerCase();
        
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `기부: ${target}`);
            if (!success) return;
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk]||0) < amount) { showToast(`${token} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
        }
        
        const donation = {
            donorId: currentUser.uid, donorEmail: currentUser.email,
            amount, token, targetType: target,
            timestamp: new Date()
        };
        
        if (target === 'designated') {
            const targetEmail = document.getElementById('donate-target-email').value.trim();
            if (targetEmail) {
                donation.targetEmail = targetEmail;
                const targetUsers = await db.collection('users').where('email','==',targetEmail).get();
                if (!targetUsers.empty) {
                    const targetUid = targetUsers.docs[0].id;
                    if (isOffchainToken(tk)) {
                        const tOff = targetUsers.docs[0].data()?.offchainBalances || {};
                        await db.collection('users').doc(targetUid).update({
                            [`offchainBalances.${tk}`]: (tOff[tk] || 0) + amount
                        });
                    } else {
                        const tW = await db.collection('users').doc(targetUid).collection('wallets').limit(1).get();
                        if (!tW.empty) { const tb = tW.docs[0].data().balances||{}; await tW.docs[0].ref.update({ [`balances.${tk}`]: (tb[tk]||0) + amount }); }
                    }
                }
            }
        }
        
        await db.collection('donations').add(donation);
        showToast(`💝 ${amount} ${token} 기부 완료!`, 'success'); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadCreditInfo() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const data = userDoc.data();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        const crnyHeld = bal.crny || 0;
        const score = Math.min(850, 300 + crnyHeld * 10 + (data.referralCount || 0) * 20);
        
        const scoreEl = document.getElementById('credit-score');
        if (scoreEl) { scoreEl.textContent = score; scoreEl.style.color = score >= 700 ? '#4CAF50' : score >= 500 ? '#ff9800' : '#cc0000'; }
        
        const loans = await db.collection('pumasi_requests').where('requesterId','==',currentUser.uid).where('status','==','active').get();
        const loansEl = document.getElementById('active-loans');
        if (loansEl) loansEl.textContent = `${loans.size}건`;
        
        // 총 기부
        const donations = await db.collection('donations').where('donorId','==',currentUser.uid).get();
        let totalDonated = 0;
        donations.forEach(d => totalDonated += d.data().amount || 0);
        const donatedEl = document.getElementById('total-donated');
        if (donatedEl) donatedEl.textContent = totalDonated;
    } catch (e) { console.error(e); }
}

// ========== ENERGY ADMIN ==========

async function createEnergyProject() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const title = document.getElementById('energy-title')?.value.trim();
    const location = document.getElementById('energy-location')?.value.trim();
    const capacity = parseFloat(document.getElementById('energy-capacity')?.value) || 0;
    const returnRate = parseFloat(document.getElementById('energy-return')?.value) || 0;
    const goal = parseFloat(document.getElementById('energy-goal')?.value) || 0;
    if (!title || !goal) { showToast('프로젝트명과 목표 금액을 입력하세요', 'warning'); return; }
    try {
        await db.collection('energy_projects').add({
            title, location, capacity, returnRate, goal,
            invested: 0, investors: 0, status: 'active',
            creatorId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`⚡ "${title}" 프로젝트 등록!`, 'success');
        document.getElementById('energy-title').value = '';
        loadEnergyProjects();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== GYE (계모임) ==========

async function createGye() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const name = document.getElementById('gye-name')?.value.trim();
    const monthlyAmount = parseFloat(document.getElementById('gye-amount')?.value);
    const maxMembers = parseInt(document.getElementById('gye-members')?.value) || 10;
    if (!name || !monthlyAmount) { showToast('이름과 월 납입금을 입력하세요', 'warning'); return; }
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('gye_groups').add({
            name, monthlyAmount, maxMembers,
            currentMembers: 1, currentRound: 0,
            members: [{ userId: currentUser.uid, email: currentUser.email, nickname: userDoc.data()?.nickname || '' }],
            organizerId: currentUser.uid, organizerEmail: currentUser.email,
            organizerNickname: userDoc.data()?.nickname || '',
            token: 'CRNY', status: 'recruiting',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`🔄 "${name}" 계모임 생성!`, 'success');
        document.getElementById('gye-name').value = '';
        loadGyeList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadGyeList() {
    const c = document.getElementById('gye-list');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('gye_groups').where('status','in',['recruiting','active']).orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">계모임이 없습니다. 첫 계를 만들어보세요!</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => {
            const g = d.data();
            const isMember = g.members?.some(m => m.userId === currentUser?.uid);
            c.innerHTML += `<div style="background:white; padding:1rem; border-radius:8px; margin-bottom:0.5rem; border-left:4px solid #FF9800;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>🔄 ${g.name}</strong>
                        <div style="font-size:0.8rem; color:var(--accent);">${g.organizerNickname || g.organizerEmail} · ${g.currentMembers}/${g.maxMembers}명</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:#FF9800;">${g.monthlyAmount} CRNY/월</div>
                        <div style="font-size:0.75rem; color:var(--accent);">Round ${g.currentRound}</div>
                    </div>
                </div>
                ${!isMember && g.currentMembers < g.maxMembers ? `<button onclick="joinGye('${d.id}')" style="background:#FF9800; color:white; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem; font-size:0.85rem;">🤝 참여하기</button>` : ''}
                ${isMember ? '<div style="text-align:center; font-size:0.8rem; color:#FF9800; margin-top:0.5rem;">✅ 참여 중</div>' : ''}
                ${g.status === 'recruiting' && g.currentMembers >= g.maxMembers ? '<div style="text-align:center; font-size:0.8rem; color:#999; margin-top:0.5rem;">모집 완료</div>' : ''}
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function joinGye(gyeId) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('gye_groups').doc(gyeId).get();
        const g = doc.data();
        if (g.currentMembers >= g.maxMembers) { showToast('정원 초과', 'warning'); return; }
        if (g.members?.some(m => m.userId === currentUser.uid)) { showToast('이미 참여 중', 'info'); return; }
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const confirmed = await showConfirmModal('계모임 참여', `"${g.name}"\n월 ${g.monthlyAmount} CRNY 납입\n참여하시겠습니까?`);
        if (!confirmed) return;
        await db.collection('gye_groups').doc(gyeId).update({
            members: firebase.firestore.FieldValue.arrayUnion({
                userId: currentUser.uid, email: currentUser.email,
                nickname: userDoc.data()?.nickname || ''
            }),
            currentMembers: g.currentMembers + 1
        });
        showToast('🤝 계모임 참여 완료!', 'success');
        loadGyeList();
    } catch (e) { showToast('참여 실패: ' + e.message, 'error'); }
}

// 몰 브랜드 필터
function filterMallBrand(brand) {
    // product-category 셀렉트를 해당 브랜드로 설정하고 로드
    const sel = document.getElementById('product-category');
    if (sel) sel.value = brand;
    
    // mall-filter용 별도 처리
    window._mallBrandFilter = brand;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

