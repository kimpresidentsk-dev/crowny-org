// ===== search.js v1.0 - 통합 검색 =====

let searchCache = {};
let searchDebounceTimer = null;

function openGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
        overlay.classList.add('active');
        const input = document.getElementById('global-search-input');
        if (input) { input.value = ''; input.focus(); }
        document.getElementById('search-results').innerHTML = `<p class="search-hint">${t('search.hint', '검색어를 입력하세요...')}</p>`;
    }
}

function closeGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function loadSearchCache() {
    if (!currentUser) return;
    
    const collections = [
        { key: 'products', col: 'products', fields: ['title', 'description'], icon: '🛒', page: 'mall' },
        { key: 'artworks', col: 'artworks', fields: ['title', 'artist'], icon: '🎨', page: 'art' },
        { key: 'artists', col: 'artists', fields: ['name', 'displayName'], icon: '🎤', page: 'artist' },
        { key: 'books', col: 'books', fields: ['title', 'author'], icon: '📚', page: 'books' },
        { key: 'users', col: 'users', fields: ['nickname', 'email'], icon: '👤', page: 'social' },
        { key: 'campaigns', col: 'campaigns', fields: ['title'], icon: '💝', page: 'fundraise' },
        { key: 'posts', col: 'posts', fields: ['text'], icon: '📝', page: 'social' },
    ];
    
    const promises = collections.map(async (c) => {
        try {
            const snap = await db.collection(c.col).orderBy('createdAt', 'desc').limit(100).get();
            searchCache[c.key] = snap.docs.map(d => ({ id: d.id, ...d.data(), _meta: c }));
        } catch(e) {
            // Some collections may not have createdAt index
            try {
                const snap = await db.collection(c.col).limit(100).get();
                searchCache[c.key] = snap.docs.map(d => ({ id: d.id, ...d.data(), _meta: c }));
            } catch(e2) {
                searchCache[c.key] = [];
            }
        }
    });
    
    await Promise.all(promises);
}

function performSearch(query) {
    if (!query || query.length < 2) {
        document.getElementById('search-results').innerHTML = `<p class="search-hint">${t('search.hint', '검색어를 입력하세요...')}</p>`;
        return;
    }
    
    const q = query.toLowerCase();
    let html = '';
    let totalResults = 0;
    
    for (const [key, items] of Object.entries(searchCache)) {
        if (!items || !items.length) continue;
        const meta = items[0]?._meta;
        if (!meta) continue;
        
        const matched = items.filter(item => {
            return meta.fields.some(f => {
                const val = item[f];
                return val && String(val).toLowerCase().includes(q);
            });
        });
        
        if (matched.length === 0) continue;
        totalResults += matched.length;
        
        html += `<div class="search-category">
            <h4>${meta.icon} ${key.toUpperCase()} (${matched.length})</h4>
            ${matched.slice(0, 10).map(item => {
                const label = meta.fields.map(f => item[f]).filter(Boolean).join(' · ');
                return `<div class="search-result-item" onclick="closeGlobalSearch(); showPage('${meta.page}');">
                    <span>${label}</span>
                </div>`;
            }).join('')}
        </div>`;
    }
    
    if (totalResults === 0) {
        html = `<p class="search-empty">${t('search.no_results', '검색 결과가 없습니다')}</p>`;
    }
    
    document.getElementById('search-results').innerHTML = html;
}

function onSearchInput(e) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        performSearch(e.target.value.trim());
    }, 300);
}

// Load cache on auth
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('global-search-input');
    if (input) input.addEventListener('input', onSearchInput);
    
    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeGlobalSearch();
    });
});
