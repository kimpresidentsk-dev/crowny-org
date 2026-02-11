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
    
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
    
    // Load page-specific data
    if (pageId === 'social') {
        loadSocialFeed();
    }
    if (pageId === 'prop-trading') {
        loadPropTrading();
        loadTradingDashboard();
    }
    if (pageId === 'admin') {
        initAdminPage();
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

// Init Web3 (Polygon) - fallback RPC
