// ===== marketplace.js - 쇼핑몰, 모금, 에너지, 비즈니스, 아티스트, 출판, P2P크레딧 =====

const ORDER_STATUS_LABELS = { paid:t('mall.status_paid','💰 결제완료'), shipping:t('mall.status_shipping','🚚 배송중'), delivered:t('mall.status_delivered','✅ 배송완료'), cancelled:t('mall.status_cancelled','❌ 취소') };
const ORDER_STATUS_COLORS = { paid:'#ff9800', shipping:'#2196f3', delivered:'#4CAF50', cancelled:'#cc0000' };
const BRAND_SLOGANS = {
    present: '아름다움을 선물하다', doctor: '건강한 삶의 시작', medical: '신뢰할 수 있는 의료',
    avls: '감각을 깨우다', solution: '안전을 디자인하다', architect: '공간을 창조하다',
    mall: '일상의 가치', designers: '스타일을 입다'
};
const BRAND_COLORS = {
    present:'#FDEBD0', doctor:'#D5F5E3', medical:'#D6EAF8', avls:'#E8DAEF',
    solution:'#F2F3F4', architect:'#FADBD8', mall:'#FCF3CF', designers:'#EBDEF0'
};
const BRAND_ICONS = {
    present:'💄', doctor:'💊', medical:'🏥', avls:'🎬', solution:'🔐', architect:'🏗️', mall:'🛒', designers:'👗'
};
const RETURN_REASONS = ['불량','오배송','단순변심','기타'];
const MAX_ORDER_AMOUNT = 10000; // 1회 최대 주문 금액 (CRGC)
let _orderInProgress = false; // 동시 주문 방지 플래그

const MALL_CATEGORIES = {
    'present':'💄 프레즌트','doctor':'💊 포닥터','medical':'🏥 메디컬','avls':'🎬 AVLs',
    'solution':'🔐 프라이빗','architect':'🏗️ 아키텍트','mall':'🛒 크라우니몰','designers':'👗 디자이너스',
    '뷰티':'💄 화장품','음향':'🔊 음향','헬스':'💪 헬스','생활':'☕ 생활','전자':'🔋 전자','패션':'👗 패션','식품':'🍽️ 식품','기타':'📦 기타'
};

function renderStars(rating, size='0.85rem') {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= Math.round(rating) ? '#8B6914' : '#E8E0D8'}; font-size:${size};">★</span>`;
    return s;
}

// Helper: get product thumbnail (supports images[] array and legacy imageData)
function getProductThumb(p) {
    if (p.images && p.images.length > 0) return p.images[0];
    return p.imageData || '';
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

        // 검색 필터 (상품명 + 설명 + 브랜드 + 카테고리 통합)
        const searchVal = (document.getElementById('mall-search')?.value || '').trim().toLowerCase();
        if (searchVal) items = items.filter(p =>
            p.title.toLowerCase().includes(searchVal) ||
            (p.description||'').toLowerCase().includes(searchVal) ||
            (p.category||'').toLowerCase().includes(searchVal) ||
            (MALL_CATEGORIES[p.category]||'').toLowerCase().includes(searchVal) ||
            (p.sellerNickname||'').toLowerCase().includes(searchVal)
        );

        // 고급 필터 적용
        if (typeof _mallFilters !== 'undefined') {
            if (_mallFilters.category) items = items.filter(p => p.category === _mallFilters.category);
            if (_mallFilters.priceMin) items = items.filter(p => p.price >= parseFloat(_mallFilters.priceMin));
            if (_mallFilters.priceMax) items = items.filter(p => p.price <= parseFloat(_mallFilters.priceMax));
            if (_mallFilters.ratingMin) items = items.filter(p => (p.avgRating||0) >= parseFloat(_mallFilters.ratingMin));
            if (_mallFilters.inStockOnly) items = items.filter(p => (p.stock - (p.sold||0)) > 0);
        }

        // 정렬
        const sortVal = document.getElementById('mall-sort')?.value || 'newest';
        if (sortVal === 'price-low') items.sort((a,b) => a.price - b.price);
        else if (sortVal === 'price-high') items.sort((a,b) => b.price - a.price);
        else if (sortVal === 'popular') items.sort((a,b) => (b.sold||0) - (a.sold||0));
        else if (sortVal === 'rating') items.sort((a,b) => (b.avgRating||0) - (a.avgRating||0));

        // 검색 결과 수 표시
        const countEl = document.getElementById('mall-result-count');
        if (countEl) countEl.textContent = `${items.length}개 상품`;

        if (items.length === 0) { container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">검색 결과가 없습니다</p>'; return; }
        
        // 검색 초기화
        if (typeof initMallSearch === 'function') initMallSearch();
        container.innerHTML = '';
        // 검색 하이라이트 함수
        const highlightText = (text, query) => {
            if (!query || !text) return text;
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff59d;padding:0 1px;border-radius:2px;">$1</mark>');
        };
        items.forEach(p => {
            const thumb = getProductThumb(p);
            const imgCount = (p.images && p.images.length > 1) ? `<span style="position:absolute; top:6px; left:6px; background:rgba(61,43,31,0.6); color:#FFF8F0; font-size:0.6rem; padding:0.15rem 0.4rem; border-radius:4px;">📷 ${p.images.length}</span>` : '';
            const ratingHtml = p.avgRating ? `<div style="margin-top:0.2rem;">${renderStars(p.avgRating, '0.7rem')} <span style="font-size:0.65rem; color:var(--accent);">(${p.reviewCount||0})</span></div>` : '';
            const displayTitle = searchVal ? highlightText(p.title, searchVal) : p.title;
            container.innerHTML += `
                <div onclick="viewProduct('${p.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08); position:relative;">
                    <button onclick="event.stopPropagation(); toggleWishlist('${p.id}')" style="position:absolute; top:6px; right:6px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.9rem; z-index:1;">🤍</button>
                    ${imgCount}
                    <div style="height:140px; overflow:hidden; background:#F7F3ED;">${thumb ? `<img src="${thumb}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#E8E0D8;">🛒</div>`}</div>
                    <div style="padding:0.6rem;">
                        <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayTitle}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${MALL_CATEGORIES[p.category] || p.category || ''} · <a onclick="event.stopPropagation(); viewStore('${p.sellerId}')" style="cursor:pointer; text-decoration:underline; color:var(--accent);">${p.sellerNickname || p.sellerEmail || t('mall.seller','판매자')}</a></div>
                        <div style="font-weight:700; color:#3D2B1F; margin-top:0.3rem;">${p.price} CRGC</div>
                        <div style="font-size:0.7rem; color:var(--accent);">재고: ${p.stock - (p.sold||0)}개</div>
                        ${ratingHtml}
                        <button onclick="event.stopPropagation(); addToCart('${p.id}')" style="width:100%; margin-top:0.4rem; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.35rem; border-radius:5px; cursor:pointer; font-size:0.75rem; font-weight:600;">🛒 담기</button>
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

        // Reviews - enhanced with photos, verified badge, helpful, rating distribution
        let reviewsHtml = '';
        try {
            const revSnap = await db.collection('product_reviews').where('productId','==',id).orderBy('createdAt','desc').limit(30).get();
            if (!revSnap.empty) {
                // Rating distribution
                const dist = [0,0,0,0,0];
                let totalR = 0;
                revSnap.forEach(r => { const rt = r.data().rating||5; dist[rt-1]++; totalR += rt; });
                const avgR = (totalR / revSnap.size).toFixed(1);
                let distHtml = '';
                for (let i = 5; i >= 1; i--) {
                    const pct = revSnap.size > 0 ? Math.round(dist[i-1] / revSnap.size * 100) : 0;
                    distHtml += `<div style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;">
                        <span>${i}★</span>
                        <div style="flex:1;background:#e0e0e0;height:6px;border-radius:3px;"><div style="background:#8B6914;height:100%;border-radius:3px;width:${pct}%;"></div></div>
                        <span style="color:var(--accent);min-width:28px;text-align:right;">${dist[i-1]}</span>
                    </div>`;
                }

                reviewsHtml = `<div style="margin-top:1.5rem; background:#FFF8F0; padding:1.2rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    <h4 style="margin-bottom:0.8rem;">📝 리뷰 (${revSnap.size})</h4>
                    <div style="display:flex;gap:1.5rem;align-items:center;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #E8E0D8;">
                        <div style="text-align:center;">
                            <div style="font-size:2rem;font-weight:800;color:#8B6914;">${avgR}</div>
                            <div>${renderStars(parseFloat(avgR),'1rem')}</div>
                            <div style="font-size:0.75rem;color:var(--accent);">${revSnap.size}개 리뷰</div>
                        </div>
                        <div style="flex:1;">${distHtml}</div>
                    </div>`;
                revSnap.forEach(r => {
                    const rv = r.data();
                    const verifiedBadge = rv.verified ? '<span style="background:#e8f5e9;color:#2e7d32;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.3rem;">✅ 구매인증</span>' : '';
                    const dateStr = rv.createdAt?.toDate ? rv.createdAt.toDate().toLocaleDateString('ko-KR') : '';
                    reviewsHtml += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; font-weight:600;">${rv.buyerEmail?.split('@')[0] || '구매자'}${verifiedBadge}</span>
                            <span>${renderStars(rv.rating, '0.8rem')}</span>
                        </div>
                        <div style="font-size:0.7rem; color:var(--accent); margin-top:0.1rem;">${dateStr}</div>
                        ${rv.comment ? `<p style="font-size:0.85rem; margin-top:0.3rem; color:#555;">${rv.comment}</p>` : ''}
                        ${rv.imageData ? `<img src="${rv.imageData}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;margin-top:0.4rem;cursor:pointer;" onclick="window.open(this.src)">` : ''}
                        <div style="margin-top:0.4rem;display:flex;gap:0.4rem;">
                            <button onclick="helpfulReview('${r.id}')" style="background:none;border:1px solid #E8E0D8;border-radius:12px;padding:0.2rem 0.6rem;cursor:pointer;font-size:0.75rem;color:var(--accent);">👍 도움이 돼요 ${rv.helpful||0}</button>
                            ${currentUser && rv.buyerId !== currentUser.uid ? `<button onclick="event.stopPropagation();reportReview('${r.id}')" style="background:none;border:1px solid #E8E0D8;border-radius:12px;padding:0.2rem 0.6rem;cursor:pointer;font-size:0.7rem;color:#cc0000;">🚨</button>` : ''}
                        </div>
                    </div>`;
                });
                reviewsHtml += '</div>';
            }
        } catch(e) { console.warn("[catch]", e); }

        // Review button for delivered orders
        let reviewBtnHtml = '';
        if (currentUser && !isOwner) {
            try {
                const myOrders = await db.collection('orders').where('buyerId','==',currentUser.uid).where('productId','==',id).where('status','==','delivered').limit(1).get();
                if (!myOrders.empty) {
                    const existingReview = await db.collection('product_reviews').where('productId','==',id).where('buyerId','==',currentUser.uid).limit(1).get();
                    if (existingReview.empty) {
                        reviewBtnHtml = `<button onclick="writeReview('${id}')" style="background:#ff9800; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; font-weight:600; width:100%; margin-top:0.5rem;">⭐ 리뷰 작성</button>`;
                    }
                }
            } catch(e) { console.warn("[catch]", e); }
        }

        const ratingDisplay = p.avgRating ? `<div style="margin:0.5rem 0;">${renderStars(p.avgRating, '1rem')} <span style="font-size:0.9rem; color:var(--accent);">${p.avgRating.toFixed(1)} (${p.reviewCount||0}개)</span></div>` : '';

        // Multi-image gallery
        const images = (p.images && p.images.length > 0) ? p.images : (p.imageData ? [p.imageData] : []);
        let galleryHtml = '';
        if (images.length > 1) {
            galleryHtml = `<div style="position:relative; background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <div id="pd-gallery" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">
                    ${images.map((img, i) => `<img src="${img}" style="width:100%; max-height:50vh; object-fit:contain; flex-shrink:0; scroll-snap-align:start;" data-idx="${i}">`).join('')}
                </div>
                <div style="text-align:center; padding:0.4rem;">
                    ${images.map((_, i) => `<span class="pd-dot" data-idx="${i}" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${i===0?'#3D2B1F':'#E8E0D8'}; margin:0 3px; cursor:pointer;"></span>`).join('')}
                </div>
                <button onclick="scrollPdGallery(-1)" style="position:absolute; left:4px; top:45%; background:rgba(0,0,0,0.4); color:#FFF8F0; border:none; border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:1rem;">‹</button>
                <button onclick="scrollPdGallery(1)" style="position:absolute; right:4px; top:45%; background:rgba(0,0,0,0.4); color:#FFF8F0; border:none; border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:1rem;">›</button>
            </div>`;
        } else if (images.length === 1) {
            galleryHtml = `<div style="background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <img src="${images[0]}" style="width:100%; max-height:50vh; object-fit:contain;">
            </div>`;
        } else {
            galleryHtml = `<div style="background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <div style="width:100%;height:250px;display:flex;align-items:center;justify-content:center;font-size:5rem;color:#E8E0D8;">🛒</div>
            </div>`;
        }

        // Seller link
        const sellerLink = p.sellerNickname || p.sellerEmail ? `<a onclick="viewStore('${p.sellerId}')" style="cursor:pointer; text-decoration:underline; color:#3D2B1F;">판매자: ${p.sellerNickname||p.sellerEmail}</a>` : '';

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← 목록으로</button>
            ${galleryHtml}
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h2 style="margin:0; flex:1;">${p.title}</h2>
                    <button onclick="toggleWishlist('${id}')" id="wish-btn-${id}" style="background:none; border:none; font-size:1.5rem; cursor:pointer; padding:0.2rem;">${isWished ? '❤️' : '🤍'}</button>
                </div>
                <p style="color:var(--accent); font-size:0.85rem; margin:0.5rem 0;">${[MALL_CATEGORIES[p.category], sellerLink].filter(Boolean).join(' · ')}</p>
                ${ratingDisplay}
                ${p.description ? `<p style="font-size:0.95rem; margin:1rem 0; line-height:1.6; color:#444;">${p.description}</p>` : ''}
                <div style="font-size:1.4rem; font-weight:700; color:#3D2B1F; margin:1rem 0;">${p.price} CRGC</div>
                <div style="font-size:0.85rem; color:var(--accent); margin-bottom:1rem;">재고: ${remaining}개 · 판매: ${p.sold||0}개</div>
                ${!isOwner && remaining > 0 ? `
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="buyProduct('${id}', this)" style="flex:2; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:1rem;">🛒 바로 구매</button>
                    <button onclick="addToCart('${id}')" style="flex:1; background:#FFF8F0; color:#3D2B1F; border:2px solid #3D2B1F; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">담기</button>
                </div>` : ''}
                ${remaining <= 0 ? '<p style="color:#cc0000; font-weight:700; text-align:center; font-size:1.1rem; margin:1rem 0;">품절</p>' : ''}
                ${reviewBtnHtml}
                ${!isOwner && currentUser ? `<button onclick="reportProduct('${id}')" style="background:none; color:#cc0000; border:1px solid #cc0000; padding:0.5rem; border-radius:8px; cursor:pointer; width:100%; margin-top:0.5rem; font-size:0.85rem;">🚨 신고</button>` : ''}
            </div>
            ${reviewsHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

async function writeReview(productId) {
    // Enhanced review modal with star picker + photo
    return new Promise((resolve) => {
        let selectedRating = 5;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;">
            <h3 style="margin-bottom:1rem;">⭐ 리뷰 작성</h3>
            <div style="text-align:center; margin-bottom:1rem;">
                <div id="review-stars" style="font-size:2rem; cursor:pointer;">
                    ${[1,2,3,4,5].map(i => `<span data-star="${i}" style="color:#8B6914;">★</span>`).join('')}
                </div>
                <div id="review-rating-label" style="font-size:0.85rem; color:var(--accent);">5점</div>
            </div>
            <textarea id="review-comment" placeholder="리뷰를 작성해주세요..." rows="3" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;margin-bottom:0.8rem;"></textarea>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.85rem; color:var(--accent);">📷 사진 첨부 (선택)</label>
                <input type="file" id="review-photo" accept="image/*" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;margin-top:0.3rem;">
                <div id="review-photo-preview" style="margin-top:0.3rem;"></div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <button id="review-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
                <button id="review-submit" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#ff9800;color:#FFF8F0;font-weight:700;">등록</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        // Star click handler
        overlay.querySelectorAll('#review-stars span').forEach(span => {
            span.onclick = () => {
                selectedRating = parseInt(span.dataset.star);
                overlay.querySelectorAll('#review-stars span').forEach((s, i) => {
                    s.style.color = i < selectedRating ? '#8B6914' : '#E8E0D8';
                });
                overlay.querySelector('#review-rating-label').textContent = selectedRating + '점';
            };
        });

        // Photo preview
        overlay.querySelector('#review-photo').onchange = function() {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                overlay.querySelector('#review-photo-preview').innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:0.3rem;">`;
            };
            reader.readAsDataURL(file);
        };

        overlay.querySelector('#review-cancel').onclick = () => { overlay.remove(); resolve(); };
        overlay.querySelector('#review-submit').onclick = async () => {
            const comment = overlay.querySelector('#review-comment').value.trim();
            const photoFile = overlay.querySelector('#review-photo').files[0];
            try {
                let imageData = '';
                if (photoFile) imageData = await fileToBase64Resized(photoFile, 400);

                // Check verified purchase
                const myOrders = await db.collection('orders').where('buyerId','==',currentUser.uid).where('productId','==',productId).where('status','==','delivered').limit(1).get();
                const verified = !myOrders.empty;

                await db.collection('product_reviews').add({
                    productId, buyerId: currentUser.uid, buyerEmail: currentUser.email,
                    rating: selectedRating, comment: comment || '', imageData, verified, helpful: 0,
                    createdAt: new Date()
                });
                // Update product avg rating
                const allRevs = await db.collection('product_reviews').where('productId','==',productId).get();
                let total = 0; allRevs.forEach(r => total += r.data().rating);
                const avg = total / allRevs.size;
                await db.collection('products').doc(productId).update({ avgRating: Math.round(avg * 10) / 10, reviewCount: allRevs.size });
                // 판매자 알림
                const prodForReview = await db.collection('products').doc(productId).get();
                if (prodForReview.exists && typeof createNotification === 'function') {
                    await createNotification(prodForReview.data().sellerId, 'order_status', { message: `⭐ "${prodForReview.data().title}"에 새 리뷰가 작성되었습니다 (${selectedRating}점)`, link: `#page=product-detail&id=${productId}` });
                }
                showToast('⭐ 리뷰 등록 완료!', 'success');
                overlay.remove();
                viewProduct(productId);
                resolve();
            } catch (e) { showToast('리뷰 실패: ' + e.message, 'error'); }
        };
    });
}

async function buyProduct(id, btn) {
    if (!currentUser) return;
    // 이중 클릭 방지
    if (btn) { btn.disabled = true; setTimeout(() => { if(btn) btn.disabled = false; }, 3000); }
    // 동시 주문 방지
    if (_orderInProgress) { showToast(t('mall.order_in_progress','주문 처리 중입니다. 잠시 기다려주세요.'), 'warning'); return; }
    _orderInProgress = true;
    try {
        const tk = 'crgc';
        
        // 1차 확인
        const doc = await db.collection('products').doc(id).get();
        const p = doc.data();
        if (!p || p.status !== 'active') { showToast('상품을 구매할 수 없습니다', 'warning'); return; }
        const price = p.price;
        if (!price || price <= 0 || !Number.isFinite(price)) { showToast('비정상 가격', 'error'); return; }
        // 주문 금액 상한 검증
        if (price > MAX_ORDER_AMOUNT) { showToast(t('mall.max_order_exceeded',`1회 최대 주문 금액은 ${MAX_ORDER_AMOUNT} CRGC입니다`), 'warning'); return; }
        // 클라이언트 잔액 사전 검증
        const preCheck = await db.collection('users').doc(currentUser.uid).get();
        const preBal = preCheck.data()?.offchainBalances || {};
        if ((preBal[tk] || 0) < price) { showToast(t('mall.insufficient_balance','CRGC 잔액이 부족합니다'), 'warning'); return; }
        if ((p.stock - (p.sold||0)) <= 0) { showToast(t('mall.sold_out','품절'), 'warning'); return; }
        
        if (!await showConfirmModal(t('mall.confirm_buy','구매 확인'), `"${p.title}"\n${price} CRGC로 구매하시겠습니까?`)) return;
        
        // 배송지 입력
        const shippingInfo = await showShippingModal();
        if (!shippingInfo) return;
        
        // Firestore 트랜잭션으로 원자적 처리 (잔액 차감 + 재고 감소)
        const orderRef = db.collection('orders').doc(); // pre-generate ID
        await db.runTransaction(async (tx) => {
            // 실시간 잔액 재확인
            const buyerDoc = await tx.get(db.collection('users').doc(currentUser.uid));
            const buyerBal = buyerDoc.data()?.offchainBalances || {};
            if ((buyerBal[tk] || 0) < price) throw new Error('CRGC 잔액이 부족합니다');
            
            // 재고 재확인
            const prodDoc = await tx.get(db.collection('products').doc(id));
            const pNow = prodDoc.data();
            if ((pNow.stock - (pNow.sold||0)) <= 0) throw new Error('품절된 상품입니다');
            
            // 잔액 차감
            tx.update(db.collection('users').doc(currentUser.uid), {
                [`offchainBalances.${tk}`]: (buyerBal[tk] || 0) - price
            });
            
            // 판매자에게 지급
            const sellerDoc = await tx.get(db.collection('users').doc(pNow.sellerId));
            const sellerBal = sellerDoc.data()?.offchainBalances || {};
            tx.update(db.collection('users').doc(pNow.sellerId), {
                [`offchainBalances.${tk}`]: (sellerBal[tk] || 0) + price
            });
            
            // 재고 감소
            tx.update(db.collection('products').doc(id), { sold: (pNow.sold||0) + 1 });
            
            // 주문 생성
            tx.set(orderRef, {
                productId:id, productTitle:pNow.title, productImage: getProductThumb(pNow),
                buyerId:currentUser.uid, buyerEmail:currentUser.email,
                sellerId:pNow.sellerId, sellerEmail:pNow.sellerEmail||'',
                amount:price, qty:1, token:'CRGC', status:'paid', shippingInfo,
                statusHistory:[{status:'paid', at:new Date().toISOString()}], createdAt:new Date()
            });
        });
        
        // 트랜잭션 성공 후 부가 처리
        if (typeof autoGivingPoolContribution === 'function') await autoGivingPoolContribution(price);
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, price, 'CRGC');
        
        // 판매자 알림
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `🛒 새 주문! "${p.title}" (${price} CRGC)`, link: '#page=my-shop' });
        }
        
        showToast(`🎉 "${p.title}" 구매 완료!`, 'success');
        document.getElementById('product-modal')?.remove();
        loadMallProducts(); loadUserWallet();
    } catch (e) { showToast('구매 실패: ' + e.message, 'error'); } finally { _orderInProgress = false; }
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
            const reviewBtn = x.status === 'delivered' ? `<button onclick="event.stopPropagation(); writeReview('${x.productId}')" style="background:#ff9800; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-left:0.5rem;">⭐ 리뷰</button>` : '';
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
            const statusBadge = x.status === 'active' ? '<span style="color:#4CAF50; font-size:0.75rem;">● 판매중</span>' : x.status === 'pending' ? '<span style="color:#ff9800; font-size:0.75rem;">● 승인대기</span>' : x.status === 'rejected' ? '<span style="color:#f44336; font-size:0.75rem;">● 거부됨</span>' : '<span style="color:#6B5744; font-size:0.75rem;">● 비활성</span>';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.title}</strong> — ${x.price} CRGC · 판매: ${x.sold||0}/${x.stock} ${statusBadge}</div>
                    <div style="display:flex; gap:0.3rem;">
                        <button onclick="editProduct('${d.id}')" style="background:#2196f3; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.edit_btn','✏️ 수정')}</button>
                        <button onclick="toggleProduct('${d.id}','${x.status}')" style="background:${x.status==='active'?'#6B5744':'#4CAF50'}; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${x.status==='active'?t('mall.deactivate','⏸ 비활성'):t('mall.activate','▶ 활성')}</button>
                        <button onclick="deleteProduct('${d.id}')" style="background:#cc0000; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">🗑️</button>
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
        const parsedPrice = parseFloat(newPrice);
        const parsedStock = parseInt(newStock);
        if (parsedPrice <= 0 || !Number.isFinite(parsedPrice)) { showToast('가격은 0보다 커야 합니다', 'warning'); return; }
        if (parsedStock < 0 || !Number.isFinite(parsedStock)) { showToast('재고는 0 이상이어야 합니다', 'warning'); return; }
        await db.collection('products').doc(id).update({
            price: parsedPrice,
            stock: parsedStock,
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
        // Load return requests first
        const returnsHtml = await loadSellerReturns() || '';
        const o = await db.collection('orders').where('sellerId','==',currentUser.uid).orderBy('createdAt','desc').limit(30).get();
        if (o.empty && !returnsHtml) { c.innerHTML='<p style="color:var(--accent);">받은 주문 없음</p>'; return; }
        c.innerHTML = returnsHtml;
        o.forEach(d => {
            const x = d.data();
            const statusLabel = ORDER_STATUS_LABELS[x.status] || x.status;
            const statusColor = ORDER_STATUS_COLORS[x.status] || 'var(--accent)';
            const nextActions = [];
            if (x.status === 'paid') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','shipping')" style="background:#2196f3; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.process_shipping','🚚 배송처리')}</button>`);
            if (x.status === 'shipping') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','delivered')" style="background:#4CAF50; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.mark_delivered','✅ 배송완료')}</button>`);
            const shipInfo = x.shippingInfo ? `<div style="font-size:0.7rem; color:#555; margin-top:0.2rem;">📦 ${x.shippingInfo.name} · ${x.shippingInfo.phone} · ${x.shippingInfo.address}${x.shippingInfo.memo ? ' · '+x.shippingInfo.memo : ''}</div>` : '';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.productTitle}</strong> — ${x.amount} ${x.token}<br><span style="font-size:0.75rem; color:var(--accent);">구매자: ${x.buyerEmail}</span>${shipInfo}</div>
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
    if (newStatus === 'shipping') {
        const trackingNo = await showPromptModal('배송 추적번호', '추적번호를 입력하세요 (선택)', '');
        if (!await showConfirmModal(t('mall.change_status','주문 상태 변경'), `${label}(으)로 변경하시겠습니까?`)) return;
        try {
            const updateData = { status: newStatus, [`${newStatus}At`]: new Date(),
                statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: newStatus, at: new Date().toISOString() })
            };
            if (trackingNo) updateData.trackingNumber = trackingNo;
            await db.collection('orders').doc(orderId).update(updateData);
            // 구매자 알림
            const orderDoc = await db.collection('orders').doc(orderId).get();
            const o = orderDoc.data();
            if (typeof createNotification === 'function') {
                await createNotification(o.buyerId, 'order_status', { message: `🚚 "${o.productTitle}" 주문이 배송중입니다!`, link: '#page=buyer-orders' });
            }
            showToast(`${label} 처리 완료`, 'success');
            loadSellerOrders();
        } catch (e) { showToast('실패: ' + e.message, 'error'); }
    } else {
        if (!await showConfirmModal(t('mall.change_status','주문 상태 변경'), `${label}(으)로 변경하시겠습니까?`)) return;
        try {
            await db.collection('orders').doc(orderId).update({ status: newStatus, [`${newStatus}At`]: new Date(),
                statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: newStatus, at: new Date().toISOString() })
            });
            // 구매자 알림
            const orderDoc = await db.collection('orders').doc(orderId).get();
            const o = orderDoc.data();
            if (typeof createNotification === 'function') {
                const msg = newStatus === 'delivered' ? `✅ "${o.productTitle}" 배송이 완료되었습니다!` : `📦 "${o.productTitle}" 주문 상태가 변경되었습니다`;
                await createNotification(o.buyerId, 'order_status', { message: msg, link: '#page=buyer-orders' });
            }
            showToast(`${label} 처리 완료`, 'success');
            loadSellerOrders();
        } catch (e) { showToast('실패: ' + e.message, 'error'); }
    }
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
                <div style="background:#FFF8F0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;" onclick="showCampaignDetail('${d.id}')">
                    ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:180px; object-fit:cover;">` : ''}
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
                            <button onclick="event.stopPropagation(); donateCampaign('${d.id}')" style="background:#4CAF50; color:#FFF8F0; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; flex:1; font-weight:700;">${t('fundraise.donate_btn','💝 기부하기')}</button>
                            ${isCreator ? `<button onclick="event.stopPropagation(); closeCampaign('${d.id}')" style="background:#e53935; color:#FFF8F0; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.8rem;">${t('fund.close','🔒 종료')}</button>` : ''}
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

// ========== CREB LABS - 미래기술 투자 ==========

const CREB_CATEGORIES = {
    energy: { icon: '⚡', color: '#ff9800', label: '에너지', sdg: 'SDG 7' },
    genetics: { icon: '🧬', color: '#E91E63', label: '유전공학', sdg: 'SDG 3' },
    biotech: { icon: '🔬', color: '#4CAF50', label: '생명공학', sdg: 'SDG 3' },
    ai_robotics: { icon: '🤖', color: '#2196F3', label: 'AI·로보틱스', sdg: 'SDG 9' }
};

const CREB_INVEST_TYPES = {
    return: { icon: '💰', label: '수익형', color: '#ff9800', bg: '#FFF3E0' },
    donation: { icon: '💝', label: '기부형 · 선한 투자', color: '#4CAF50', bg: '#E8F5E9' },
    hybrid: { icon: '🔄', label: '하이브리드', color: '#2196F3', bg: '#E3F2FD' }
};

const CREB_IMPACT = {
    energy: { unit: 'kW 청정에너지 생산에 기여', factor: 0.5 },
    genetics: { unit: '시간 희귀질환 연구 지원', factor: 0.01 },
    biotech: { unit: '단계 신약 파이프라인 진행', factor: 0.005 },
    ai_robotics: { unit: '건 AI 학습 데이터 처리', factor: 0.1 }
};

let _crebCurrentFilter = 'all';

function filterCrebCategory(cat) {
    _crebCurrentFilter = cat;
    document.querySelectorAll('.creb-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === cat);
        if (b.dataset.cat === cat) { b.style.background = cat === 'all' ? '#333' : (CREB_CATEGORIES[cat]?.color || '#333'); b.style.color = 'white'; }
        else { b.style.background = 'white'; b.style.color = b.dataset.cat === 'all' ? '#6B5744' : (CREB_CATEGORIES[b.dataset.cat]?.color || '#6B5744'); }
    });
    loadEnergyProjects();
}

function getInvestType(x) {
    if (x.investType) return x.investType;
    if (x.returnRate > 0) return 'return';
    return 'return';
}

function renderInvestBadge(x) {
    const itype = getInvestType(x);
    const info = CREB_INVEST_TYPES[itype] || CREB_INVEST_TYPES['return'];
    return `<span style="display:inline-block; padding:0.15rem 0.5rem; border-radius:10px; font-size:0.7rem; background:${info.bg}; color:${info.color}; font-weight:600;">${info.icon} ${info.label}</span>`;
}

function renderMilestones(milestones) {
    if (!milestones || !milestones.length) return '';
    return milestones.map(m => {
        const pct = Math.min(100, Math.round((m.current / m.target) * 100));
        return `<div style="margin-top:0.3rem;"><div style="font-size:0.7rem; color:#555;">${m.name} (${pct}%)</div><div style="background:#e0e0e0; height:4px; border-radius:2px;"><div style="background:#2196F3; height:100%; border-radius:2px; width:${pct}%;"></div></div></div>`;
    }).join('');
}

async function loadEnergyProjects() {
    const c = document.getElementById('energy-projects');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        let query = db.collection('energy_projects').where('status','==','active').orderBy('createdAt','desc').limit(20);
        const docs = await query.get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">등록된 프로젝트가 없습니다.</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            const cat = x.category || 'energy';
            if (_crebCurrentFilter !== 'all' && cat !== _crebCurrentFilter) return;
            const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
            const xTitle = x.name || x.title || '';
            const xGoal = x.goal || x.targetAmount || 0;
            const xInvested = x.invested || x.currentAmount || 0;
            const xInvestors = x.investors || x.investorCount || 0;
            const pct = Math.min(100, Math.round((xInvested / xGoal)*100));
            const rate = x.returnRate || 0;
            const exMonthly = (100 * rate / 100 / 12).toFixed(2);
            const isAdmin = currentUser && (currentUser.email === 'admin@crowny.org' || currentUser.uid === x.creatorId);
            const itype = getInvestType(x);
            c.innerHTML += `<div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:0.8rem; border-left:4px solid ${catInfo.color};" onclick="openProjectDetail('${d.id}')" data-category="${cat}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                    <h4 style="margin:0;">${catInfo.icon} ${xTitle}</h4>
                    <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:10px; background:${catInfo.color}15; color:${catInfo.color}; font-weight:600;">${catInfo.label}</span>
                </div>
                <div style="margin-bottom:0.3rem;">${renderInvestBadge(x)}</div>
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.location || ''} ${x.capacity ? '· ' + x.capacity + 'kW' : ''} ${rate > 0 ? '· 예상 수익률 ' + rate + '%' : ''}</p>
                ${rate > 0 ? `<div style="font-size:0.8rem; color:#2e7d32; margin-top:0.3rem;">💰 100 CREB 투자 시 → 월 ${exMonthly} CREB (연 ${rate}%)</div>` : ''}
                ${itype === 'donation' ? `<div style="font-size:0.8rem; color:#4CAF50; margin-top:0.3rem;">💝 순수 기부 · 수익 없이 미래를 위한 투자</div>` : ''}
                ${itype === 'hybrid' ? `<div style="font-size:0.8rem; color:#2196F3; margin-top:0.3rem;">🔄 수익 50% + 재투자 50%</div>` : ''}
                <div style="font-size:0.75rem; color:var(--accent);">👥 투자자 ${xInvestors}명</div>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${xInvested}/${xGoal} CREB</span><span>${pct}%</span></div>
                ${renderMilestones(x.milestones)}
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;" onclick="event.stopPropagation();">
                    <button onclick="investEnergy('${d.id}')" style="background:${catInfo.color}; color:#FFF8F0; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1;">${t('energy.invest_btn','☀️ 투자하기')}</button>
                    ${isAdmin ? `<button onclick="distributeEnergyReturns('${d.id}')" style="background:#1976D2; color:#FFF8F0; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1; font-size:0.8rem;">${t('energy.distribute','📊 수익 배분')}</button>` : ''}
                </div>
            </div>`; });
        if (!c.innerHTML.trim()) c.innerHTML = '<p style="color:var(--accent);">이 카테고리에 프로젝트가 없습니다.</p>';
    } catch (e) { c.innerHTML = e.message; }
}

// 프로젝트 상세 모달
async function openProjectDetail(projectId) {
    try {
        const doc = await db.collection('energy_projects').doc(projectId).get();
        if (!doc.exists) return;
        const x = doc.data();
        const cat = x.category || 'energy';
        const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
        const rate = x.returnRate || 0;
        const xTitle = x.name || x.title || '';
        const xGoal = x.goal || 0;
        const xInvested = x.invested || 0;
        const pct = Math.min(100, Math.round((xInvested/xGoal)*100));

        let teamHtml = '';
        if (x.teamMembers && x.teamMembers.length) {
            teamHtml = `<div style="margin-top:1rem;"><h4>👥 팀</h4>${x.teamMembers.map(m => `<div style="padding:0.3rem 0; font-size:0.85rem;">${m.name} — ${m.role || ''}</div>`).join('')}</div>`;
        }

        let milestonesHtml = '';
        if (x.milestones && x.milestones.length) {
            milestonesHtml = `<div style="margin-top:1rem;"><h4>📋 마일스톤</h4>${x.milestones.map(m => {
                const mp = Math.min(100, Math.round((m.current/m.target)*100));
                return `<div style="margin:0.5rem 0;"><div style="font-size:0.85rem; font-weight:600;">${m.name}</div><div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.3rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:3px; width:${mp}%;"></div></div><div style="font-size:0.75rem; color:var(--accent);">${m.current}/${m.target} (${mp}%)</div></div>`;
            }).join('')}</div>`;
        }

        // Load comments
        let commentsHtml = '';
        try {
            const comments = await db.collection('energy_projects').doc(projectId).collection('energy_comments').orderBy('createdAt','desc').limit(20).get();
            if (!comments.empty) {
                commentsHtml = comments.docs.map(c => {
                    const cd = c.data();
                    const date = cd.createdAt?.toDate ? cd.createdAt.toDate().toLocaleDateString('ko-KR') : '';
                    return `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem;"><div style="font-size:0.75rem; color:var(--accent);">${cd.nickname || '익명'} · ${date}</div><div style="font-size:0.85rem;">${cd.text}</div></div>`;
                }).join('');
            }
        } catch(e) { console.warn("[catch]", e); }

        // Load investors
        let investorsHtml = '';
        try {
            const invs = await db.collection('energy_investments').where('projectId','==',projectId).orderBy('timestamp','desc').limit(10).get();
            if (!invs.empty) {
                investorsHtml = `<div style="margin-top:1rem;"><h4>💰 최근 투자자</h4>${invs.docs.map(i => {
                    const id = i.data();
                    return `<div style="font-size:0.8rem; padding:0.2rem 0;">익명 · ${id.amount} CREB</div>`;
                }).join('')}</div>`;
            }
        } catch(e) { console.warn("[catch]", e); }

        const modalHtml = `<div id="creb-project-modal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(61,43,31,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this)this.remove();">
            <div style="background:#FFF8F0; border-radius:12px; max-width:550px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="margin:0;">${catInfo.icon} ${xTitle}</h3>
                    <button onclick="document.getElementById('creb-project-modal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
                <div style="display:flex; gap:0.5rem; margin-bottom:0.8rem;">
                    <span style="padding:0.2rem 0.6rem; border-radius:10px; font-size:0.75rem; background:${catInfo.color}15; color:${catInfo.color}; font-weight:600;">${catInfo.label}</span>
                    ${renderInvestBadge(x)}
                    <span style="padding:0.2rem 0.6rem; border-radius:10px; font-size:0.75rem; background:#F7F3ED; color:#6B5744;">${catInfo.sdg}</span>
                </div>
                <p style="color:var(--accent);">${x.description || x.location || ''}</p>
                <div style="background:#e0e0e0; height:8px; border-radius:4px; margin:0.8rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:4px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;"><span>${xInvested}/${xGoal} CREB (${pct}%)</span><span>수익률 ${rate}%</span></div>
                ${teamHtml}${milestonesHtml}${investorsHtml}
                <div style="margin-top:1rem;"><h4>💬 댓글</h4>
                    <div style="display:flex; gap:0.5rem; margin-bottom:0.8rem;">
                        <input type="text" id="creb-comment-input" placeholder="질문이나 의견..." style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
                        <button onclick="postCrebComment('${projectId}')" style="background:${catInfo.color}; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:6px; cursor:pointer;">등록</button>
                    </div>
                    ${commentsHtml}
                </div>
                <button onclick="investEnergy('${projectId}'); document.getElementById('creb-project-modal').remove();" class="btn-primary" style="width:100%; margin-top:1rem;">💰 투자하기</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch(e) { console.error(e); }
}

async function postCrebComment(projectId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    const input = document.getElementById('creb-comment-input');
    const text = input?.value.trim();
    if (!text) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('energy_projects').doc(projectId).collection('energy_comments').add({
            userId: currentUser.uid, nickname: userDoc.data()?.nickname || '익명',
            text, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('댓글 등록!', 'success');
        document.getElementById('creb-project-modal')?.remove();
        openProjectDetail(projectId);
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
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
            c.innerHTML += `<div onclick="viewBusinessDetail('${d.id}')" style="background:#FFF8F0; padding:1rem; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08); display:flex; gap:1rem; align-items:center; cursor:pointer;">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:70px; height:70px; border-radius:8px; object-fit:cover;">` : `<div style="width:70px; height:70px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${BIZ_CATS[x.category]||'🏢'}</div>`}
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
            c.innerHTML += `<div onclick="viewArtistDetail('${d.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;">
                <div style="height:160px; overflow:hidden; background:linear-gradient(135deg,#8B6914,#6B5744);">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:#FFF8F0;">${GENRES[x.genre]||'🌟'}</div>`}</div>
                <div style="padding:0.6rem;"><div style="font-weight:700;">${x.name}</div>
                <div style="font-size:0.75rem; color:var(--accent);">${GENRES[x.genre]||''} · 팬 ${x.fans}명</div>
                <button onclick="event.stopPropagation(); supportArtist('${d.id}')" style="background:#E91E63; color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; margin-top:0.4rem; font-size:0.8rem;">${t('artist.support_btn','💖 후원')}</button>
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
            c.innerHTML += `<div onclick="viewBookDetail('${d.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:180px; overflow:hidden; background:#f5f0e8;">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:contain;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem;">${GENRES[x.genre]||'📚'}</div>`}</div>
                <div style="padding:0.5rem;"><div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.title}</div>
                <div style="font-size:0.7rem; color:var(--accent);">${x.author||'저자 미상'}</div>
                <div style="font-weight:700; color:#3D2B1F; font-size:0.85rem; margin-top:0.2rem;">${x.price>0 ? x.price+' CRGC' : '무료'}</div></div></div>`; });
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
                    <button onclick="approveInsurance('${d.id}')" style="flex:1; background:#4CAF50; color:#FFF8F0; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; font-weight:600;">✅ 승인</button>
                    <button onclick="rejectInsurance('${d.id}')" style="flex:1; background:#f44336; color:#FFF8F0; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; font-weight:600;">❌ 거절</button>
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
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; border-left:3px solid ${STATUS_COLOR[r.status] || '#6B5744'};">
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
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem; background:linear-gradient(135deg,#8B6914,#6B5744); border-radius:8px; color:#FFF8F0; margin-top:0.3rem;">
                    <span style="font-size:1rem;">🏆 총 크레딧 점수</span>
                    <span style="font-size:1.5rem; font-weight:800; color:${totalScore >= 700 ? '#8B6914' : totalScore >= 500 ? '#F0C060' : '#8B6914'};">${totalScore}</span>
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
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        ${b.imageData ? `<img src="${b.imageData}" loading="lazy" style="width:100%; border-radius:12px 12px 0 0; max-height:200px; object-fit:cover;">` : ''}
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
            ${b.ownerId !== currentUser?.uid ? `<button onclick="investBusiness('${id}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;">💰 투자하기</button>` : ''}
            <button onclick="document.getElementById('biz-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">닫기</button>
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
        supportHtml += `<div style="font-size:0.8rem; padding:0.3rem 0; border-bottom:1px solid #E8E0D8;">${s.amount} ${s.token} · ${s.timestamp?.toDate?.()?.toLocaleDateString?.() || ''}</div>`;
    });
    // 유니크 팬 수
    const uniqueFans = new Set();
    const allSupports = await db.collection('transactions').where('artistId', '==', id).where('type', '==', 'artist_support').get();
    allSupports.forEach(d => uniqueFans.add(d.data().from));

    const modal = document.createElement('div');
    modal.id = 'artist-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:200px; background:linear-gradient(135deg,#8B6914,#6B5744); position:relative;">
            ${a.imageData ? `<img src="${a.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:12px 12px 0 0;">` : ''}
        </div>
        <div style="padding:1.2rem;">
            <h3>${a.name}</h3>
            <p style="color:var(--accent); font-size:0.85rem;">${GENRES[a.genre] || ''} · 팬 ${uniqueFans.size}명 · 총 후원 ${a.totalSupport || 0}</p>
            ${a.bio ? `<p style="font-size:0.9rem; margin:0.8rem 0;">${a.bio}</p>` : ''}
            <div style="margin:1rem 0;">
                <h4 style="font-size:0.85rem; margin-bottom:0.5rem;">💖 최근 후원</h4>
                ${supportHtml || '<p style="font-size:0.8rem; color:var(--accent);">후원 내역 없음</p>'}
            </div>
            <button onclick="supportArtist('${id}'); document.getElementById('artist-detail-modal').remove();" style="background:#E91E63; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;">💖 후원하기</button>
            <button onclick="document.getElementById('artist-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">닫기</button>
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
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:250px; background:#f5f0e8; display:flex; align-items:center; justify-content:center;">
            ${b.imageData ? `<img src="${b.imageData}" loading="lazy" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<span style="font-size:4rem;">${GENRES[b.genre]?.charAt(0) || '📚'}</span>`}
        </div>
        <div style="padding:1.2rem;">
            <h3>${b.title}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.3rem 0;">${b.author || '저자 미상'} · ${GENRES[b.genre] || ''} · 판매 ${b.sold || 0}부</p>
            <p style="font-size:1.1rem; font-weight:700; color:#3D2B1F; margin:0.5rem 0;">${b.price > 0 ? b.price + ' CRGC' : '무료'}</p>
            ${b.description ? `<p style="font-size:0.9rem; margin:0.8rem 0; line-height:1.6;">${b.description}</p>` : ''}
            <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                ${!isOwner && b.price > 0 ? `<button onclick="buyBook('${id}'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">🛒 구매하기</button>` : ''}
                ${!isOwner && b.price <= 0 ? `<button onclick="showToast('📖 무료 열람!', 'info'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#4CAF50; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">📖 무료 읽기</button>` : ''}
                <button onclick="addToReadingList('${id}')" style="flex:1; background:#ff9800; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">📚 읽고 싶은 책</button>
            </div>
            <button onclick="document.getElementById('book-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%; margin-top:0.5rem;">닫기</button>
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
            c.innerHTML += `<div style="background:#FFF8F0; padding:1rem; border-radius:8px; margin-bottom:0.5rem;">
                <div style="display:flex; justify-content:space-between;"><strong>${x.requesterNickname || x.requesterEmail}</strong><span style="color:#3D2B1F; font-weight:700;">${x.amount} CRTD</span></div>
                ${x.targetNickname ? `<p style="font-size:0.8rem; color:#E91E63; margin:0.2rem 0;">→ 대상: ${x.targetNickname || x.targetEmail}</p>` : '<p style="font-size:0.8rem; color:var(--accent); margin:0.2rem 0;">공동체 전체 공개</p>'}
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.reason}</p>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#4CAF50; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${x.raised}/${x.amount} · ${x.backers}명</span><span style="color:#4CAF50;">이자 0%</span></div>
                ${x.requesterId !== currentUser?.uid ? `<button onclick="contributePumasi('${d.id}')" style="background:#4CAF50; color:#FFF8F0; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">🤝 도와주기</button>` : ''}
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
    const category = document.getElementById('energy-category')?.value || 'energy';
    const investType = document.getElementById('energy-invest-type')?.value || 'return';
    if (!title || !goal) { showToast('프로젝트명과 목표 금액을 입력하세요', 'warning'); return; }
    try {
        await db.collection('energy_projects').add({
            title, location, capacity, returnRate, goal, category, investType,
            invested: 0, investors: 0, status: 'active',
            milestones: [], teamMembers: [],
            creatorId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const catInfo = CREB_CATEGORIES[category] || CREB_CATEGORIES.energy;
        showToast(`${catInfo.icon} "${title}" 프로젝트 등록!`, 'success');
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
            c.innerHTML += `<div style="background:#FFF8F0; padding:1rem; border-radius:8px; margin-bottom:0.5rem; border-left:4px solid #FF9800;">
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
                ${!isMember && g.currentMembers < g.maxMembers ? `<button onclick="joinGye('${d.id}')" style="background:#FF9800; color:#FFF8F0; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem; font-size:0.85rem;">🤝 참여하기</button>` : ''}
                ${isMember ? '<div style="text-align:center; font-size:0.8rem; color:#FF9800; margin-top:0.5rem;">✅ 참여 중</div>' : ''}
                ${g.organizerId === currentUser?.uid && g.status === 'active' && g.currentRound < (g.members?.length || 0) ? `<button onclick="executeGyeRound('${d.id}')" style="background:#E91E63; color:#FFF8F0; border:none; padding:0.4rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.3rem; font-size:0.8rem;">🔄 Round ${g.currentRound + 1} 실행</button>` : ''}
                ${g.status === 'recruiting' && g.currentMembers >= g.maxMembers ? '<div style="text-align:center; font-size:0.8rem; color:#6B5744; margin-top:0.5rem;">모집 완료</div>' : ''}
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
    if (brand) {
        // Navigate to brand landing page
        filterMallBrandLanding(brand);
        return;
    }
    // "전체" clicked — stay on mall page
    window._mallBrandFilter = null;
    
    // 활성 카드 하이라이트
    document.querySelectorAll('.mall-brand-card').forEach(c => {
        c.classList.remove('active');
        c.style.outline = 'none';
        c.style.opacity = '1';
    });
    const activeCard = document.querySelector(`.mall-brand-card[data-brand="all"]`);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.style.outline = '2px solid var(--gold, #8B6914)';
    }
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
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">투자 내역이 없습니다</p>'; document.getElementById('creb-impact-dashboard').style.display = 'none'; return; }
        
        const projCache = {};
        let totalInvested = 0, totalMonthly = 0;
        const catTotals = { energy: 0, genetics: 0, biotech: 0, ai_robotics: 0 };
        const projectIds = new Set();
        let rows = '';
        
        for (const d of docs.docs) {
            const inv = d.data();
            if (!projCache[inv.projectId]) {
                const pDoc = await db.collection('energy_projects').doc(inv.projectId).get();
                const pData = pDoc.exists ? pDoc.data() : { title: '삭제된 프로젝트', returnRate: 0, category: 'energy' };
                if (!pData.title) pData.title = pData.name || '프로젝트';
                projCache[inv.projectId] = pData;
            }
            const proj = projCache[inv.projectId];
            const cat = proj.category || 'energy';
            const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
            const rate = proj.returnRate || 0;
            const monthlyReturn = (inv.amount * rate / 100 / 12);
            totalInvested += inv.amount;
            totalMonthly += monthlyReturn;
            catTotals[cat] = (catTotals[cat] || 0) + inv.amount;
            projectIds.add(inv.projectId);
            const dateStr = inv.timestamp?.toDate ? inv.timestamp.toDate().toLocaleDateString('ko-KR') : '-';
            
            rows += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem; border-left:3px solid ${catInfo.color};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${catInfo.icon} ${proj.title}</strong>
                        <div style="font-size:0.75rem; color:var(--accent);">${dateStr} · ${inv.token || 'CREB'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:${catInfo.color};">${inv.amount} ${inv.token || 'CREB'}</div>
                        ${rate > 0 ? `<div style="font-size:0.75rem; color:#4CAF50;">월 ${monthlyReturn.toFixed(2)} CREB (연 ${rate}%)</div>` : `<div style="font-size:0.75rem; color:#4CAF50;">💝 기부</div>`}
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
        
        // 상단 투자 현황
        const ei = document.getElementById('energy-invested');
        if (ei) ei.textContent = `${totalInvested.toFixed(1)} CREB`;
        const em = document.getElementById('energy-monthly');
        if (em) em.textContent = `${totalMonthly.toFixed(2)} CREB`;

        // 임팩트 대시보드
        const dashboard = document.getElementById('creb-impact-dashboard');
        if (dashboard) {
            dashboard.style.display = 'block';
            document.getElementById('impact-total-creb').textContent = `${totalInvested.toFixed(0)} CREB`;
            document.getElementById('impact-project-count').textContent = `${projectIds.size}개`;
            
            // 카테고리 바
            const barsEl = document.getElementById('impact-category-bars');
            let barsHtml = '';
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount <= 0) continue;
                const ci = CREB_CATEGORIES[cat];
                const pct = Math.round((amount / totalInvested) * 100);
                barsHtml += `<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                    <span style="font-size:0.8rem; min-width:80px;">${ci.icon} ${ci.label}</span>
                    <div style="flex:1; background:#e0e0e0; height:8px; border-radius:4px;"><div style="background:${ci.color}; height:100%; border-radius:4px; width:${pct}%;"></div></div>
                    <span style="font-size:0.75rem; color:var(--accent); min-width:35px;">${pct}%</span>
                </div>`;
            }
            barsEl.innerHTML = barsHtml;
            
            // 임팩트 메시지
            const msgEl = document.getElementById('impact-messages');
            let msgs = '';
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount <= 0) continue;
                const ci = CREB_CATEGORIES[cat];
                const imp = CREB_IMPACT[cat];
                const val = (amount * imp.factor).toFixed(1);
                msgs += `<div style="margin:0.2rem 0;">${ci.icon} ${val} ${imp.unit}</div>`;
            }
            msgEl.innerHTML = msgs;
            
            // SDG 배지
            const sdgEl = document.getElementById('impact-sdg-badges');
            const sdgs = new Set();
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount > 0) sdgs.add(CREB_CATEGORIES[cat].sdg);
            }
            sdgEl.innerHTML = [...sdgs].map(s => `<span style="display:inline-block; padding:0.2rem 0.6rem; border-radius:12px; background:#E3F2FD; color:#1565C0; font-size:0.75rem; font-weight:600;">🏅 ${s}</span>`).join('');
        }
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
                donorList += `<div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid #F7F3ED; font-size:0.82rem;">
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
            ${camp.imageData ? `<img src="${camp.imageData}" loading="lazy" style="width:100%; border-radius:8px; max-height:250px; object-fit:cover; margin-bottom:1rem;">` : ''}
            <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${camp.creatorNickname || camp.creatorEmail} · ${camp.category || ''}</p>
            ${camp.description ? `<p style="margin-bottom:1rem; font-size:0.9rem;">${camp.description}</p>` : ''}
            <div style="background:#F7F3ED; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div style="background:#e0e0e0; height:10px; border-radius:5px; margin-bottom:0.5rem;">
                    <div style="background:#4CAF50; height:100%; border-radius:5px; width:${pct}%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                    <span style="font-weight:700;">${camp.raised} / ${camp.goal} ${camp.token}</span>
                    <span>${pct}% · ${camp.backerCount || camp.backers || 0}명</span>
                </div>
                <div style="font-size:0.8rem; color:#2e7d32; margin-top:0.5rem;">💰 수수료 ${fee}% · 창작자 수령 ${(100 - fee).toFixed(1)}%</div>
            </div>
            <button onclick="donateCampaign('${id}')" style="background:#4CAF50; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:0.8rem;">💝 기부하기</button>
            ${isCreator && camp.status === 'active' ? `<button onclick="closeCampaign('${id}')" style="background:#e53935; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:1rem;">🔒 캠페인 종료 및 수령</button>` : ''}
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
            c.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--accent);"><div style="font-size:3rem; margin-bottom:1rem;"><i data-lucide="shopping-cart"></i></div><p>장바구니가 비어있습니다</p><button onclick="showPage(\'mall\')" style="margin-top:1rem; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.7rem 1.5rem; border-radius:8px; cursor:pointer;">쇼핑하러 가기</button></div>';
            if(summary) summary.style.display='none';
            return;
        }
        let total = 0;
        c.innerHTML = '';
        snap.forEach(d => {
            const item = d.data();
            const subtotal = item.price * (item.qty || 1);
            total += subtotal;
            c.innerHTML += `<div style="background:#FFF8F0; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#F7F3ED; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#E8E0D8;">🛒</span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#3D2B1F; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                        <button onclick="updateCartQty('${d.id}', -1)" style="width:26px; height:26px; border:1px solid #E8E0D8; border-radius:4px; background:#FFF8F0; cursor:pointer; font-size:0.9rem;">−</button>
                        <span style="font-weight:600; min-width:20px; text-align:center;">${item.qty || 1}</span>
                        <button onclick="updateCartQty('${d.id}', 1)" style="width:26px; height:26px; border:1px solid #E8E0D8; border-radius:4px; background:#FFF8F0; cursor:pointer; font-size:0.9rem;">+</button>
                        <button onclick="removeFromCart('${d.id}')" style="background:none; border:none; cursor:pointer; color:#cc0000; font-size:0.85rem; margin-left:auto;">🗑️</button>
                    </div>
                </div>
            </div>`;
        });
        if (summary) { summary.style.display = 'block'; }
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = total + ' CRGC';
        if(window.lucide) lucide.createIcons();
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

async function checkoutCart(btn) {
    if (!currentUser) return;
    // 이중 클릭 방지
    if (btn) { btn.disabled = true; setTimeout(() => { if(btn) btn.disabled = false; }, 3000); }
    // 동시 주문 방지
    if (_orderInProgress) { showToast(t('mall.order_in_progress','주문 처리 중입니다. 잠시 기다려주세요.'), 'warning'); return; }
    _orderInProgress = true;
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('cart').get();
        if (snap.empty) { showToast('장바구니가 비어있습니다', 'warning'); return; }
        let total = 0;
        const items = [];
        snap.forEach(d => { const it = d.data(); total += it.price * (it.qty || 1); items.push({ ...it, cartDocId: d.id }); });
        
        if (total <= 0 || !Number.isFinite(total)) { showToast('비정상 금액', 'error'); return; }
        if (total > MAX_ORDER_AMOUNT) { showToast(t('mall.max_order_exceeded',`1회 최대 주문 금액은 ${MAX_ORDER_AMOUNT} CRGC입니다`), 'warning'); return; }
        if (!await showConfirmModal('일괄 결제', `장바구니 ${items.length}개 상품\n총 ${total} CRGC 결제하시겠습니까?`)) return;
        
        const shippingInfo = await showShippingModal();
        if (!shippingInfo) return;
        
        const tk = 'crgc';
        
        // 트랜잭션으로 잔액 확인 + 차감
        await db.runTransaction(async (tx) => {
            const buyerDoc = await tx.get(db.collection('users').doc(currentUser.uid));
            const buyerBal = buyerDoc.data()?.offchainBalances || {};
            if ((buyerBal[tk] || 0) < total) throw new Error('CRGC 잔액이 부족합니다');
            tx.update(db.collection('users').doc(currentUser.uid), {
                [`offchainBalances.${tk}`]: (buyerBal[tk] || 0) - total
            });
        });

        // Process each item (seller payment + order creation)
        for (const item of items) {
            const pDoc = await db.collection('products').doc(item.productId).get();
            if (!pDoc.exists) continue;
            const p = pDoc.data();
            const qty = item.qty || 1;
            const subtotal = item.price * qty;
            
            // 재고 재확인 + 판매자 지급
            await db.runTransaction(async (tx) => {
                const prodDoc = await tx.get(db.collection('products').doc(item.productId));
                const pNow = prodDoc.data();
                if ((pNow.stock - (pNow.sold||0)) < qty) throw new Error(`"${item.title}" 재고 부족`);
                tx.update(db.collection('products').doc(item.productId), { sold: (pNow.sold||0) + qty });
                
                const sellerDoc = await tx.get(db.collection('users').doc(p.sellerId));
                const sellerBal = sellerDoc.data()?.offchainBalances || {};
                tx.update(db.collection('users').doc(p.sellerId), {
                    [`offchainBalances.${tk}`]: (sellerBal[tk] || 0) + subtotal
                });
            });
            
            await db.collection('orders').add({
                productId: item.productId, productTitle: item.title, productImage: getProductThumb(p),
                buyerId: currentUser.uid, buyerEmail: currentUser.email,
                sellerId: p.sellerId, sellerEmail: p.sellerEmail || '',
                amount: subtotal, qty, token: 'CRGC', status: 'paid', shippingInfo,
                statusHistory:[{status:'paid', at:new Date().toISOString()}], createdAt: new Date()
            });
            
            // 판매자 알림
            if (typeof createNotification === 'function') {
                await createNotification(p.sellerId, 'order_status', { message: `🛒 새 주문! "${item.title}" (${subtotal} CRGC)`, link: '#page=my-shop' });
            }
            
            if (typeof autoGivingPoolContribution === 'function') await autoGivingPoolContribution(subtotal);
            if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, subtotal, 'CRGC');
            await db.collection('users').doc(currentUser.uid).collection('cart').doc(item.cartDocId).delete();
        }
        showToast(`🎉 ${items.length}개 상품 결제 완료!`, 'success');
        loadCart(); updateCartBadge(); loadUserWallet();
    } catch(e) { showToast('결제 실패: ' + e.message, 'error'); } finally { _orderInProgress = false; }
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
            c.innerHTML += `<div style="background:#FFF8F0; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06); cursor:pointer;" onclick="viewProduct('${item.productId}')">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#F7F3ED; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#E8E0D8;">🛒</span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#3D2B1F; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <button onclick="event.stopPropagation(); addToCart('${item.productId}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;">🛒 담기</button>
                    <button onclick="event.stopPropagation(); toggleWishlist('${item.productId}'); setTimeout(loadWishlist, 500);" style="background:none; border:1px solid #e91e63; color:#e91e63; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;">🗑️</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== IMAGE GALLERY SCROLL ==========

function scrollPdGallery(dir) {
    const g = document.getElementById('pd-gallery');
    if (!g) return;
    const w = g.offsetWidth;
    g.scrollBy({ left: dir * w, behavior: 'smooth' });
    setTimeout(() => {
        const idx = Math.round(g.scrollLeft / w);
        document.querySelectorAll('.pd-dot').forEach(d => d.style.background = parseInt(d.dataset.idx) === idx ? '#3D2B1F' : '#E8E0D8');
    }, 350);
}

// ========== STORE PAGE ==========

function viewStore(sellerId) {
    history.replaceState(null, '', `#page=store&sellerId=${sellerId}`);
    showPage('store');
    renderStorePage(sellerId);
}

async function renderStorePage(sellerId) {
    const c = document.getElementById('store-content');
    if (!c) return;
    c.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">로딩 중...</p>';
    try {
        const sellerDoc = await db.collection('users').doc(sellerId).get();
        const seller = sellerDoc.exists ? sellerDoc.data() : {};
        const storeName = seller.storeName || seller.nickname || seller.email?.split('@')[0] || '판매자';
        const storeDesc = seller.storeDesc || '';
        const storeImage = seller.storeImage || seller.profileImage || '';
        const isOwner = currentUser?.uid === sellerId;

        // Load seller products
        const prodDocs = await db.collection('products').where('sellerId', '==', sellerId).where('status', '==', 'active').orderBy('createdAt', 'desc').limit(50).get();
        let totalSold = 0;
        let productsHtml = '';
        prodDocs.forEach(d => {
            const p = d.data();
            totalSold += (p.sold || 0);
            const thumb = getProductThumb(p);
            productsHtml += `<div onclick="viewProduct('${d.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:130px; overflow:hidden; background:#F7F3ED;">${thumb ? `<img src="${thumb}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#E8E0D8;">🛒</div>`}</div>
                <div style="padding:0.5rem;">
                    <div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</div>
                    <div style="font-weight:700; color:#3D2B1F; font-size:0.85rem;">${p.price} CRGC</div>
                </div>
            </div>`;
        });

        // Seller avg rating from reviews
        const orderDocs = await db.collection('orders').where('sellerId', '==', sellerId).get();
        let orderCount = orderDocs.size;

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← 목록으로</button>
            <div style="background:#FFF8F0; padding:1.5rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); margin-bottom:1rem;">
                <div style="display:flex; gap:1rem; align-items:center;">
                    <div style="width:70px; height:70px; border-radius:50%; overflow:hidden; background:#F7F3ED; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                        ${storeImage ? `<img src="${storeImage}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:2rem;">🏪</span>`}
                    </div>
                    <div style="flex:1;">
                        <h2 style="margin:0; font-size:1.3rem;">${storeName}</h2>
                        ${storeDesc ? `<p style="color:var(--accent); font-size:0.85rem; margin-top:0.3rem;">${storeDesc}</p>` : ''}
                        <div style="display:flex; gap:1rem; margin-top:0.5rem; font-size:0.8rem; color:var(--accent);">
                            <span>📦 상품 ${prodDocs.size}개</span>
                            <span>🛒 총 판매 ${totalSold}건</span>
                            <span>📋 주문 ${orderCount}건</span>
                        </div>
                    </div>
                </div>
                ${isOwner ? `<button onclick="showStoreSettingsModal()" style="margin-top:0.8rem; background:#ff9800; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:600;">⚙️ 스토어 설정</button>` : (currentUser ? `<button onclick="reportSeller('${sellerId}')" style="margin-top:0.8rem; background:none; color:#cc0000; border:1px solid #cc0000; padding:0.4rem 0.8rem; border-radius:8px; cursor:pointer; font-size:0.8rem;">🚨 ${t('mall.report_seller','판매자 신고')}</button>` : '')}
            </div>
            <h3 style="margin-bottom:0.8rem;">📦 상품 목록</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:0.8rem;">
                ${productsHtml || '<p style="color:var(--accent); grid-column:1/-1; text-align:center;">등록된 상품이 없습니다</p>'}
            </div>`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

async function showStoreSettingsModal() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const data = userDoc.data() || {};

    const overlay = document.createElement('div');
    overlay.id = 'store-settings-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:450px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
        <h3 style="margin-bottom:1rem;">⚙️ 스토어 설정</h3>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">스토어명</label>
                <input type="text" id="store-set-name" value="${data.storeName || data.nickname || ''}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">스토어 소개</label>
                <textarea id="store-set-desc" rows="3" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; resize:vertical; box-sizing:border-box;">${data.storeDesc || ''}</textarea>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">스토어 이미지</label>
                <input type="file" id="store-set-image" accept="image/*" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
            </div>
            <button onclick="saveStoreSettings()" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">💾 저장</button>
            <button onclick="document.getElementById('store-settings-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer;">닫기</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

async function saveStoreSettings() {
    if (!currentUser) return;
    try {
        const updateData = {
            storeName: document.getElementById('store-set-name').value.trim(),
            storeDesc: document.getElementById('store-set-desc').value.trim()
        };
        const imageFile = document.getElementById('store-set-image').files[0];
        if (imageFile) {
            updateData.storeImage = await fileToBase64Resized(imageFile, 400);
        }
        await db.collection('users').doc(currentUser.uid).update(updateData);
        showToast('⚙️ 스토어 설정 저장 완료!', 'success');
        document.getElementById('store-settings-modal')?.remove();
        renderStorePage(currentUser.uid);
    } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

// ========== MY SHOP DASHBOARD ==========

async function loadMyShopDashboard() {
    const c = document.getElementById('my-shop-content');
    if (!c || !currentUser) { if(c) c.innerHTML = '<p style="text-align:center; color:var(--accent);">로그인이 필요합니다</p>'; return; }
    c.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩 중...</p>';
    try {
        // Load my products
        const prodDocs = await db.collection('products').where('sellerId', '==', currentUser.uid).orderBy('createdAt', 'desc').limit(50).get();
        // Load seller orders
        const orderDocs = await db.collection('orders').where('sellerId', '==', currentUser.uid).orderBy('createdAt', 'desc').limit(50).get();

        let totalRevenue = 0, monthlyRevenue = 0, totalOrders = 0;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        orderDocs.forEach(d => {
            const o = d.data();
            totalRevenue += o.amount || 0;
            totalOrders++;
            const oDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
            if (oDate >= monthStart) monthlyRevenue += o.amount || 0;
        });

        // Products list
        let productsHtml = '';
        prodDocs.forEach(d => {
            const p = d.data();
            const remaining = p.stock - (p.sold || 0);
            const statusBadge = p.status === 'active' ? '<span style="color:#4CAF50; font-size:0.7rem;">● 판매중</span>' : '<span style="color:#6B5744; font-size:0.7rem;">● 비활성</span>';
            productsHtml += `<div style="padding:0.6rem; background:var(--bg); border-radius:8px; margin-bottom:0.4rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${p.title}</strong> — ${p.price} CRGC · 판매 ${p.sold||0}/${p.stock} · 재고 ${remaining} ${statusBadge}</div>
                    <div style="display:flex; gap:0.3rem;">
                        <button onclick="editProductModal('${d.id}')" style="background:#2196f3; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">✏️ 수정</button>
                        <button onclick="toggleProduct('${d.id}','${p.status}')" style="background:${p.status==='active'?'#6B5744':'#4CAF50'}; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${p.status==='active'?'⏸':'▶'}</button>
                        <button onclick="deleteProduct('${d.id}')" style="background:#cc0000; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">🗑️</button>
                    </div>
                </div>
            </div>`;
        });

        // Orders list
        let ordersHtml = '';
        orderDocs.forEach(d => {
            const o = d.data();
            const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
            const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';
            const nextActions = [];
            if (o.status === 'paid') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','shipping')" style="background:#2196f3; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;">🚚 배송</button>`);
            if (o.status === 'shipping') nextActions.push(`<button onclick="updateOrderStatus('${d.id}','delivered')" style="background:#4CAF50; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;">✅ 완료</button>`);
            const shipInfo = o.shippingInfo ? `<div style="font-size:0.65rem; color:#555;">📦 ${o.shippingInfo.name} · ${o.shippingInfo.phone} · ${o.shippingInfo.address}</div>` : '';
            ordersHtml += `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem; font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.2rem;">
                    <div><strong>${o.productTitle}</strong> — ${o.amount} ${o.token}<br><span style="font-size:0.7rem; color:var(--accent);">${o.buyerEmail}</span>${shipInfo}</div>
                    <div style="display:flex; align-items:center; gap:0.2rem;">
                        <span style="color:${statusColor}; font-weight:600; font-size:0.75rem;">${statusLabel}</span>
                        ${nextActions.join('')}
                    </div>
                </div>
            </div>`;
        });

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← 쇼핑몰</button>
            <h2 style="margin-bottom:1rem;">🏪 내 상점</h2>
            
            <!-- 매출 통계 -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.8rem; margin-bottom:1.5rem;">
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">총 매출</div>
                    <div style="font-size:1.3rem; font-weight:700;">${totalRevenue} CRGC</div>
                </div>
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">이번 달</div>
                    <div style="font-size:1.3rem; font-weight:700;">${monthlyRevenue} CRGC</div>
                </div>
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">총 주문</div>
                    <div style="font-size:1.3rem; font-weight:700;">${totalOrders}건</div>
                </div>
            </div>
            
            <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                <button onclick="viewStore('${currentUser.uid}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem;">🏪 내 스토어 보기</button>
                <button onclick="showStoreSettingsModal()" style="background:#ff9800; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem;">⚙️ 스토어 설정</button>
            </div>
            
            <!-- 내 상품 -->
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px; margin-bottom:1rem;">
                <h3 style="margin-bottom:0.8rem;">📦 내 상품 (${prodDocs.size})</h3>
                ${productsHtml || '<p style="color:var(--accent); font-size:0.85rem;">등록된 상품이 없습니다</p>'}
            </div>
            
            <!-- 받은 주문 -->
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px;">
                <h3 style="margin-bottom:0.8rem;">📬 받은 주문 (${totalOrders})</h3>
                ${ordersHtml || '<p style="color:var(--accent); font-size:0.85rem;">받은 주문이 없습니다</p>'}
            </div>`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

// ========== PRODUCT EDIT MODAL (Enhanced) ==========

async function editProductModal(id) {
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) return;
    const p = doc.data();

    const overlay = document.createElement('div');
    overlay.id = 'edit-product-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const images = (p.images && p.images.length > 0) ? p.images : (p.imageData ? [p.imageData] : []);
    const imgPreview = images.map((img, i) => `<img src="${img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:${i===0?'2px solid #3D2B1F':'1px solid #E8E0D8'};">`).join('');

    overlay.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:450px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
        <h3 style="margin-bottom:1rem;">✏️ 상품 수정</h3>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">상품명</label>
                <input type="text" id="ep-title" value="${p.title}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">설명</label>
                <textarea id="ep-desc" rows="3" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; resize:vertical; box-sizing:border-box;">${p.description || ''}</textarea>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                <div>
                    <label style="font-size:0.8rem; color:var(--accent);">가격 (CRGC)</label>
                    <input type="number" id="ep-price" value="${p.price}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--accent);">재고</label>
                    <input type="number" id="ep-stock" value="${p.stock}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
                </div>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">현재 이미지</label>
                <div style="display:flex; gap:0.3rem; margin-top:0.3rem;">${imgPreview || '<span style="color:var(--accent); font-size:0.85rem;">없음</span>'}</div>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">새 이미지 (최대 5장, 선택 시 교체)</label>
                <input type="file" id="ep-images" accept="image/*" multiple style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
            </div>
            <button onclick="saveEditProduct('${id}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">💾 저장</button>
            <button onclick="document.getElementById('edit-product-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer;">닫기</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

async function saveEditProduct(id) {
    try {
        const parsedPrice = parseFloat(document.getElementById('ep-price').value);
        const parsedStock = parseInt(document.getElementById('ep-stock').value);
        if (!parsedPrice || parsedPrice <= 0 || !Number.isFinite(parsedPrice)) { showToast('가격은 0보다 커야 합니다', 'warning'); return; }
        if (parsedStock < 0 || !Number.isFinite(parsedStock)) { showToast('재고는 0 이상이어야 합니다', 'warning'); return; }
        const updateData = {
            title: document.getElementById('ep-title').value.trim(),
            price: parsedPrice,
            stock: parsedStock,
            description: document.getElementById('ep-desc').value.trim()
        };
        const imageFiles = document.getElementById('ep-images').files;
        if (imageFiles && imageFiles.length > 0) {
            const images = [];
            for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
                images.push(await fileToBase64Resized(imageFiles[i], 400));
            }
            updateData.images = images;
            updateData.imageData = images[0];
        }
        await db.collection('products').doc(id).update(updateData);
        // 가격 변동 시 위시리스트 사용자에게 알림
        if (typeof createNotification === 'function') {
            const oldDoc = await db.collection('products').doc(id).get();
            // Already updated, check if price changed by looking at updateData vs title (price already written)
            // We notify all wishlist holders
            try {
                const wishSnap = await db.collectionGroup('wishlist').where('productId', '==', id).get();
                wishSnap.forEach(async (wDoc) => {
                    const userId = wDoc.ref.parent.parent.id;
                    if (userId !== currentUser.uid) {
                        await createNotification(userId, 'order_status', { message: `💰 찜한 상품 "${updateData.title}" 가격이 ${updateData.price} CRGC로 변경되었습니다`, link: `#page=product-detail&id=${id}` });
                    }
                });
            } catch(e) { /* collectionGroup may need index */ }
        }
        showToast('✏️ 상품 수정 완료', 'success');
        document.getElementById('edit-product-modal')?.remove();
        if (typeof loadMyShopDashboard === 'function') loadMyShopDashboard();
        loadMallProducts();
    } catch(e) { showToast('수정 실패: ' + e.message, 'error'); }
}

// ========== SHIPPING INFO MODAL ==========

async function showShippingModal() {
    // Try to load last used address
    let lastAddr = {};
    if (currentUser) {
        try {
            const addrSnap = await db.collection('users').doc(currentUser.uid).collection('addresses').orderBy('usedAt', 'desc').limit(1).get();
            if (!addrSnap.empty) lastAddr = addrSnap.docs[0].data();
        } catch(e) { console.warn("[catch]", e); }
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.innerHTML = `
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;">
                <h3 style="margin-bottom:1rem;">📦 배송지 정보</h3>
                <div style="display:grid; gap:0.7rem;">
                    <input type="text" id="ship-name" placeholder="수령인 이름" value="${lastAddr.name||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="tel" id="ship-phone" placeholder="전화번호" value="${lastAddr.phone||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="text" id="ship-address" placeholder="배송 주소" value="${lastAddr.address||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="text" id="ship-memo" placeholder="배송 메모 (선택)" value="${lastAddr.memo||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <label style="font-size:0.8rem; display:flex; align-items:center; gap:0.3rem; color:var(--accent);">
                        <input type="checkbox" id="ship-save" checked> 이 주소 저장하기
                    </label>
                </div>
                <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                    <button id="ship-cancel" style="flex:1; padding:0.7rem; border:1px solid #E8E0D8; border-radius:8px; cursor:pointer; background:#FFF8F0;">취소</button>
                    <button id="ship-ok" style="flex:1; padding:0.7rem; border:none; border-radius:8px; cursor:pointer; background:#3D2B1F; color:#FFF8F0; font-weight:700;">확인</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#ship-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
        overlay.querySelector('#ship-ok').onclick = async () => {
            const name = document.getElementById('ship-name').value.trim();
            const phone = document.getElementById('ship-phone').value.trim();
            const address = document.getElementById('ship-address').value.trim();
            const memo = document.getElementById('ship-memo').value.trim();
            if (!name || !phone || !address) { showToast('이름, 전화번호, 주소를 입력해주세요', 'warning'); return; }
            const info = { name, phone, address, memo };
            // Save address if checked
            if (document.getElementById('ship-save').checked && currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid).collection('addresses').add({ ...info, usedAt: new Date() });
                } catch(e) { console.warn("[catch]", e); }
            }
            document.body.removeChild(overlay);
            resolve(info);
        };
        overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };
    });
}

// ========== PRODUCT IMAGE PREVIEW (registration modal) ==========

document.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('product-image');
    if (imgInput) {
        imgInput.addEventListener('change', function() {
            const preview = document.getElementById('product-image-preview');
            if (!preview) return;
            preview.innerHTML = '';
            const files = this.files;
            if (files.length > 5) { showToast('최대 5장까지 선택 가능합니다', 'warning'); this.value = ''; return; }
            for (let i = 0; i < Math.min(files.length, 5); i++) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML += `<div style="width:50px; height:50px; border-radius:6px; overflow:hidden; border:${i===0?'2px solid #3D2B1F':'1px solid #E8E0D8'};">
                        <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
                    </div>`;
                };
                reader.readAsDataURL(files[i]);
            }
        });
    }
});

// ========== HELPFUL REVIEW ==========

async function helpfulReview(reviewId) {
    if (!currentUser) { showToast('로그인이 필요합니다','warning'); return; }
    try {
        await db.collection('product_reviews').doc(reviewId).update({
            helpful: firebase.firestore.FieldValue.increment(1)
        });
        showToast('👍 감사합니다!','success');
    } catch(e) { showToast('실패: '+e.message,'error'); }
}

// ========== BUYER ORDERS PAGE ==========

async function loadBuyerOrders() {
    const c = document.getElementById('buyer-orders-content');
    if (!c || !currentUser) return;
    c.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">로딩 중...</p>';
    try {
        const snap = await db.collection('orders').where('buyerId','==',currentUser.uid).orderBy('createdAt','desc').limit(30).get();
        if (snap.empty) {
            c.innerHTML = `<button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← 쇼핑몰</button>
                <div style="text-align:center;padding:3rem;color:var(--accent);"><div style="font-size:3rem;margin-bottom:1rem;">📋</div><p>주문 내역이 없습니다</p></div>`;
            return;
        }
        let listHtml = '';
        snap.forEach(d => {
            const o = d.data();
            const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
            const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';
            const thumb = o.productImage || '';
            const dateStr = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            listHtml += `<div onclick="showOrderDetail('${d.id}')" style="background:#FFF8F0;padding:0.8rem;border-radius:10px;margin-bottom:0.6rem;display:flex;gap:0.8rem;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer;">
                <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#F7F3ED;display:flex;align-items:center;justify-content:center;">
                    ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:1.5rem;color:#E8E0D8;">🛒</span>'}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.productTitle}</div>
                    <div style="font-size:0.75rem;color:var(--accent);">${dateStr} · ${o.qty||1}개</div>
                    <div style="font-weight:700;color:#3D2B1F;font-size:0.85rem;">${o.amount} CRGC</div>
                </div>
                <span style="background:${statusColor}15;color:${statusColor};font-size:0.75rem;font-weight:700;padding:0.3rem 0.6rem;border-radius:12px;white-space:nowrap;">${statusLabel}</span>
            </div>`;
        });
        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← 쇼핑몰</button>
            <h2 style="margin-bottom:1rem;">📋 내 주문</h2>
            ${listHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function showOrderDetail(orderId) {
    try {
        const doc = await db.collection('orders').doc(orderId).get();
        if (!doc.exists) return;
        const o = doc.data();
        const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
        const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';

        // Timeline
        const steps = ['paid','shipping','delivered'];
        const stepLabels = {paid:'💰 결제완료', shipping:'🚚 배송중', delivered:'✅ 배송완료'};
        const history = o.statusHistory || [{status:'paid', at: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : new Date().toISOString()}];
        const historyMap = {};
        history.forEach(h => { historyMap[h.status] = h.at; });
        const currentIdx = steps.indexOf(o.status);

        let timelineHtml = '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin:1.5rem 0;position:relative;">';
        // Connector line
        timelineHtml += `<div style="position:absolute;top:14px;left:16%;right:16%;height:3px;background:#e0e0e0;z-index:0;">
            <div style="width:${currentIdx >= 2 ? 100 : currentIdx === 1 ? 50 : 0}%;height:100%;background:#4CAF50;transition:width 0.3s;"></div>
        </div>`;
        steps.forEach((step, i) => {
            const done = i <= currentIdx;
            const ts = historyMap[step];
            const dateStr = ts ? new Date(ts).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            timelineHtml += `<div style="text-align:center;flex:1;z-index:1;">
                <div style="width:28px;height:28px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:0.8rem;
                    background:${done ? '#4CAF50' : '#e0e0e0'};color:${done ? 'white' : '#6B5744'};">${done ? '✓' : i+1}</div>
                <div style="font-size:0.7rem;font-weight:600;margin-top:0.3rem;color:${done ? '#333' : '#6B5744'};">${stepLabels[step]}</div>
                <div style="font-size:0.6rem;color:var(--accent);">${dateStr}</div>
            </div>`;
        });
        timelineHtml += '</div>';

        // Tracking number
        const trackingHtml = o.trackingNumber ? `<div style="background:#e3f2fd;padding:0.6rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;">📦 추적번호: <strong>${o.trackingNumber}</strong></div>` : '';

        // Return status check
        let returnHtml = '';
        const returnSnap = await db.collection('returns').where('orderId','==',orderId).limit(1).get();
        if (!returnSnap.empty) {
            const ret = returnSnap.docs[0].data();
            const retStatus = {requested:'⏳ 반품 요청중',approved:'✅ 반품 승인',rejected:'❌ 반품 거절',completed:'🔄 환불 완료'};
            const retColor = {requested:'#ff9800',approved:'#4CAF50',rejected:'#f44336',completed:'#2196f3'};
            returnHtml = `<div style="background:${retColor[ret.status]}15;border-left:4px solid ${retColor[ret.status]};padding:0.8rem;border-radius:0 8px 8px 0;margin-bottom:1rem;">
                <div style="font-weight:700;color:${retColor[ret.status]};">${retStatus[ret.status] || ret.status}</div>
                <div style="font-size:0.8rem;color:#555;margin-top:0.2rem;">사유: ${ret.reasonCategory} — ${ret.reasonDetail||''}</div>
            </div>`;
        }

        // Return button (delivered within 7 days, no existing return)
        let returnBtnHtml = '';
        if (o.status === 'delivered' && returnSnap.empty) {
            const deliveredAt = o.deliveredAt?.toDate ? o.deliveredAt.toDate() : (historyMap.delivered ? new Date(historyMap.delivered) : null);
            if (deliveredAt && (Date.now() - deliveredAt.getTime()) < 7 * 86400000) {
                returnBtnHtml = `<button onclick="requestReturn('${orderId}')" style="background:#f44336;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:600;width:100%;margin-bottom:0.5rem;">🔄 반품/환불 요청</button>`;
            }
        }

        // Review button
        let reviewBtnHtml = '';
        if (o.status === 'delivered') {
            const existingReview = await db.collection('product_reviews').where('productId','==',o.productId).where('buyerId','==',currentUser.uid).limit(1).get();
            if (existingReview.empty) {
                reviewBtnHtml = `<button onclick="writeReview('${o.productId}')" style="background:#ff9800;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:600;width:100%;margin-bottom:0.5rem;">⭐ 리뷰 작성</button>`;
            }
        }

        const overlay = document.createElement('div');
        overlay.id = 'order-detail-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div style="background:#FFF8F0;border-radius:12px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;padding:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;">주문 상세</h3>
                <button onclick="document.getElementById('order-detail-modal').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">✕</button>
            </div>
            <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #E8E0D8;">
                <div style="width:70px;height:70px;border-radius:8px;overflow:hidden;background:#F7F3ED;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                    ${o.productImage ? `<img src="${o.productImage}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:2rem;color:#E8E0D8;">🛒</span>'}
                </div>
                <div>
                    <div style="font-weight:700;font-size:1rem;">${o.productTitle}</div>
                    <div style="font-size:0.85rem;color:var(--accent);">${o.qty||1}개 · ${o.amount} CRGC</div>
                    <span style="background:${statusColor}15;color:${statusColor};font-size:0.75rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:8px;">${statusLabel}</span>
                </div>
            </div>
            ${timelineHtml}
            ${trackingHtml}
            ${returnHtml}
            ${o.shippingInfo ? `<div style="background:var(--bg);padding:0.8rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;">
                <div style="font-weight:600;margin-bottom:0.3rem;">📦 배송지</div>
                <div>${o.shippingInfo.name} · ${o.shippingInfo.phone}</div>
                <div>${o.shippingInfo.address}</div>
                ${o.shippingInfo.memo ? `<div style="color:var(--accent);">메모: ${o.shippingInfo.memo}</div>` : ''}
            </div>` : ''}
            ${returnBtnHtml}
            ${reviewBtnHtml}
            <button onclick="viewProduct('${o.productId}'); document.getElementById('order-detail-modal').remove();" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;width:100%;font-weight:600;">🛒 상품 보기</button>
        </div>`;
        document.body.appendChild(overlay);
    } catch(e) { showToast('주문 상세 로드 실패: '+e.message, 'error'); }
}

// ========== RETURN / REFUND SYSTEM ==========

async function requestReturn(orderId) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;">
            <h3 style="margin-bottom:1rem;">🔄 반품/환불 요청</h3>
            <div style="display:grid;gap:0.8rem;">
                <div>
                    <label style="font-size:0.8rem;color:var(--accent);">반품 사유</label>
                    <select id="return-reason" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                        ${RETURN_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--accent);">상세 사유</label>
                    <textarea id="return-detail" rows="3" placeholder="상세 사유를 입력하세요..." style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style]').parentElement.parentElement.remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
                    <button id="return-submit" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#f44336;color:#FFF8F0;font-weight:700;">요청</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#return-submit').onclick = async () => {
            const reasonCategory = overlay.querySelector('#return-reason').value;
            const reasonDetail = overlay.querySelector('#return-detail').value.trim();
            if (!reasonDetail) { showToast('상세 사유를 입력하세요','warning'); return; }
            try {
                const orderDoc = await db.collection('orders').doc(orderId).get();
                const order = orderDoc.data();
                await db.collection('returns').add({
                    orderId, productId: order.productId, productTitle: order.productTitle,
                    buyerId: currentUser.uid, buyerEmail: currentUser.email,
                    sellerId: order.sellerId, sellerEmail: order.sellerEmail,
                    amount: order.amount, token: order.token || 'CRGC',
                    reasonCategory, reasonDetail, status: 'requested', createdAt: new Date()
                });
                // 판매자 알림
                if (typeof createNotification === 'function') {
                    await createNotification(order.sellerId, 'order_status', { message: `🔄 "${order.productTitle}" 반품 요청이 있습니다`, link: '#page=my-shop' });
                }
                showToast('🔄 반품 요청이 접수되었습니다','success');
                overlay.remove();
                document.getElementById('order-detail-modal')?.remove();
                loadBuyerOrders();
                resolve();
            } catch(e) { showToast('실패: '+e.message,'error'); }
        };
    });
}

// Seller: handle returns in loadSellerOrders and loadMyShopDashboard
async function loadSellerReturns() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('returns').where('sellerId','==',currentUser.uid).where('status','==','requested').orderBy('createdAt','desc').limit(20).get();
        if (snap.empty) return '';
        let html = '<div style="margin-top:1rem;"><h4 style="color:#f44336;margin-bottom:0.5rem;">🔄 반품 요청 ('+snap.size+')</h4>';
        snap.forEach(d => {
            const r = d.data();
            const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            html += `<div style="background:#fff3e0;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #ff9800;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${r.productTitle}</strong> — ${r.amount} ${r.token}</div>
                    <span style="font-size:0.75rem;color:var(--accent);">${dateStr}</span>
                </div>
                <div style="font-size:0.8rem;color:#555;margin:0.3rem 0;">${r.buyerEmail} · ${r.reasonCategory}: ${r.reasonDetail||''}</div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="approveReturn('${d.id}')" style="flex:1;background:#4CAF50;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">✅ 승인 (환불)</button>
                    <button onclick="rejectReturn('${d.id}')" style="flex:1;background:#f44336;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">❌ 거절</button>
                </div>
            </div>`;
        });
        html += '</div>';
        return html;
    } catch(e) { return ''; }
}

async function approveReturn(returnId) {
    if (!await showConfirmModal('반품 승인','반품을 승인하고 환불하시겠습니까?')) return;
    try {
        const retDoc = await db.collection('returns').doc(returnId).get();
        const ret = retDoc.data();
        const tk = (ret.token || 'CRGC').toLowerCase();

        // 원래 주문 금액 검증 후 트랜잭션으로 원자적 환불
        await db.runTransaction(async (tx) => {
            // 주문 원본 확인 — 환불 금액이 원래 주문 금액과 일치하는지 검증
            const orderDoc = await tx.get(db.collection('orders').doc(ret.orderId));
            if (!orderDoc.exists) throw new Error('원본 주문을 찾을 수 없습니다');
            const order = orderDoc.data();
            if (order.amount !== ret.amount) throw new Error(`환불 금액(${ret.amount})이 주문 금액(${order.amount})과 불일치`);
            if (order.status === 'cancelled') throw new Error('이미 취소된 주문입니다');

            if (typeof isOffchainToken === 'function' && isOffchainToken(tk)) {
                const buyerDoc = await tx.get(db.collection('users').doc(ret.buyerId));
                const buyerBal = buyerDoc.data()?.offchainBalances || {};
                tx.update(db.collection('users').doc(ret.buyerId), {
                    [`offchainBalances.${tk}`]: (buyerBal[tk]||0) + ret.amount
                });
                const sellerDoc = await tx.get(db.collection('users').doc(ret.sellerId));
                const sellerBal = sellerDoc.data()?.offchainBalances || {};
                tx.update(db.collection('users').doc(ret.sellerId), {
                    [`offchainBalances.${tk}`]: Math.max(0, (sellerBal[tk]||0) - ret.amount)
                });
            }
            tx.update(db.collection('returns').doc(returnId), { status:'completed', completedAt: new Date() });
            tx.update(db.collection('orders').doc(ret.orderId), { status:'cancelled', cancelledAt: new Date(),
                statusHistory: firebase.firestore.FieldValue.arrayUnion({status:'cancelled', at: new Date().toISOString(), reason:'반품환불'})
            });
        });
        if (typeof createNotification === 'function') {
            await createNotification(ret.buyerId, 'order_status', { message: `✅ "${ret.productTitle}" 반품이 승인되었습니다. 환불 완료!`, link: '#page=buyer-orders' });
        }
        showToast('✅ 반품 승인 및 환불 완료','success');
        loadSellerOrders();
    } catch(e) { showToast('실패: '+e.message,'error'); }
}

async function rejectReturn(returnId) {
    const reason = await showPromptModal('거절 사유','거절 사유를 입력하세요','');
    if (!reason) return;
    try {
        const rDoc = await db.collection('returns').doc(returnId).get();
        const ret = rDoc.data();
        await db.collection('returns').doc(returnId).update({ status:'rejected', rejectReason: reason, rejectedAt: new Date() });
        if (typeof createNotification === 'function') {
            await createNotification(ret.buyerId, 'order_status', { message: `❌ "${ret.productTitle}" 반품이 거부되었습니다. 사유: ${reason}`, link: '#page=buyer-orders' });
        }
        showToast('반품 요청이 거절되었습니다','info');
        loadSellerOrders();
    } catch(e) { showToast('실패: '+e.message,'error'); }
}

// ========== BRAND LANDING PAGE ==========

function filterMallBrandLanding(brand) {
    if (!brand) { showPage('mall'); filterMallBrand(null); return; }
    history.replaceState(null, '', `#page=brand-landing&brand=${brand}`);
    showPage('brand-landing');
    renderBrandLanding(brand);
}

async function renderBrandLanding(brand) {
    const c = document.getElementById('brand-landing-content');
    if (!c) return;
    c.innerHTML = '<p style="text-align:center;color:var(--accent);padding:2rem;">로딩 중...</p>';
    try {
        const brandName = MALL_CATEGORIES[brand] || brand;
        const slogan = BRAND_SLOGANS[brand] || '';
        const bgColor = BRAND_COLORS[brand] || '#F7F3ED';
        const icon = BRAND_ICONS[brand] || '🛒';

        // Fetch all products in this category
        const snap = await db.collection('products').where('status','==','active').where('category','==',brand).orderBy('createdAt','desc').limit(50).get();
        let items = [];
        snap.forEach(d => items.push({id:d.id, ...d.data()}));

        // Popular (top 4 by sold)
        const popular = [...items].sort((a,b) => (b.sold||0)-(a.sold||0)).slice(0,4);
        // New (latest 4)
        const newest = items.slice(0,4);

        const renderCard = (p) => {
            const thumb = getProductThumb(p);
            return `<div onclick="viewProduct('${p.id}')" style="background:#FFF8F0;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);min-width:150px;flex-shrink:0;width:160px;">
                <div style="height:130px;overflow:hidden;background:#F7F3ED;">${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#E8E0D8;">🛒</div>`}</div>
                <div style="padding:0.5rem;">
                    <div style="font-weight:600;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title}</div>
                    <div style="font-weight:700;color:#3D2B1F;font-size:0.85rem;">${p.price} CRGC</div>
                    ${p.avgRating ? `<div>${renderStars(p.avgRating,'0.65rem')}</div>` : ''}
                </div>
            </div>`;
        };

        const horizontalScroll = (items) => items.length > 0
            ? `<div style="display:flex;gap:0.8rem;overflow-x:auto;padding-bottom:0.5rem;scrollbar-width:none;">${items.map(renderCard).join('')}</div>`
            : '<p style="color:var(--accent);font-size:0.85rem;">상품 없음</p>';

        const gridHtml = items.length > 0
            ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.8rem;">${items.map(renderCard).join('')}</div>`
            : '<p style="color:var(--accent);text-align:center;">등록된 상품이 없습니다</p>';

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← 전체 몰</button>
            <!-- Banner -->
            <div style="background:${bgColor};padding:2rem 1.5rem;border-radius:16px;text-align:center;margin-bottom:1.5rem;position:relative;overflow:hidden;">
                <div style="font-size:3rem;margin-bottom:0.5rem;">${icon}</div>
                <h2 style="margin:0;font-size:1.5rem;">${brandName}</h2>
                <p style="color:#555;font-size:0.95rem;margin-top:0.3rem;font-style:italic;">"${slogan}"</p>
                <div style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">${items.length}개 상품</div>
            </div>
            <!-- Popular -->
            ${popular.length > 0 ? `<div style="margin-bottom:1.5rem;">
                <h3 style="margin-bottom:0.8rem;">🔥 인기 상품</h3>
                ${horizontalScroll(popular)}
            </div>` : ''}
            <!-- New -->
            ${newest.length > 0 ? `<div style="margin-bottom:1.5rem;">
                <h3 style="margin-bottom:0.8rem;">🆕 신상품</h3>
                ${horizontalScroll(newest)}
            </div>` : ''}
            <!-- All -->
            <h3 style="margin-bottom:0.8rem;">📦 전체 상품</h3>
            ${gridHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== 신고 시스템 ==========

async function reportProduct(productId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:1rem;">🚨 상품 신고</h3>
            <div style="display:grid;gap:0.8rem;">
                <select id="report-reason" style="padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                    <option value="fake">허위상품</option>
                    <option value="inappropriate">부적절</option>
                    <option value="scam">사기의심</option>
                    <option value="other">기타</option>
                </select>
                <textarea id="report-detail" rows="3" placeholder="상세 내용 (선택)" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
                    <button id="report-submit-btn" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#cc0000;color:#FFF8F0;font-weight:700;">신고</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#report-submit-btn').onclick = async () => {
            try {
                await db.collection('reports').add({
                    targetType: 'product', targetId: productId,
                    reporterId: currentUser.uid, reporterEmail: currentUser.email,
                    reason: overlay.querySelector('#report-reason').value,
                    detail: overlay.querySelector('#report-detail').value.trim(),
                    status: 'pending', createdAt: new Date()
                });
                showToast('🚨 신고가 접수되었습니다', 'success');
                overlay.remove(); resolve();
            } catch(e) { showToast('신고 실패: ' + e.message, 'error'); }
        };
    });
}

// ========== 범용 신고 시스템 (리뷰/판매자) ==========

async function reportReview(reviewId) {
    if (!currentUser) { showToast(t('mall.login_required','로그인이 필요합니다'), 'warning'); return; }
    return _showReportModal('review', reviewId, t('mall.report_review','리뷰 신고'));
}

async function reportSeller(sellerId) {
    if (!currentUser) { showToast(t('mall.login_required','로그인이 필요합니다'), 'warning'); return; }
    return _showReportModal('seller', sellerId, t('mall.report_seller','판매자 신고'));
}

function _showReportModal(targetType, targetId, title) {
    return new Promise((resolve) => {
        const REASONS = { product: {fake:t('mall.report_fake','허위상품'),inappropriate:t('mall.report_inappropriate','부적절'),scam:t('mall.report_scam','사기의심'),other:t('mall.report_other','기타')}, review: {fake:t('mall.report_fake_review','허위 리뷰'),inappropriate:t('mall.report_inappropriate','부적절'),spam:t('mall.report_spam','스팸'),other:t('mall.report_other','기타')}, seller: {fraud:t('mall.report_fraud','사기'),inappropriate:t('mall.report_inappropriate','부적절'),nondelivery:t('mall.report_nondelivery','미배송'),other:t('mall.report_other','기타')} };
        const reasons = REASONS[targetType] || REASONS.product;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:1rem;">🚨 ${title}</h3>
            <div style="display:grid;gap:0.8rem;">
                <select id="report-reason-gen" style="padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                    ${Object.entries(reasons).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
                <textarea id="report-detail-gen" rows="3" placeholder="${t('mall.report_detail_placeholder','상세 내용 (선택)')}" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','취소')}</button>
                    <button id="report-submit-gen" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#cc0000;color:#FFF8F0;font-weight:700;">${t('mall.report_submit','신고')}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#report-submit-gen').onclick = async () => {
            try {
                await db.collection('reports').add({
                    targetType, targetId,
                    reporterId: currentUser.uid, reporterEmail: currentUser.email,
                    reason: overlay.querySelector('#report-reason-gen').value,
                    detail: overlay.querySelector('#report-detail-gen').value.trim(),
                    status: 'pending', createdAt: new Date()
                });
                showToast(t('mall.report_submitted','🚨 신고가 접수되었습니다'), 'success');
                overlay.remove(); resolve();
            } catch(e) { showToast(t('mall.report_failed','신고 실패') + ': ' + e.message, 'error'); }
        };
    });
}

// ========== 검색 고도화 ==========

let _mallSearchDebounce = null;

function initMallSearch() {
    const searchInput = document.getElementById('mall-search');
    if (!searchInput || searchInput._mallSearchInit) return;
    searchInput._mallSearchInit = true;
    
    // 자동완성 드롭다운 컨테이너
    let acContainer = document.getElementById('mall-autocomplete');
    if (!acContainer) {
        acContainer = document.createElement('div');
        acContainer.id = 'mall-autocomplete';
        acContainer.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#FFF8F0;border:1px solid #E8E0D8;border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;display:none;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
        searchInput.parentElement.style.position = 'relative';
        searchInput.parentElement.appendChild(acContainer);
    }
    
    searchInput.addEventListener('input', () => {
        clearTimeout(_mallSearchDebounce);
        _mallSearchDebounce = setTimeout(() => mallAutocomplete(searchInput.value.trim()), 300);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            acContainer.style.display = 'none';
            saveMallRecentSearch(searchInput.value.trim());
            loadMallProducts();
        }
    });
    
    searchInput.addEventListener('focus', () => {
        if (!searchInput.value.trim()) showMallRecentSearches();
    });
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !acContainer.contains(e.target)) {
            acContainer.style.display = 'none';
        }
    });
}

async function mallAutocomplete(query) {
    const ac = document.getElementById('mall-autocomplete');
    if (!ac) return;
    if (!query || query.length < 1) { showMallRecentSearches(); return; }
    
    try {
        const snap = await db.collection('products').where('status', '==', 'active').orderBy('title').limit(100).get();
        const q = query.toLowerCase();
        const matches = [];
        snap.forEach(d => {
            const p = d.data();
            if (p.title.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q) || (MALL_CATEGORIES[p.category]||'').toLowerCase().includes(q)) matches.push(p.title);
        });
        const unique = [...new Set(matches)].slice(0, 8);
        if (unique.length === 0) { ac.style.display = 'none'; return; }
        ac.style.display = 'block';
        ac.innerHTML = unique.map(t => `<div onclick="selectMallAutocomplete('${t.replace(/'/g,"\\'")}')" style="padding:0.6rem 0.8rem;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #F7F3ED;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='white'">${t}</div>`).join('');
    } catch(e) { ac.style.display = 'none'; }
}

function selectMallAutocomplete(val) {
    const input = document.getElementById('mall-search');
    if (input) input.value = val;
    document.getElementById('mall-autocomplete').style.display = 'none';
    saveMallRecentSearch(val);
    loadMallProducts();
}

function saveMallRecentSearch(query) {
    if (!query) return;
    let recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    recent = recent.filter(s => s !== query);
    recent.unshift(query);
    if (recent.length > 5) recent = recent.slice(0, 5);
    localStorage.setItem('mall_recent_searches', JSON.stringify(recent));
}

function showMallRecentSearches() {
    const ac = document.getElementById('mall-autocomplete');
    if (!ac) return;
    const recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    if (recent.length === 0) { ac.style.display = 'none'; return; }
    ac.style.display = 'block';
    ac.innerHTML = '<div style="padding:0.4rem 0.8rem;font-size:0.75rem;color:var(--accent);font-weight:600;">최근 검색어</div>' +
        recent.map(s => `<div onclick="selectMallAutocomplete('${s.replace(/'/g,"\\'")}')" style="padding:0.5rem 0.8rem;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #F7F3ED;display:flex;justify-content:space-between;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='white'">
            <span>🕐 ${s}</span>
            <span onclick="event.stopPropagation();removeMallRecentSearch('${s.replace(/'/g,"\\'")}')" style="color:#6B5744;font-size:0.75rem;">✕</span>
        </div>`).join('');
}

function removeMallRecentSearch(query) {
    let recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    recent = recent.filter(s => s !== query);
    localStorage.setItem('mall_recent_searches', JSON.stringify(recent));
    showMallRecentSearches();
}

// ========== 필터 시스템 ==========

let _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };

function toggleMallFilters() {
    const panel = document.getElementById('mall-filter-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function updatePriceRangeLabel() {
    const min = document.getElementById('mall-filter-price-min')?.value || '0';
    const max = document.getElementById('mall-filter-price-max')?.value || '10000';
    const label = document.getElementById('mall-price-range-label');
    if (label) label.textContent = `${min} ~ ${max === '10000' ? '∞' : max} CRGC`;
}

function applyMallFilters() {
    _mallFilters.category = document.getElementById('mall-filter-category')?.value || '';
    const minEl = document.getElementById('mall-filter-price-min');
    const maxEl = document.getElementById('mall-filter-price-max');
    _mallFilters.priceMin = (minEl && minEl.value !== '0') ? minEl.value : '';
    _mallFilters.priceMax = (maxEl && maxEl.value !== '10000') ? maxEl.value : '';
    _mallFilters.ratingMin = document.getElementById('mall-filter-rating')?.value || '';
    _mallFilters.inStockOnly = document.getElementById('mall-filter-instock')?.checked || false;
    loadMallProducts();
}

function resetMallFilters() {
    _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };
    const el = (id) => document.getElementById(id);
    if (el('mall-filter-category')) el('mall-filter-category').value = '';
    if (el('mall-filter-price-min')) el('mall-filter-price-min').value = '';
    if (el('mall-filter-price-max')) el('mall-filter-price-max').value = '';
    if (el('mall-filter-rating')) el('mall-filter-rating').value = '';
    if (el('mall-filter-instock')) el('mall-filter-instock').checked = false;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

