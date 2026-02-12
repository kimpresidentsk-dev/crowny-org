// ===== ui.js - UI 헬퍼, 페이지 네비게이션 =====
// ========== UI HELPERS ==========
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(pageId).classList.add('active');
    const navItem = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (navItem) navItem.classList.add('active');
    
    document.getElementById('sidebar').classList.remove('active');
    
    // Load page-specific data
    if (pageId === 'social') {
        loadSocialFeed();
    }
    if (pageId === 'prop-trading') {
        loadPropTrading();
        loadTradingDashboard();
    }
    if (pageId === 'admin') {
        // Admin is now a separate page
        window.location.href = 'admin.html';
        return;
    }
    if (pageId === 'art') {
        loadArtGallery();
    }
    if (pageId === 'mall') {
        loadMallProducts();
    }
    if (pageId === 'fundraise') {
        loadCampaigns();
    }
    if (pageId === 'energy') {
        loadEnergyProjects();
    }
    if (pageId === 'business') {
        loadBusinessList();
    }
    if (pageId === 'artist') {
        loadArtistList();
    }
    if (pageId === 'books') {
        loadBooksList();
    }
    if (pageId === 'credit') {
        loadCreditInfo();
        loadPumasiList();
    }
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

// 범용 프롬프트 모달 (input 대체)
function showPromptModal(title, message, defaultValue) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.innerHTML = `
            <div style="background:white;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;">
                <h3 style="margin-bottom:0.8rem;">${title}</h3>
                <p style="color:#666;margin-bottom:1rem;white-space:pre-line;font-size:0.9rem;">${message}</p>
                <input type="text" id="prompt-modal-input" value="${defaultValue || ''}" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:8px;font-size:1rem;box-sizing:border-box;margin-bottom:1rem;">
                <div style="display:flex;gap:0.5rem;">
                    <button id="prompt-cancel" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">취소</button>
                    <button id="prompt-ok" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#1a1a2e;color:white;font-weight:700;">확인</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#prompt-modal-input');
        input.focus();
        input.select();
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.body.removeChild(overlay); resolve(input.value); } if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); } });
        overlay.querySelector('#prompt-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
        overlay.querySelector('#prompt-ok').onclick = () => { document.body.removeChild(overlay); resolve(input.value); };
    });
}

// ===== 이미지 리사이즈 유틸리티 =====
function resizeImage(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// ===== Registration Modal Helpers =====
function openRegisterModal(section) {
    const modal = document.getElementById('modal-' + section);
    if (modal) modal.classList.add('active');
}

function closeRegisterModal(section) {
    const modal = document.getElementById('modal-' + section);
    if (modal) modal.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('register-modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Show/hide admin register buttons based on user level
function updateAdminRegisterButtons() {
    const isAdmin = (typeof currentUserLevel !== 'undefined') && currentUserLevel >= 2;
    const btnIds = ['mall-register-btn', 'art-register-btn', 'fundraise-register-btn', 'energy-register-btn', 'business-register-btn', 'artist-register-btn', 'books-register-btn'];
    btnIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = isAdmin ? 'inline-block' : 'none';
    });
}

// Init Web3 (Polygon) - fallback RPC
