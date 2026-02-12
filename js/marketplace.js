// ===== marketplace.js - 쇼핑몰, 모금, 에너지, 비즈니스, 아티스트, 출판, P2P크레딧 =====

const ORDER_STATUS_LABELS = { paid:t('mall.status_paid','💰 결제완료'), shipping:t('mall.status_shipping','🚚 배송중'), delivered:t('mall.status_delivered','✅ 배송완료'), cancelled:t('mall.status_cancelled','❌ 취소') };
const ORDER_STATUS_COLORS = { paid:'#ff9800', shipping:'#2196f3', delivered:'#4CAF50', cancelled:'#cc0000' };
const MALL_CATEGORIES = {
    'present':'💄 프레즌트','doctor':'💊 포닥터','medical':'🏥 메디컬','avls':'🎬 AVLs',
    'solution':'🔐 프라이빗','architect':'🏗️ 아키텍트','mall':'🛒 크라우니몰','designers':'👗 디자이너스',
    '뷰티':'💄 화장품','음향':'🔊 음향','헬스':'💪 헬스','생활':'☕ 생활','전자':'🔋 전자','패션':'👗 패션','식품':'🍽️ 식품','기타':'📦 기타'
};

function renderStars(rating, size='0.85rem') {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= Math.round(rating) ? '#FFD700' : '#ddd'}; font-size:${size};">★</span>`;
    return s;
}

async function loadMallProducts() {
    const container = document.getElementById('mall-products');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const brandFilter = window._mallBrandFilter || null;
        let query = db.collection('products').where('status', '==', 'active');
        if (brandFilter) query = query.where('category', '==', brandFilter);
        const docs = await query.orderBy('createdAt', 'desc').limit(50).get();
        if (docs.empty) { container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 상품이 없습니다</p>'; return; }

        let items = [];
        docs.forEach(d => items.push({ id: d.id, ...d.data() }));

        // 검색 필터
        const searchVal = (document.getElementById('mall-search')?.value || '').trim().toLowerCase();
        if (searchVal) items = items.filter(p => p.title.toLowerCase().includes(searchVal) || (p.description||'').toLowerCase().includes(searchVal));

        // 정렬
        const sortVal = document.getElementById('mall-sort')?.value || 'newest';
        if (sortVal === 'price-low') items.sort((a,b) => a.price - b.price);
        else if (sortVal === 'price-high') items.sort((a,b) => b.price - a.price);
        else if (sortVal === 'popular') items.sort((a,b) => (b.sold||0) - (a.sold||0));
        else if (sortVal === 'rating') items.sort((a,b) => (b.avgRating||0) - (a.avgRating||0));

        if (items.length === 0) { container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">검색 결과가 없습니다</p>'; return; }
        container.innerHTML = '';
        items.forEach(p => {
            const ratingHtml = p.avgRating ? `<div style="margin-top:0.2rem;">${renderStars(p.avgRating, '0.7rem')} <span style="font-size:0.65rem; color:var(--accent);">(${p.reviewCount||0})</span></div>` : '';
            container.innerHTML += `
                <div onclick="viewProduct('${p.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08); position:relative;">
                    <button onclick="event.stopPropagation(); toggleWishlist('${p.id}')" style="position:absolute; top:6px; right:6px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.9rem; z-index:1;">🤍</button>
                    <div style="height:140px; overflow:hidden; background:#f0f0f0;">${p.imageData ? `<img src="${p.imageData}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#ccc;">🛒</div>`}</div>
                    <div style="padding:0.6rem;">
                        <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${MALL_CATEGORIES[p.category] || p.category || ''} · ${p.sellerNickname || p.sellerEmail || t('mall.seller','판매자')}</div>
                        <div style="font-weight:700; color:#0066cc; margin-top:0.3rem;">${p.price} CRGC</div>
                        <div style="font-size:0.7rem; color:var(--accent);">재고: ${p.stock - (p.sold||0)}개</div>
                        ${ratingHtml}
                        <button onclick="event.stopPropagation(); addToCart('${p.id}')" style="width:100%; margin-top:0.4rem; background:#0066cc; color:white; border:none; padding:0.35rem; border-radius:5px; cursor:pointer; font-size:0.75rem; font-weight:600;">🛒 담기</button>
                    </div>
                </div>`;
        });
    } catch (e) { container.innerHTML = `<p style="color:red; grid-column:1/-1;">${e.message}</p>`; }
}

async function viewProduct(id) {
    // Navigate to full-page product detail
    history.replaceState(null, '', `#page=product-detail&id=${id}`);
    showPage('product-detail');
    renderProductDetail(id);
}

async function renderProductDetail(id) {
    const c = document.getElementById('product-detail-content');
    if (!c) return;
    c.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">로딩 중...</p>';
    try {
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) { c.innerHTML = '<p style="text-align:center; color:red;">상품을 찾을 수 없습니다</p>'; return; }
        const p = doc.data();
        const isOwner = currentUser?.uid === p.sellerId;
        const remaining = p.stock - (p.sold || 0);

        // Check wishlist status
        let isWished = false;
        if (currentUser) {
            const wSnap = await db.collection('users').doc(currentUser.uid).collection('wishlist').where('productId','==',id).limit(1).get();
            isWished = !wSnap.empty;
        }

        // Reviews
        let reviewsHtml = '';
        try {
            const revSnap = await db.collection('product_reviews').where('productId','==',id).orderBy('createdAt','desc').limit(20).get();
            if (!revSnap.empty) {
                reviewsHtml = '<div style="margin-top:1.5rem;"><h4 style="margin-bottom:0.8rem;">📝 리뷰</h4>';
                revSnap.forEach(r => {
                    const rv = r.data();
                    reviewsHtml += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; font-weight:600;">${rv.buyerEmail?.split('@')[0] || '구매자'}</span>
                            <span>${renderStars(rv.rating, '0.8rem')}</span>
                        </div>
                        ${rv.comment ? `<p style="font-size:0.85rem; margin-top:0.3rem; color:#555;">${rv.comment}</p>` : ''}
                    </div>`;
                });
                reviewsHtml += '</div>';
            }
        } catch(e) {}

        // Review button for delivered orders
        let reviewBtnHtml = '';
        if (currentUser && !isOwner) {
            try {
                const myOrders = await db.collection('orders').where('buyerId','==',currentUser.uid).where('productId','==',id).where('status','==','delivered').limit(1).get();
                if (!myOrders.empty) {
                    const existingReview = await db.collection('product_reviews').where('productId','==',id).where('buyerId','==',currentUser.uid).limit(1).get();
                    if (existingReview.empty) {
                        reviewBtnHtml = `<button onclick="writeReview('${id}')" style="background:#ff9800; color:white; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; font-weight:600; width:100%; margin-top:0.5rem;">⭐ 리뷰 작성</button>`;
                    }
                }
            } catch(e) {}
        }

        const ratingDisplay = p.avgRating ? `<div style="margin:0.5rem 0;">${renderStars(p.avgRating, '1rem')} <span style="font-size:0.9rem; color:var(--accent);">${p.avgRating.toFixed(1)} (${p.reviewCount||0}개)</span></div>` : '';

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← 목록으로</button>
            <div style="background:#f5f5f5; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                ${p.imageData ? `<img src="${p.imageData}" style="width:100%; max-height:50vh; object-fit:contain;">` : `<div style="width:100%;height:250px;display:flex;align-items:center;justify-content:center;font-size:5rem;color:#ccc;">🛒</div>`}
            </div>
            <div style="background:white; padding:1.2rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h2 style="margin:0; flex:1;">${p.title}</h2>
                    <button onclick="toggleWishlist('${id}')" id="wish-btn-${id}" style="background:none; border:none; font-size:1.5rem; cursor:pointer; padding:0.2rem;">${isWished ? '❤️' : '🤍'}</button>
                </div>
                <p style="color:var(--accent); font-size:0.85rem; margin:0.5rem 0;">${[MALL_CATEGORIES[p.category], p.sellerNickname || p.sellerEmail ? '판매자: '+(p.sellerNickname||p.sellerEmail) : ''].filter(Boolean).join(' · ')}</p>
                ${ratingDisplay}
                ${p.description ? `<p style="font-size:0.95rem; margin:1rem 0; line-height:1.6; color:#444;">${p.description}</p>` : ''}
                <div style="font-size:1.4rem; font-weight:700; color:#0066cc; margin:1rem 0;">${p.price} CRGC</div>
                <div style="font-size:0.85rem; color:var(--accent); margin-bottom:1rem;">재고: ${remaining}개 · 판매: ${p.sold||0}개</div>
                ${!isOwner && remaining > 0 ? `
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="buyProduct('${id}')" style="flex:2; background:#0066cc; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:1rem;">🛒 바로 구매</button>
                    <button onclick="addToCart('${id}')" style="flex:1; background:white; color:#0066cc; border:2px solid #0066cc; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">담기</button>
                </div>` : ''}
                ${remaining <= 0 ? '<p style="color:#cc0000; font-weight:700; text-align:center; font-size:1.1rem; margin:1rem 0;">품절</p>' : ''}
                ${reviewBtnHtml}
            </div>
            ${reviewsHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

async function writeReview(productId) {
    const ratingStr = await showPromptModal(t('mall.rating','별점'), t('mall.enter_rating','1~5점을 입력하세요'), '5');
    const rating = parseInt(ratingStr);
    if (!rating || rating < 1 || rating > 5) { showToast(t('mall.rating_range','1~5 사이 점수를 입력하세요'), 'warning'); return; }
    const comment = await showPromptModal(t('mall.review','리뷰'), t('mall.write_short_review','한줄 리뷰를 작성하세요 (선택)'), '');
    try {
        await db.collection('product_reviews').add({
            productId, buyerId: currentUser.uid, buyerEmail: currentUser.email,
            rating, comment: comment || '', createdAt: new Date()
        });
        // 상품 평균 평점 업데이트
        const allRevs = await db.collection('product_reviews').where('productId','==',productId).get();
        let total = 0; allRevs.forEach(r => total += r.data().rating);
        const avg = total / allRevs.size;
        await db.collection('products').doc(productId).update({ avgRating: Math.round(avg * 10) / 10, reviewCount: allRevs.size });
        showToast(t('mall.review_done','⭐ 리뷰 등록 완료!'), 'success');
        document.getElementById('product-modal')?.remove();
        viewProduct(productId);
    } catch (e) { showToast('리뷰 실패: ' + e.message, 'error'); }
}

async function buyProduct(id) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('products').doc(id).get();
        const p = doc.data();
        if ((p.stock - (p.sold||0)) <= 0) { showToast(t('mall.sold_out','품절'), 'warning'); return; }
        const tk = 'crgc';
        
        if (!await showConfirmModal(t('mall.confirm_buy','구매 확인'), `"${p.title}"\n${p.price} CRGC로 구매하시겠습니까?`)) return;
        
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, p.price, `몰 구매: ${p.title}`);
            if (!success) return;
            const sellerOff = (await db.collection('users').doc(p.sellerId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(p.sellerId).update({
                [`offchainBalances.${tk}`]: (sellerOff[tk] || 0) + p.price
            });
            if (typeof autoGivingPoolContribution === 'function') {
                await autoGivingPoolContribution(p.price);
            }
        } else {
            // MALL은 CRGC(오프체인) 전용이므로 온체인 경로 불필요
            showToast('CRGC 잔액 부족', 'error'); return;
        }
        
        await db.collection('products').doc(id).update({ sold: (p.sold||0) + 1 });
        await db.collection('orders').add({ productId:id, productTitle:p.title, buyerId:currentUser.uid, buyerEmail:currentUser.email, sellerId:p.sellerId, sellerEmail:p.sellerEmail||'', amount:p.price, token:'CRGC', status:'paid', createdAt:new Date() });
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, p.price, 'CRGC');
        showToast(`🎉 "${p.title}" 구매 완료!`, 'success');
        document.getElementById('product-modal')?.remove();
        loadMallProducts(); loadUserWallet();
    } catch (e) { showToast('구매 실패: ' + e.message, 'error'); }
}

async function loadMyOrders() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try {
        const o = await db.collection('orders').where('buyerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
        if (o.empty) { c.innerHTML='<p style="color:var(--accent);">주문 내역 없음</p>'; return; }
        c.innerHTML='';
        o.forEach(d => {
            const x = d.data();
            const statusLabel = ORDER_STATUS_LABELS[x.status] || x.status;
            const statusColor = ORDER_STATUS_COLORS[x.status] || 'var(--accent)';
            const reviewBtn = x.status === 'delivered' ? `<button onclick="event.stopPropagation(); writeReview('${x.productId}')" style="background:#ff9800; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-left:0.5rem;">⭐ 리뷰</button>` : '';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <div><strong>${x.productTitle}</strong> — ${x.amount} ${x.token}</div>
                <div><span style="color:${statusColor}; font-weight:600;">${statusLabel}</span>${reviewBtn}</div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function loadMyProducts() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try {
        const o = await db.collection('products').where('sellerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
        if (o.empty) { c.innerHTML='<p style="color:var(--accent);">등록 상품 없음</p>'; return; }
        c.innerHTML='';
        o.forEach(d => {
            const x = d.data();
            const statusBadge = x.status === 'active' ? '<span style="color:#4CAF50; font-size:0.75rem;">● 판매중</span>' : '<span style="color:#999; font-size:0.75rem;">● 비활성</span>';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.title}</strong> — ${x.price} CRGC · 판매: ${x.sold||0}/${x.stock} ${statusBadge}</div>
                    <div style="display:flex; gap:0.3rem;">
                        <button onclick="editProduct('${d.id}')" style="background:#2196f3; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.edit_btn','✏️ 수정')}</button>
                        <button onclick="toggleProduct('${d.id}','${x.status}')" style="background:${x.status==='active'?'#999':'#4CAF50'}; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${x.status==='active'?t('mall.deactivate','⏸ 비활성'):t('mall.activate','▶ 활성')}</button>
                        <button onclick="deleteProduct('${d.id}')" style="background:#cc0000; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">🗑️</button>
                    </div>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function editProduct(id) {
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) return;
    const p = doc.data();
    const newPrice = await showPromptModal(t('mall.edit_price','가격 수정'), `현재 가격: ${p.price} ${p.priceToken}`, String(p.price));
    if (newPrice === null) return;
    const newStock = await showPromptModal(t('mall.edit_stock','재고 수정'), `현재 재고: ${p.stock}`, String(p.stock));
    if (newStock === null) return;
    const newDesc = await showPromptModal(t('mall.edit_desc','설명 수정'), t('mall.product_desc','상품 설명'), p.description || '');
    if (newDesc === null) return;
    try {
        await db.collection('products').doc(id).update({
            price: parseFloat(newPrice) || p.price,
            stock: parseInt(newStock) || p.stock,
            description: newDesc
        });
        showToast(t('mall.edit_done','✏️ 상품 수정 완료'), 'success');
        loadMyProducts();
    } catch (e) { showToast('수정 실패: ' + e.message, 'error'); }
}

async function toggleProduct(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const label = newStatus === 'active' ? t('mall.activate_label','활성화') : t('mall.deactivate_label','비활성화');
    if (!await showConfirmModal('상품 ' + label, `이 상품을 ${label}하시겠습니까?`)) return;
    try {
        await db.collection('products').doc(id).update({ status: newStatus });
        showToast(`상품 ${label} 완료`, 'success');
        loadMyProducts();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function deleteProduct(id) {
    if (!await showConfirmModal(t('mall.delete_product','상품 삭제'), t('mall.confirm_delete_product','이 상품을 삭제하시겠습니까? 복구할 수 없습니다.'))) return;
    try {
        await db.collection('products').doc(id).delete();
        showToast(t('mall.deleted','🗑️ 상품 삭제 완료'), 'success');
        loadMyProducts();
    } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
}

async function loadSellerOrders() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try {
        const o = await db.collection('orders').where('sellerId','==',currentUser.uid).orderBy('createdAt','desc').limit(30).get();
        if (o.empty) { c.innerHTML='<p style="color:var(--accent);">받은 주문 없음</p>'; return; }
        c.innerHTML='';
        o.forEach(d => {
            const x = d.data();
            const statusLabel = ORDER_STATUS_LABELS[x.status] || x.status;
            const statusColor = ORDER_STATUS_COLORS[x.status] || 'var(--accent)';
            const nextActions = [];
            if (x.status === 'paid') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','shipping')" style="background:#2196f3; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.process_shipping','🚚 배송처리')}</button>`);
            if (x.status === 'shipping') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','delivered')" style="background:#4CAF50; color:white; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.mark_delivered','✅ 배송완료')}</button>`);
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.productTitle}</strong> — ${x.amount} ${x.token}<br><span style="font-size:0.75rem; color:var(--accent);">구매자: ${x.buyerEmail}</span></div>
                    <div style="display:flex; align-items:center; gap:0.3rem;">
                        <span style="color:${statusColor}; font-weight:600; font-size:0.8rem;">${statusLabel}</span>
                        ${nextActions.join('')}
                    </div>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function updateOrderStatus(orderId, newStatus) {
    const label = ORDER_STATUS_LABELS[newStatus] || newStatus;
    if (!await showConfirmModal(t('mall.change_status','주문 상태 변경'), `${label}(으)로 변경하시겠습니까?`)) return;
    try {
        await db.collection('orders').doc(orderId).update({ status: newStatus, [`${newStatus}At`]: new Date() });
        showToast(`${label} 처리 완료`, 'success');
        loadSellerOrders();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== FUNDRAISE - 모금/기부 ==========

async function createCampaign() {
    if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
    const title = document.getElementById('fund-title').value.trim();
    const goal = parseFloat(document.getElementById('fund-goal').value);
    if (!title || !goal) { showToast(t('fund.enter_title_goal','제목과 목표 금액을 입력하세요'), 'warning'); return; }
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
            goal, raised: 0, token: 'CRGC',
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
            const isCreator = currentUser?.uid === x.creatorId;
            c.innerHTML += `
                <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;" onclick="showCampaignDetail('${d.id}')">
                    ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:180px; object-fit:cover;">` : ''}
                    <div style="padding:1rem;">
                        <h4 style="margin-bottom:0.3rem;">${x.title}</h4>
                        <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${x.creatorNickname || x.creatorEmail} · ${x.backerCount || x.backers || 0}명 참여</p>
                        <p style="font-size:0.75rem; color:#2e7d32; margin-bottom:0.5rem;">💰 수수료 ${x.platformFee||2.5}% · 수령 ${100-(x.platformFee||2.5)}%</p>
                        <div style="background:#e0e0e0; height:8px; border-radius:4px; margin-bottom:0.5rem;">
                            <div style="background:#4CAF50; height:100%; border-radius:4px; width:${pct}%;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                            <span style="font-weight:700;">${x.raised} / ${x.goal} ${x.token}</span>
                            <span style="color:var(--accent);">${pct}%</span>
                        </div>
                        <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
                            <button onclick="event.stopPropagation(); donateCampaign('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; flex:1; font-weight:700;">${t('fundraise.donate_btn','💝 기부하기')}</button>
                            ${isCreator ? `<button onclick="event.stopPropagation(); closeCampaign('${d.id}')" style="background:#e53935; color:white; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.8rem;">${t('fund.close','🔒 종료')}</button>` : ''}
                        </div>
                    </div>
                </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function donateCampaign(id) {
    const amountStr = await showPromptModal(t('fund.donate_amount','기부 금액'), t('fund.enter_amount','기부할 금액을 입력하세요'), '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        const camp = doc.data();
        const tk = 'crgc';
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
            if ((bal[tk]||0) < amount) { showToast(t('mall.insufficient','잔액 부족'), 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
            const creatorW = await db.collection('users').doc(camp.creatorId).collection('wallets').limit(1).get();
            if (!creatorW.empty) { const cb = creatorW.docs[0].data().balances||{}; await creatorW.docs[0].ref.update({ [`balances.${tk}`]: (cb[tk]||0) + creatorReceive }); }
        }
        
        await db.collection('campaigns').doc(id).update({ raised: camp.raised + amount, backers: camp.backers + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:camp.creatorId, amount, token:camp.token, type:'donation', campaignId:id, platformFee, creatorReceive, timestamp:new Date() });
        await db.collection('campaign_donors').add({ campaignId:id, donorId:currentUser.uid, donorEmail:currentUser.email, amount, token:camp.token, timestamp:new Date() });
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
        docs.forEach(d => { const x = d.data();
            const xTitle = x.name || x.title || '';
            const xGoal = x.goal || x.targetAmount || 0;
            const xInvested = x.invested || x.currentAmount || 0;
            const xInvestors = x.investors || x.investorCount || 0;
            const pct = Math.min(100, Math.round((xInvested / xGoal)*100));
            const rate = x.returnRate || 0;
            const exMonthly = (100 * rate / 100 / 12).toFixed(2);
            const isAdmin = currentUser && (currentUser.email === 'admin@crowny.org' || currentUser.uid === x.creatorId);
            c.innerHTML += `<div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:0.8rem;">
                <h4>⚡ ${xTitle}</h4><p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.location || ''} · ${x.capacity || ''}kW · 예상 수익률 ${rate}%</p>
                <div style="font-size:0.8rem; color:#2e7d32; margin-top:0.3rem;">💰 100 CREB 투자 시 → 월 ${exMonthly} CREB (연 ${rate}%)</div>
                <div style="font-size:0.75rem; color:var(--accent);">👥 투자자 ${xInvestors}명</div>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#ff9800; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${xInvested}/${xGoal} CREB</span><span>${pct}%</span></div>
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button onclick="investEnergy('${d.id}')" style="background:#ff9800; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1;">${t('energy.invest_btn','☀️ 투자하기')}</button>
                    ${isAdmin ? `<button onclick="distributeEnergyReturns('${d.id}')" style="background:#1976D2; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1; font-size:0.8rem;">${t('energy.distribute','📊 수익 배분')}</button>` : ''}
                </div>
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function investEnergy(id) {
    const tk = 'creb';
    const tkName = 'CREB';
    const amountStr = await showPromptModal(t('energy.invest_amount','투자 금액'), `${tkName} ${t('energy.enter_amount','금액을 입력하세요')}`, '');
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
        const epData = doc.data();
        await db.collection('energy_projects').doc(id).update({ invested: (epData.invested || epData.currentAmount || 0) + amount, investors: (epData.investors || epData.investorCount || 0) + 1 });
        await db.collection('energy_investments').add({ projectId:id, userId:currentUser.uid, amount, token:tkName, timestamp:new Date() });
        showToast(`☀️ ${amount} ${tkName} 투자 완료!`, 'success'); loadEnergyProjects(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== BUSINESS - 크라우니 생태계 ==========

async function registerBusiness() {
    if (!currentUser) return;
    const name = document.getElementById('biz-name').value.trim();
    if (!name) { showToast(t('biz.enter_name','사업체명을 입력하세요'), 'warning'); return; }
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
            c.innerHTML += `<div onclick="viewBusinessDetail('${d.id}')" style="background:white; padding:1rem; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08); display:flex; gap:1rem; align-items:center; cursor:pointer;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:70px; height:70px; border-radius:8px; object-fit:cover;">` : `<div style="width:70px; height:70px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${BIZ_CATS[x.category]||'🏢'}</div>`}
                <div style="flex:1;"><h4>${x.name}</h4><p style="font-size:0.8rem; color:var(--accent);">${[BIZ_CATS[x.category], x.country, x.ownerNickname || x.ownerEmail].filter(Boolean).join(' · ')}</p>
                ${x.description ? `<p style="font-size:0.85rem; margin-top:0.3rem;">${x.description.slice(0,80)}${x.description.length>80?'...':''}</p>` : ''}
                <div style="font-size:0.75rem; color:var(--accent); margin-top:0.3rem;">⭐ ${x.reviews > 0 ? (x.rating/x.reviews).toFixed(1) : '-'} · ${x.reviews||0}개 리뷰</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

// ========== ARTIST - 엔터테인먼트 ==========

async function registerArtist() {
    if (!currentUser) return;
    const name = document.getElementById('artist-name').value.trim();
    if (!name) { showToast(t('artist.enter_name','아티스트명을 입력하세요'), 'warning'); return; }
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
            c.innerHTML += `<div onclick="viewArtistDetail('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;">
                <div style="height:160px; overflow:hidden; background:linear-gradient(135deg,#9C27B0,#E91E63);">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:white;">${GENRES[x.genre]||'🌟'}</div>`}</div>
                <div style="padding:0.6rem;"><div style="font-weight:700;">${x.name}</div>
                <div style="font-size:0.75rem; color:var(--accent);">${GENRES[x.genre]||''} · 팬 ${x.fans}명</div>
                <button onclick="event.stopPropagation(); supportArtist('${d.id}')" style="background:#E91E63; color:white; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; margin-top:0.4rem; font-size:0.8rem;">${t('artist.support_btn','💖 후원')}</button>
                </div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function supportArtist(id) {
    const tk = 'crac';
    const tkName = 'CRAC';
    const amountStr = await showPromptModal(t('artist.support_amount','후원 금액'), `${tkName} ${t('energy.enter_amount','금액을 입력하세요')}`, '');
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
        // 유니크 팬 체크
        const existingSupport = await db.collection('transactions').where('from', '==', currentUser.uid).where('artistId', '==', id).where('type', '==', 'artist_support').limit(1).get();
        const isNewFan = existingSupport.empty;
        await db.collection('artists').doc(id).update({ totalSupport: (artist2.totalSupport||0) + amount, fans: (artist2.fans||0) + (isNewFan ? 1 : 0) });
        await db.collection('transactions').add({ from:currentUser.uid, to:artist2.userId, amount, token:tkName, type:'artist_support', artistId:id, timestamp:new Date() });
        showToast(`💖 ${artist2.name}에게 ${amount} ${tkName} 후원!`, 'success'); loadArtistList(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== BOOKS - 출판 ==========

async function registerBook() {
    if (!currentUser) return;
    const title = document.getElementById('book-title').value.trim();
    const price = parseFloat(document.getElementById('book-price').value);
    if (!title) { showToast(t('books.enter_title','책 제목을 입력하세요'), 'warning'); return; }
    try {
        const coverFile = document.getElementById('book-cover').files[0];
        let imageData = '';
        if (coverFile) imageData = await fileToBase64Resized(coverFile, 400);
        await db.collection('books').add({
            title, author: document.getElementById('book-author').value.trim(),
            description: document.getElementById('book-desc').value.trim(),
            genre: document.getElementById('book-genre').value,
            price: price || 0, priceToken: 'CRGC',
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
            c.innerHTML += `<div onclick="viewBookDetail('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:180px; overflow:hidden; background:#f5f0e8;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:contain;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem;">${GENRES[x.genre]||'📚'}</div>`}</div>
                <div style="padding:0.5rem;"><div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.title}</div>
                <div style="font-size:0.7rem; color:var(--accent);">${x.author||'저자 미상'}</div>
                <div style="font-weight:700; color:#0066cc; font-size:0.85rem; margin-top:0.2rem;">${x.price>0 ? x.price+' CRGC' : '무료'}</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function buyBook(id) {
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return; const b = doc.data();
    if (b.publisherId === currentUser?.uid) { showToast('본인 책입니다', 'info'); return; }
    if (b.price <= 0) { showToast(`📖 "${b.title}" — 무료 열람!`, 'info'); return; }
    const tk = 'crgc';
    if (!await showConfirmModal('책 구매', `"${b.title}"\n${b.price} CRGC로 구매하시겠습니까?`)) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, b.price, `책 구매: ${b.title}`);
            if (!success) return;
            const pubOff = (await db.collection('users').doc(b.publisherId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(b.publisherId).update({
                [`offchainBalances.${tk}`]: (pubOff[tk] || 0) + b.price
            });
        } else {
            // BOOKS는 CRGC(오프체인) 전용이므로 온체인 경로 불필요
            showToast('CRGC 잔액 부족', 'error'); return;
        }
        await db.collection('books').doc(id).update({ sold: (b.sold||0) + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:b.publisherId, amount:b.price, token:'CRGC', type:'book_purchase', bookId:id, timestamp:new Date() });
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, b.price, 'CRGC');
        showToast(`📖 "${b.title}" 구매 완료!`, 'success'); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== CREDIT - P2P 크레딧 ==========

// 보험 승인/거절 (관리자 레벨 2+)
async function approveInsurance(id) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if ((userDoc.data()?.adminLevel || 0) < 2) { showToast(t('admin.no_permission','관리자 권한이 필요합니다'), 'error'); return; }
        const doc = await db.collection('insurance_requests').doc(id).get();
        if (!doc.exists) return;
        const req = doc.data();
        if (req.status !== 'pending') { showToast(t('credit.already_processed','이미 처리된 요청입니다'), 'info'); return; }
        if (!await showConfirmModal('보험 승인', `${req.requesterNickname || req.requesterEmail}\n${req.amount} CRTD — ${req.reason}\n\n승인하시겠습니까?`)) return;
        // 보험금 지급 (오프체인 CRTD 기반)
        const reqUser = await db.collection('users').doc(req.requesterId).get();
        const reqBal = reqUser.data()?.offchainBalances || {};
        await db.collection('users').doc(req.requesterId).update({
            ['offchainBalances.crtd']: (reqBal.crtd || 0) + req.amount
        });
        await db.collection('insurance_requests').doc(id).update({
            status: 'approved', approvedBy: currentUser.uid, approvedAt: new Date()
        });
        showToast(`🛡️ 보험 ${req.amount} CRTD 승인 완료!`, 'success');
        loadInsuranceAdmin(); loadMyInsuranceClaims();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function rejectInsurance(id) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if ((userDoc.data()?.adminLevel || 0) < 2) { showToast(t('admin.no_permission','관리자 권한이 필요합니다'), 'error'); return; }
        const reasonText = await showPromptModal('거절 사유', '거절 사유를 입력하세요', '');
        if (!reasonText) return;
        await db.collection('insurance_requests').doc(id).update({
            status: 'rejected', rejectedBy: currentUser.uid, rejectReason: reasonText, rejectedAt: new Date()
        });
        showToast('보험 요청이 거절되었습니다', 'info');
        loadInsuranceAdmin(); loadMyInsuranceClaims();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// 관리자용 보험 대기 목록
async function loadInsuranceAdmin() {
    const c = document.getElementById('insurance-admin-list');
    if (!c || !currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if ((userDoc.data()?.adminLevel || 0) < 2) { c.style.display = 'none'; return; }
        c.style.display = 'block';
        const docs = await db.collection('insurance_requests').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent); font-size:0.85rem;">대기 중인 보험 요청이 없습니다</p>'; return; }
        const TYPES = { medical: '🏥 의료비', disaster: '🆘 재난', education: '📖 교육비', housing: '🏠 주거비', other: '📋 기타' };
        c.innerHTML = '<h4 style="margin-bottom:0.5rem;">⏳ 승인 대기 보험 요청</h4>';
        docs.forEach(d => {
            const r = d.data();
            c.innerHTML += `<div style="background:#fff3e0; padding:0.8rem; border-radius:8px; margin-bottom:0.5rem; border-left:4px solid #ff9800;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><strong>${r.requesterNickname || r.requesterEmail}</strong> <span style="font-size:0.75rem; color:var(--accent);">${TYPES[r.type] || r.type}</span></div>
                    <span style="font-weight:700; color:#e65100;">${r.amount} CRTD</span>
                </div>
                <p style="font-size:0.85rem; color:#555; margin:0.3rem 0;">${r.reason}</p>
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button onclick="approveInsurance('${d.id}')" style="flex:1; background:#4CAF50; color:white; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; font-weight:600;">✅ 승인</button>
                    <button onclick="rejectInsurance('${d.id}')" style="flex:1; background:#f44336; color:white; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; font-weight:600;">❌ 거절</button>
                </div>
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

// 내 보험 신청 내역
async function loadMyInsuranceClaims() {
    const c = document.getElementById('my-insurance-claims');
    if (!c || !currentUser) return;
    try {
        const docs = await db.collection('insurance_requests').where('requesterId', '==', currentUser.uid).orderBy('createdAt', 'desc').limit(10).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent); font-size:0.85rem;">보험 신청 내역이 없습니다</p>'; return; }
        const STATUS = { pending: '⏳ 대기중', approved: '✅ 승인', rejected: '❌ 거절' };
        const STATUS_COLOR = { pending: '#ff9800', approved: '#4CAF50', rejected: '#f44336' };
        c.innerHTML = '';
        docs.forEach(d => {
            const r = d.data();
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; border-left:3px solid ${STATUS_COLOR[r.status] || '#999'};">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                    <span><strong>${r.amount} CRNY</strong> — ${r.reason?.slice(0, 40)}</span>
                    <span style="color:${STATUS_COLOR[r.status]}; font-weight:600;">${STATUS[r.status] || r.status}</span>
                </div>
                ${r.rejectReason ? `<p style="font-size:0.75rem; color:#f44336; margin-top:0.2rem;">사유: ${r.rejectReason}</p>` : ''}
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

// 계모임 라운드 실행 (주최자만)
async function executeGyeRound(gyeId) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('gye_groups').doc(gyeId).get();
        if (!doc.exists) return;
        const g = doc.data();
        if (g.organizerId !== currentUser.uid) { showToast('주최자만 라운드를 실행할 수 있습니다', 'error'); return; }
        if (!g.members || g.members.length < 2) { showToast('최소 2명 이상 필요합니다', 'warning'); return; }
        if (g.currentRound >= g.members.length) { showToast('모든 라운드가 완료되었습니다', 'info'); return; }
        const recipient = g.members[g.currentRound];
        const totalPot = g.monthlyAmount * g.members.length;
        if (!await showConfirmModal('계모임 라운드 실행', `Round ${g.currentRound + 1}: ${g.members.length}명 × ${g.monthlyAmount} CRTD = ${totalPot} CRTD\n\n수령자: ${recipient.nickname || recipient.email}\n\n실행하시겠습니까?`)) return;
        // 각 멤버에서 monthlyAmount 차감, 수령자에게 전체 지급
        for (const member of g.members) {
            if (member.userId === recipient.userId) continue;
            const mUser = await db.collection('users').doc(member.userId).get();
            const mBal = mUser.data()?.offchainBalances || {};
            if ((mBal.crtd || 0) < g.monthlyAmount) {
                showToast(`${member.nickname || member.email}의 잔액이 부족합니다`, 'error');
                return;
            }
        }
        for (const member of g.members) {
            if (member.userId === recipient.userId) continue;
            const mUser = await db.collection('users').doc(member.userId).get();
            const mBal = mUser.data()?.offchainBalances || {};
            await db.collection('users').doc(member.userId).update({
                ['offchainBalances.crtd']: (mBal.crtd || 0) - g.monthlyAmount
            });
        }
        const rUser = await db.collection('users').doc(recipient.userId).get();
        const rBal = rUser.data()?.offchainBalances || {};
        await db.collection('users').doc(recipient.userId).update({
            ['offchainBalances.crtd']: (rBal.crtd || 0) + totalPot
        });
        await db.collection('gye_groups').doc(gyeId).update({
            currentRound: g.currentRound + 1,
            status: (g.currentRound + 1) >= g.members.length ? 'completed' : 'active'
        });
        await db.collection('transactions').add({
            type: 'gye_round', gyeId, round: g.currentRound + 1,
            recipientId: recipient.userId, amount: totalPot, token: 'CRTD',
            participants: g.members.length, timestamp: new Date()
        });
        showToast(`🔄 Round ${g.currentRound + 1} 완료! ${recipient.nickname || recipient.email}에게 ${totalPot} CRTD 지급`, 'success');
        loadGyeList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// 크레딧 점수 상세 분석
async function loadCreditScoreBreakdown() {
    const c = document.getElementById('credit-score-breakdown');
    if (!c || !currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const data = userDoc.data();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        const offBal = data?.offchainBalances || {};
        const crtdHeld = offBal.crtd || 0;
        const referrals = data.referralCount || 0;
        // 거래 내역 수
        const txCount = (await db.collection('transactions').where('from', '==', currentUser.uid).limit(100).get()).size;
        // 상환율 (품앗이 완료/전체)
        const allPumasi = await db.collection('pumasi_requests').where('requesterId', '==', currentUser.uid).get();
        let totalP = allPumasi.size, repaidP = 0;
        allPumasi.forEach(d => { if (d.data().status === 'repaid' || d.data().raised >= d.data().amount) repaidP++; });
        const repayRate = totalP > 0 ? Math.round((repaidP / totalP) * 100) : 100;

        const holdingScore = Math.min(200, crtdHeld * 10);
        const referralScore = Math.min(150, referrals * 20);
        const txScore = Math.min(150, txCount * 3);
        const repayScore = Math.min(150, repayRate * 1.5);
        const totalScore = Math.min(850, 300 + holdingScore + referralScore + txScore + repayScore);

        c.innerHTML = `
            <div style="display:grid; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:#e3f2fd; border-radius:6px;">
                    <span>👑 CRTD 보유량</span><span style="font-weight:700;">${crtdHeld} CRTD → +${holdingScore}점</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:#e8f5e9; border-radius:6px;">
                    <span>👥 추천인 수</span><span style="font-weight:700;">${referrals}명 → +${referralScore}점</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:#fff3e0; border-radius:6px;">
                    <span>📊 거래 횟수</span><span style="font-weight:700;">${txCount}건 → +${txScore}점</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:#fce4ec; border-radius:6px;">
                    <span>💯 상환율</span><span style="font-weight:700;">${repayRate}% → +${repayScore}점</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem; background:linear-gradient(135deg,#1a1a2e,#16213e); border-radius:8px; color:white; margin-top:0.3rem;">
                    <span style="font-size:1rem;">🏆 총 크레딧 점수</span>
                    <span style="font-size:1.5rem; font-weight:800; color:${totalScore >= 700 ? '#4CAF50' : totalScore >= 500 ? '#ff9800' : '#ff4444'};">${totalScore}</span>
                </div>
            </div>`;
        // 메인 점수도 업데이트
        const scoreEl = document.getElementById('credit-score');
        if (scoreEl) { scoreEl.textContent = totalScore; scoreEl.style.color = totalScore >= 700 ? '#4CAF50' : totalScore >= 500 ? '#ff9800' : '#cc0000'; }
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== BUSINESS 투자 & 상세 ==========

async function viewBusinessDetail(id) {
    const doc = await db.collection('businesses').doc(id).get();
    if (!doc.exists) return;
    const b = doc.data();
    const BIZ_CATS = {retail:'🏪 소매',food:'🍽️ 요식업',service:'🔧 서비스',tech:'💻 테크',education:'📖 교육',health:'💊 헬스',logistics:'🚚 물류',entertainment:'🎭 엔터',other:'🏢 기타'};
    // 투자 현황
    const investments = await db.collection('business_investments').where('businessId', '==', id).get();
    let totalInvested = 0, investorCount = 0;
    investments.forEach(d => { totalInvested += d.data().amount || 0; investorCount++; });
    // 평점
    const avgRating = b.reviews > 0 ? (b.rating / b.reviews).toFixed(1) : '없음';
    const stars = b.reviews > 0 ? '⭐'.repeat(Math.round(b.rating / b.reviews)) : '';

    const modal = document.createElement('div');
    modal.id = 'biz-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        ${b.imageData ? `<img src="${b.imageData}" style="width:100%; border-radius:12px 12px 0 0; max-height:200px; object-fit:cover;">` : ''}
        <div style="padding:1.2rem;">
            <h3>${b.name}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.3rem 0;">${[BIZ_CATS[b.category], b.country, b.ownerNickname || b.ownerEmail].filter(Boolean).join(' · ')}</p>
            ${b.description ? `<p style="font-size:0.9rem; margin:0.8rem 0;">${b.description}</p>` : ''}
            ${b.website ? `<a href="${b.website}" target="_blank" style="font-size:0.85rem;">🔗 웹사이트</a>` : ''}
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem; margin:1rem 0;">
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">총 투자</div>
                    <div style="font-weight:700;">${totalInvested} CRGC</div>
                </div>
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">투자자</div>
                    <div style="font-weight:700;">${investorCount}명</div>
                </div>
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">평점</div>
                    <div style="font-weight:700;">${avgRating} ${stars}</div>
                </div>
            </div>
            ${b.ownerId !== currentUser?.uid ? `<button onclick="investBusiness('${id}')" style="background:#0066cc; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;">💰 투자하기</button>` : ''}
            <button onclick="document.getElementById('biz-detail-modal').remove()" style="background:#eee; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">닫기</button>
        </div></div>`;
    document.body.appendChild(modal);
}

async function investBusiness(id) {
    if (!currentUser) return;
    const tk = 'crgc';
    const tkName = 'CRGC';
    const amountStr = await showPromptModal('투자 금액', `${tkName} 금액을 입력하세요`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, amount, `사업 투자: ${id}`);
            if (!success) return;
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
            const bal = wallets.docs[0]?.data()?.balances || {};
            if ((bal[tk] || 0) < amount) { showToast(`${tkName} 잔액 부족`, 'error'); return; }
            await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
        }
        const bizDoc = await db.collection('businesses').doc(id).get();
        const biz = bizDoc.data();
        // 사업주에게 투자금 전달
        if (isOffchainToken(tk)) {
            const ownerOff = (await db.collection('users').doc(biz.ownerId).get()).data()?.offchainBalances || {};
            await db.collection('users').doc(biz.ownerId).update({
                [`offchainBalances.${tk}`]: (ownerOff[tk] || 0) + amount
            });
        } else {
            const ownerW = await db.collection('users').doc(biz.ownerId).collection('wallets').limit(1).get();
            if (!ownerW.empty) { const ob = ownerW.docs[0].data().balances || {}; await ownerW.docs[0].ref.update({ [`balances.${tk}`]: (ob[tk] || 0) + amount }); }
        }
        await db.collection('business_investments').add({
            businessId: id, businessName: biz.name,
            investorId: currentUser.uid, investorEmail: currentUser.email,
            amount, token: tkName, timestamp: new Date()
        });
        showToast(`💰 ${biz.name}에 ${amount} ${tkName} 투자 완료!`, 'success');
        document.getElementById('biz-detail-modal')?.remove();
        loadBusinessList(); loadUserWallet();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function rateBusinessAfterInvest(businessId) {
    const ratingStr = await showPromptModal('사업체 평가', '별점을 입력하세요 (1~5)', '5');
    const rating = parseInt(ratingStr);
    if (!rating || rating < 1 || rating > 5) return;
    try {
        const bizDoc = await db.collection('businesses').doc(businessId).get();
        const biz = bizDoc.data();
        await db.collection('businesses').doc(businessId).update({
            rating: (biz.rating || 0) + rating,
            reviews: (biz.reviews || 0) + 1
        });
        showToast(`⭐ ${rating}점 평가 완료!`, 'success');
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== ARTIST 상세 & 팬 추적 ==========

async function viewArtistDetail(id) {
    const doc = await db.collection('artists').doc(id).get();
    if (!doc.exists) return;
    const a = doc.data();
    const GENRES = {music:'🎵 음악',dance:'💃 댄스',acting:'🎬 연기',comedy:'😂 코미디',creator:'📹 크리에이터',model:'📷 모델',dj:'🎧 DJ',other:'🌟 기타'};
    // 후원 이력
    const supports = await db.collection('transactions').where('artistId', '==', id).where('type', '==', 'artist_support').orderBy('timestamp', 'desc').limit(10).get();
    let supportHtml = '';
    supports.forEach(d => {
        const s = d.data();
        supportHtml += `<div style="font-size:0.8rem; padding:0.3rem 0; border-bottom:1px solid #eee;">${s.amount} ${s.token} · ${s.timestamp?.toDate?.()?.toLocaleDateString?.() || ''}</div>`;
    });
    // 유니크 팬 수
    const uniqueFans = new Set();
    const allSupports = await db.collection('transactions').where('artistId', '==', id).where('type', '==', 'artist_support').get();
    allSupports.forEach(d => uniqueFans.add(d.data().from));

    const modal = document.createElement('div');
    modal.id = 'artist-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:200px; background:linear-gradient(135deg,#9C27B0,#E91E63); position:relative;">
            ${a.imageData ? `<img src="${a.imageData}" style="width:100%; height:100%; object-fit:cover; border-radius:12px 12px 0 0;">` : ''}
        </div>
        <div style="padding:1.2rem;">
            <h3>${a.name}</h3>
            <p style="color:var(--accent); font-size:0.85rem;">${GENRES[a.genre] || ''} · 팬 ${uniqueFans.size}명 · 총 후원 ${a.totalSupport || 0}</p>
            ${a.bio ? `<p style="font-size:0.9rem; margin:0.8rem 0;">${a.bio}</p>` : ''}
            <div style="margin:1rem 0;">
                <h4 style="font-size:0.85rem; margin-bottom:0.5rem;">💖 최근 후원</h4>
                ${supportHtml || '<p style="font-size:0.8rem; color:var(--accent);">후원 내역 없음</p>'}
            </div>
            <button onclick="supportArtist('${id}'); document.getElementById('artist-detail-modal').remove();" style="background:#E91E63; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;">💖 후원하기</button>
            <button onclick="document.getElementById('artist-detail-modal').remove()" style="background:#eee; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">닫기</button>
        </div></div>`;
    document.body.appendChild(modal);
}

// ========== BOOKS 상세 & 읽고 싶은 책 ==========

async function viewBookDetail(id) {
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return;
    const b = doc.data();
    const GENRES = {novel:'📕 소설',essay:'📗 에세이',selfhelp:'📘 자기계발',business:'📙 비즈니스',tech:'💻 기술',poetry:'🖋️ 시',children:'🧒 아동',comic:'📒 만화',other:'📚 기타'};
    const isOwner = currentUser?.uid === b.publisherId;

    const modal = document.createElement('div');
    modal.id = 'book-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:250px; background:#f5f0e8; display:flex; align-items:center; justify-content:center;">
            ${b.imageData ? `<img src="${b.imageData}" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<span style="font-size:4rem;">${GENRES[b.genre]?.charAt(0) || '📚'}</span>`}
        </div>
        <div style="padding:1.2rem;">
            <h3>${b.title}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.3rem 0;">${b.author || '저자 미상'} · ${GENRES[b.genre] || ''} · 판매 ${b.sold || 0}부</p>
            <p style="font-size:1.1rem; font-weight:700; color:#0066cc; margin:0.5rem 0;">${b.price > 0 ? b.price + ' CRGC' : '무료'}</p>
            ${b.description ? `<p style="font-size:0.9rem; margin:0.8rem 0; line-height:1.6;">${b.description}</p>` : ''}
            <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                ${!isOwner && b.price > 0 ? `<button onclick="buyBook('${id}'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#0066cc; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">🛒 구매하기</button>` : ''}
                ${!isOwner && b.price <= 0 ? `<button onclick="showToast('📖 무료 열람!', 'info'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#4CAF50; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">📖 무료 읽기</button>` : ''}
                <button onclick="addToReadingList('${id}')" style="flex:1; background:#ff9800; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">📚 읽고 싶은 책</button>
            </div>
            <button onclick="document.getElementById('book-detail-modal').remove()" style="background:#eee; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%; margin-top:0.5rem;">닫기</button>
        </div></div>`;
    document.body.appendChild(modal);
}

async function addToReadingList(bookId) {
    if (!currentUser) return;
    try {
        // 중복 체크
        const existing = await db.collection('reading_list').where('userId', '==', currentUser.uid).where('bookId', '==', bookId).get();
        if (!existing.empty) { showToast('이미 읽고 싶은 책에 추가되어 있습니다', 'info'); return; }
        const bookDoc = await db.collection('books').doc(bookId).get();
        const book = bookDoc.data();
        await db.collection('reading_list').add({
            userId: currentUser.uid, bookId,
            bookTitle: book.title, bookAuthor: book.author || '',
            addedAt: new Date()
        });
        showToast(`📚 "${book.title}" 읽고 싶은 책에 추가!`, 'success');
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadReadingList() {
    const c = document.getElementById('reading-list');
    if (!c || !currentUser) return;
    try {
        const docs = await db.collection('reading_list').where('userId', '==', currentUser.uid).orderBy('addedAt', 'desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent); font-size:0.85rem;">읽고 싶은 책이 없습니다</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => {
            const r = d.data();
            c.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem;">
                <div><strong style="font-size:0.85rem;">${r.bookTitle}</strong> <span style="font-size:0.75rem; color:var(--accent);">${r.bookAuthor}</span></div>
                <button onclick="removeFromReadingList('${d.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem;">🗑️</button>
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function removeFromReadingList(id) {
    try {
        await db.collection('reading_list').doc(id).delete();
        showToast('읽고 싶은 책에서 제거됨', 'info');
        loadReadingList();
    } catch (e) { showToast('실패: ' + e.message, 'error'); }
}

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
    const targetInput = (document.getElementById('pumasi-target')?.value || '').trim();
    if (!amount || !reason) { showToast('금액과 사유를 입력하세요', 'warning'); return; }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        // 대상 지정 시 이메일/닉네임으로 검색
        let targetId = '', targetEmail = '', targetNickname = '';
        if (targetInput) {
            let targetDoc;
            // 이메일 형식이면 이메일로 검색
            if (targetInput.includes('@')) {
                const q = await db.collection('users').where('email', '==', targetInput).limit(1).get();
                if (!q.empty) targetDoc = q.docs[0];
            } else {
                const q = await db.collection('users').where('nickname', '==', targetInput).limit(1).get();
                if (!q.empty) targetDoc = q.docs[0];
            }
            if (!targetDoc) { showToast('대상을 찾을 수 없습니다', 'error'); return; }
            targetId = targetDoc.id;
            targetEmail = targetDoc.data().email || '';
            targetNickname = targetDoc.data().nickname || '';
        }
        
        await db.collection('pumasi_requests').add({
            requesterId: currentUser.uid, requesterEmail: currentUser.email,
            requesterNickname: userDoc.data()?.nickname || '',
            targetId, targetEmail, targetNickname,
            amount, reason, days, interest: 0,
            raised: 0, backers: 0,
            dueDate: new Date(Date.now() + days * 86400000),
            status: 'active', createdAt: new Date()
        });
        showToast(`🤝 품앗이 ${amount} CRTD 요청 완료!${targetNickname ? ' (대상: '+targetNickname+')' : ''}`, 'success');
        document.getElementById('pumasi-target').value = '';
        document.getElementById('pumasi-amount').value = '';
        document.getElementById('pumasi-reason').value = '';
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
                <div style="display:flex; justify-content:space-between;"><strong>${x.requesterNickname || x.requesterEmail}</strong><span style="color:#0066cc; font-weight:700;">${x.amount} CRTD</span></div>
                ${x.targetNickname ? `<p style="font-size:0.8rem; color:#E91E63; margin:0.2rem 0;">→ 대상: ${x.targetNickname || x.targetEmail}</p>` : '<p style="font-size:0.8rem; color:var(--accent); margin:0.2rem 0;">공동체 전체 공개</p>'}
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.reason}</p>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#4CAF50; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${x.raised}/${x.amount} · ${x.backers}명</span><span style="color:#4CAF50;">이자 0%</span></div>
                ${x.requesterId !== currentUser?.uid ? `<button onclick="contributePumasi('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">🤝 도와주기</button>` : ''}
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function contributePumasi(id) {
    const tk = 'crtd';
    const tkName = 'CRTD';
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
    if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
    const amount = parseFloat(document.getElementById('donate-amount').value);
    const token = 'CRTD';
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
        const crtdHeld = data?.offchainBalances?.crtd || 0;
        const score = Math.min(850, 300 + crtdHeld * 10 + (data.referralCount || 0) * 20);
        
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
        // 추가 로드
        loadCreditScoreBreakdown();
        loadMyInsuranceClaims();
        loadInsuranceAdmin();
    } catch (e) { console.error(e); }
}

// ========== ENERGY ADMIN ==========

async function createEnergyProject() {
    if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
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
    if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
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
            token: 'CRTD', status: 'recruiting',
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
                        <div style="font-weight:700; color:#FF9800;">${g.monthlyAmount} CRTD/월</div>
                        <div style="font-size:0.75rem; color:var(--accent);">Round ${g.currentRound}</div>
                    </div>
                </div>
                ${!isMember && g.currentMembers < g.maxMembers ? `<button onclick="joinGye('${d.id}')" style="background:#FF9800; color:white; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem; font-size:0.85rem;">🤝 참여하기</button>` : ''}
                ${isMember ? '<div style="text-align:center; font-size:0.8rem; color:#FF9800; margin-top:0.5rem;">✅ 참여 중</div>' : ''}
                ${g.organizerId === currentUser?.uid && g.status === 'active' && g.currentRound < (g.members?.length || 0) ? `<button onclick="executeGyeRound('${d.id}')" style="background:#E91E63; color:white; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.3rem; font-size:0.8rem;">🔄 Round ${g.currentRound + 1} 실행</button>` : ''}
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
        const confirmed = await showConfirmModal('계모임 참여', `"${g.name}"\n월 ${g.monthlyAmount} CRTD 납입\n참여하시겠습니까?`);
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
    if (sel && brand) sel.value = brand;
    
    // mall-filter용 별도 처리
    window._mallBrandFilter = brand;
    
    // 활성 카드 하이라이트
    document.querySelectorAll('.mall-brand-card').forEach(c => {
        c.classList.remove('active');
        c.style.outline = 'none';
        c.style.opacity = '1';
    });
    const activeCard = document.querySelector(`.mall-brand-card[data-brand="${brand || 'all'}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.style.outline = '2px solid var(--gold, #D4AF37)';
    }
    // 비활성 카드 살짝 투명
    document.querySelectorAll('.mall-brand-card:not(.active)').forEach(c => c.style.opacity = '0.6');
    
    loadMallProducts();
}

// ========== ENERGY - 내 투자 내역 + 수익 배분 ==========

async function loadMyEnergyInvestments() {
    if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
    const c = document.getElementById('energy-my-investments');
    if (!c) return;
    c.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩...</p>';
    try {
        const docs = await db.collection('energy_investments').where('userId', '==', currentUser.uid).orderBy('timestamp', 'desc').get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">투자 내역이 없습니다</p>'; return; }
        
        // 프로젝트 정보 캐시
        const projCache = {};
        let totalInvested = 0, totalMonthly = 0;
        let rows = '';
        
        for (const d of docs.docs) {
            const inv = d.data();
            if (!projCache[inv.projectId]) {
                const pDoc = await db.collection('energy_projects').doc(inv.projectId).get();
                const pData = pDoc.exists ? pDoc.data() : { title: '삭제된 프로젝트', returnRate: 0 };
                if (!pData.title) pData.title = pData.name || '프로젝트';
                projCache[inv.projectId] = pData;
            }
            const proj = projCache[inv.projectId];
            const rate = proj.returnRate || 0;
            const monthlyReturn = (inv.amount * rate / 100 / 12);
            const annualReturn = (inv.amount * rate / 100);
            totalInvested += inv.amount;
            totalMonthly += monthlyReturn;
            const dateStr = inv.timestamp?.toDate ? inv.timestamp.toDate().toLocaleDateString('ko-KR') : '-';
            
            rows += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>⚡ ${proj.title}</strong>
                        <div style="font-size:0.75rem; color:var(--accent);">${dateStr} · ${inv.token || 'CRNY'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:#ff9800;">${inv.amount} ${inv.token || 'CRNY'}</div>
                        <div style="font-size:0.75rem; color:#4CAF50;">월 ${monthlyReturn.toFixed(2)} CREB (연 ${rate}%)</div>
                    </div>
                </div>
            </div>`;
        }
        
        c.innerHTML = `
            <div style="background:#FFF8E1; padding:0.8rem; border-radius:8px; margin-bottom:0.8rem; display:flex; justify-content:space-around; text-align:center;">
                <div><div style="font-size:0.7rem; color:var(--accent);">총 투자</div><strong>${totalInvested.toFixed(1)}</strong></div>
                <div><div style="font-size:0.7rem; color:var(--accent);">예상 월 수익</div><strong style="color:#4CAF50;">${totalMonthly.toFixed(2)} CREB</strong></div>
                <div><div style="font-size:0.7rem; color:var(--accent);">예상 연 수익</div><strong style="color:#1976D2;">${(totalMonthly * 12).toFixed(2)} CREB</strong></div>
            </div>
            ${rows}`;
        
        // 상단 투자 현황도 업데이트
        const ei = document.getElementById('energy-invested');
        if (ei) ei.textContent = `${totalInvested.toFixed(1)} CREB`;
        const em = document.getElementById('energy-monthly');
        if (em) em.textContent = `${totalMonthly.toFixed(2)} CREB`;
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// 관리자: 에너지 수익 배분
async function distributeEnergyReturns(projectId) {
    if (!currentUser) return;
    try {
        const projDoc = await db.collection('energy_projects').doc(projectId).get();
        if (!projDoc.exists) { showToast('프로젝트를 찾을 수 없습니다', 'error'); return; }
        const proj = projDoc.data();
        const rate = proj.returnRate || 0;
        
        const investments = await db.collection('energy_investments').where('projectId', '==', projectId).get();
        if (investments.empty) { showToast('투자자가 없습니다', 'info'); return; }
        
        let totalInvested = 0;
        investments.forEach(d => totalInvested += d.data().amount);
        
        const confirmed = await showConfirmModal('수익 배분 확인', `프로젝트: ${proj.name || proj.title}\n총 투자: ${totalInvested}\n수익률: ${rate}%\n월 배분 총액: ${(totalInvested * rate / 100 / 12).toFixed(2)} CREB\n\n${investments.size}명에게 배분하시겠습니까?`);
        if (!confirmed) return;
        
        let distributed = 0;
        for (const d of investments.docs) {
            const inv = d.data();
            const share = inv.amount * rate / 100 / 12; // 월간 수익
            if (share <= 0) continue;
            
            // CREB을 오프체인 잔액에 적립
            const userDoc = await db.collection('users').doc(inv.userId).get();
            if (userDoc.exists) {
                const uOff = userDoc.data()?.offchainBalances || {};
                await db.collection('users').doc(inv.userId).update({
                    ['offchainBalances.creb']: (uOff.creb || 0) + share
                });
                await db.collection('transactions').add({
                    from: 'energy_system', to: inv.userId,
                    amount: share, token: 'CREB', type: 'energy_return',
                    projectId, timestamp: new Date()
                });
                distributed += share;
            }
        }
        
        showToast(`✅ ${distributed.toFixed(2)} CREB을 ${investments.size}명에게 배분 완료!`, 'success');
    } catch (e) { showToast('배분 실패: ' + e.message, 'error'); }
}

// ========== FUNDRAISE - 캠페인 종료 + 상세 모달 ==========

async function closeCampaign(id) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) { showToast('캠페인을 찾을 수 없습니다', 'error'); return; }
        const camp = doc.data();
        if (camp.creatorId !== currentUser.uid) { showToast('캠페인 생성자만 종료할 수 있습니다', 'error'); return; }
        
        const fee = camp.platformFee || 2.5;
        const feeAmount = camp.raised * (fee / 100);
        const creatorAmount = camp.raised - feeAmount;
        
        const confirmed = await showConfirmModal('캠페인 종료', `"${camp.title}"\n\n모금 총액: ${camp.raised} ${camp.token}\n수수료 (${fee}%): ${feeAmount.toFixed(2)} ${camp.token}\n수령액: ${creatorAmount.toFixed(2)} ${camp.token}\n\n종료하시겠습니까?`);
        if (!confirmed) return;
        
        // 수수료 기록
        if (feeAmount > 0) {
            await db.collection('platform_fees').add({
                campaignId: id, amount: feeAmount, token: camp.token,
                type: 'campaign_close', timestamp: new Date()
            });
        }
        
        await db.collection('campaigns').doc(id).update({ status: 'closed', closedAt: new Date() });
        showToast(`✅ "${camp.title}" 캠페인 종료! ${creatorAmount.toFixed(2)} ${camp.token} 수령`, 'success');
        loadCampaigns();
        // 모달 닫기
        const modal = document.getElementById('campaign-detail-modal');
        if (modal) modal.style.display = 'none';
    } catch (e) { showToast('종료 실패: ' + e.message, 'error'); }
}

async function showCampaignDetail(id) {
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) return;
        const camp = doc.data();
        const pct = Math.min(100, Math.round((camp.raised / camp.goal) * 100));
        const isCreator = currentUser?.uid === camp.creatorId;
        
        // 후원자 목록 로드
        const donorDocs = await db.collection('transactions')
            .where('campaignId', '==', id)
            .where('type', '==', 'donation')
            .orderBy('timestamp', 'desc').limit(50).get();
        
        let donorList = '';
        if (!donorDocs.empty) {
            donorDocs.forEach(d => {
                const tx = d.data();
                const dateStr = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString('ko-KR') : '-';
                donorList += `<div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid #f0f0f0; font-size:0.82rem;">
                    <span style="color:var(--accent);">${dateStr}</span>
                    <span style="font-weight:600;">${tx.amount} ${tx.token}</span>
                </div>`;
            });
        } else {
            donorList = '<p style="color:var(--accent); font-size:0.85rem;">아직 후원자가 없습니다</p>';
        }
        
        const fee = camp.platformFee || 2.5;
        const content = document.getElementById('campaign-detail-content');
        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3 style="margin:0;">${camp.title}</h3>
                <button onclick="document.getElementById('campaign-detail-modal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
            </div>
            ${camp.imageData ? `<img src="${camp.imageData}" style="width:100%; border-radius:8px; max-height:250px; object-fit:cover; margin-bottom:1rem;">` : ''}
            <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${camp.creatorNickname || camp.creatorEmail} · ${camp.category || ''}</p>
            ${camp.description ? `<p style="margin-bottom:1rem; font-size:0.9rem;">${camp.description}</p>` : ''}
            <div style="background:#f5f5f5; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div style="background:#e0e0e0; height:10px; border-radius:5px; margin-bottom:0.5rem;">
                    <div style="background:#4CAF50; height:100%; border-radius:5px; width:${pct}%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                    <span style="font-weight:700;">${camp.raised} / ${camp.goal} ${camp.token}</span>
                    <span>${pct}% · ${camp.backerCount || camp.backers || 0}명</span>
                </div>
                <div style="font-size:0.8rem; color:#2e7d32; margin-top:0.5rem;">💰 수수료 ${fee}% · 창작자 수령 ${(100 - fee).toFixed(1)}%</div>
            </div>
            <button onclick="donateCampaign('${id}')" style="background:#4CAF50; color:white; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:0.8rem;">💝 기부하기</button>
            ${isCreator && camp.status === 'active' ? `<button onclick="closeCampaign('${id}')" style="background:#e53935; color:white; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:1rem;">🔒 캠페인 종료 및 수령</button>` : ''}
            <h4 style="margin-bottom:0.5rem;">👥 후원자 내역 (${donorDocs.size}명)</h4>
            ${donorList}`;
        
        const modal = document.getElementById('campaign-detail-modal');
        modal.style.display = 'flex';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    } catch (e) { showToast('상세 로드 실패: ' + e.message, 'error'); }
}

// ========== CART (장바구니) ==========

async function addToCart(productId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    try {
        // Check if already in cart
        const existing = await db.collection('users').doc(currentUser.uid).collection('cart').where('productId','==',productId).limit(1).get();
        if (!existing.empty) {
            // Increment quantity
            const cartDoc = existing.docs[0];
            await cartDoc.ref.update({ qty: (cartDoc.data().qty || 1) + 1 });
            showToast('🛒 수량이 추가되었습니다', 'success');
        } else {
            const pDoc = await db.collection('products').doc(productId).get();
            if (!pDoc.exists) return;
            const p = pDoc.data();
            await db.collection('users').doc(currentUser.uid).collection('cart').add({
                productId, title: p.title, price: p.price, token: p.token || 'CRGC',
                imageData: p.imageData || '', qty: 1, addedAt: new Date()
            });
            showToast(`🛒 "${p.title}" 장바구니에 담았습니다`, 'success');
        }
        updateCartBadge();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge || !currentUser) return;
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('cart').get();
        let total = 0;
        snap.forEach(d => total += (d.data().qty || 1));
        if (total > 0) { badge.textContent = total; badge.style.display = 'block'; }
        else { badge.style.display = 'none'; }
    } catch(e) { badge.style.display = 'none'; }
}

async function loadCart() {
    const c = document.getElementById('cart-items');
    const summary = document.getElementById('cart-summary');
    if (!c) return;
    if (!currentUser) { c.innerHTML = '<p style="color:var(--accent); text-align:center;">로그인이 필요합니다</p>'; if(summary) summary.style.display='none'; return; }
    c.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩...</p>';
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('cart').orderBy('addedAt','desc').get();
        if (snap.empty) {
            c.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--accent);"><div style="font-size:3rem; margin-bottom:1rem;">🛒</div><p>장바구니가 비어있습니다</p><button onclick="showPage(\'mall\')" style="margin-top:1rem; background:#0066cc; color:white; border:none; padding:0.7rem 1.5rem; border-radius:8px; cursor:pointer;">쇼핑하러 가기</button></div>';
            if(summary) summary.style.display='none';
            return;
        }
        let total = 0;
        c.innerHTML = '';
        snap.forEach(d => {
            const item = d.data();
            const subtotal = item.price * (item.qty || 1);
            total += subtotal;
            c.innerHTML += `<div style="background:white; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#f0f0f0; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#ccc;">🛒</span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#0066cc; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                        <button onclick="updateCartQty('${d.id}', -1)" style="width:26px; height:26px; border:1px solid #ddd; border-radius:4px; background:white; cursor:pointer; font-size:0.9rem;">−</button>
                        <span style="font-weight:600; min-width:20px; text-align:center;">${item.qty || 1}</span>
                        <button onclick="updateCartQty('${d.id}', 1)" style="width:26px; height:26px; border:1px solid #ddd; border-radius:4px; background:white; cursor:pointer; font-size:0.9rem;">+</button>
                        <button onclick="removeFromCart('${d.id}')" style="background:none; border:none; cursor:pointer; color:#cc0000; font-size:0.85rem; margin-left:auto;">🗑️</button>
                    </div>
                </div>
            </div>`;
        });
        if (summary) { summary.style.display = 'block'; }
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = total + ' CRGC';
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function updateCartQty(cartDocId, delta) {
    if (!currentUser) return;
    try {
        const ref = db.collection('users').doc(currentUser.uid).collection('cart').doc(cartDocId);
        const doc = await ref.get();
        if (!doc.exists) return;
        const newQty = (doc.data().qty || 1) + delta;
        if (newQty <= 0) { await ref.delete(); }
        else { await ref.update({ qty: newQty }); }
        loadCart(); updateCartBadge();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function removeFromCart(cartDocId) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('cart').doc(cartDocId).delete();
        showToast('장바구니에서 삭제됨', 'info');
        loadCart(); updateCartBadge();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function checkoutCart() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('cart').get();
        if (snap.empty) { showToast('장바구니가 비어있습니다', 'warning'); return; }
        let total = 0;
        const items = [];
        snap.forEach(d => { const it = d.data(); total += it.price * (it.qty || 1); items.push({ ...it, cartDocId: d.id }); });
        
        if (!await showConfirmModal('일괄 결제', `장바구니 ${items.length}개 상품\n총 ${total} CRGC 결제하시겠습니까?`)) return;
        
        const tk = 'crgc';
        if (isOffchainToken(tk)) {
            const success = await spendOffchainPoints(tk, total, `장바구니 일괄 구매 (${items.length}건)`);
            if (!success) return;
        } else { showToast('CRGC 잔액 부족', 'error'); return; }

        // Process each item
        for (const item of items) {
            const pDoc = await db.collection('products').doc(item.productId).get();
            if (!pDoc.exists) continue;
            const p = pDoc.data();
            const qty = item.qty || 1;
            // Transfer to seller
            if (isOffchainToken(tk)) {
                const sellerOff = (await db.collection('users').doc(p.sellerId).get()).data()?.offchainBalances || {};
                await db.collection('users').doc(p.sellerId).update({
                    [`offchainBalances.${tk}`]: (sellerOff[tk] || 0) + item.price * qty
                });
            }
            await db.collection('products').doc(item.productId).update({ sold: (p.sold||0) + qty });
            await db.collection('orders').add({
                productId: item.productId, productTitle: item.title,
                buyerId: currentUser.uid, buyerEmail: currentUser.email,
                sellerId: p.sellerId, sellerEmail: p.sellerEmail || '',
                amount: item.price * qty, qty, token: 'CRGC', status: 'paid', createdAt: new Date()
            });
            if (typeof autoGivingPoolContribution === 'function') await autoGivingPoolContribution(item.price * qty);
            if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, item.price * qty, 'CRGC');
            // Remove from cart
            await db.collection('users').doc(currentUser.uid).collection('cart').doc(item.cartDocId).delete();
        }
        showToast(`🎉 ${items.length}개 상품 결제 완료!`, 'success');
        loadCart(); updateCartBadge(); loadUserWallet();
    } catch(e) { showToast('결제 실패: ' + e.message, 'error'); }
}

// ========== WISHLIST (찜하기) ==========

async function toggleWishlist(productId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    try {
        const ref = db.collection('users').doc(currentUser.uid).collection('wishlist');
        const existing = await ref.where('productId','==',productId).limit(1).get();
        if (!existing.empty) {
            await existing.docs[0].ref.delete();
            showToast('찜 해제됨', 'info');
            const btn = document.getElementById(`wish-btn-${productId}`);
            if (btn) btn.textContent = '🤍';
        } else {
            const pDoc = await db.collection('products').doc(productId).get();
            if (!pDoc.exists) return;
            const p = pDoc.data();
            await ref.add({
                productId, title: p.title, price: p.price, token: p.token || 'CRGC',
                imageData: p.imageData || '', addedAt: new Date()
            });
            showToast(`❤️ "${p.title}" 찜 완료`, 'success');
            const btn = document.getElementById(`wish-btn-${productId}`);
            if (btn) btn.textContent = '❤️';
        }
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function loadWishlist() {
    const c = document.getElementById('wishlist-items');
    if (!c) return;
    if (!currentUser) { c.innerHTML = '<p style="color:var(--accent); text-align:center;">로그인이 필요합니다</p>'; return; }
    c.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩...</p>';
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('wishlist').orderBy('addedAt','desc').get();
        if (snap.empty) {
            c.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--accent);"><div style="font-size:3rem; margin-bottom:1rem;">❤️</div><p>찜한 상품이 없습니다</p></div>';
            return;
        }
        c.innerHTML = '';
        snap.forEach(d => {
            const item = d.data();
            c.innerHTML += `<div style="background:white; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06); cursor:pointer;" onclick="viewProduct('${item.productId}')">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#f0f0f0; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#ccc;">🛒</span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#0066cc; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <button onclick="event.stopPropagation(); addToCart('${item.productId}')" style="background:#0066cc; color:white; border:none; padding:0.4rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;">🛒 담기</button>
                    <button onclick="event.stopPropagation(); toggleWishlist('${item.productId}'); setTimeout(loadWishlist, 500);" style="background:none; border:1px solid #e91e63; color:#e91e63; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;">🗑️</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

