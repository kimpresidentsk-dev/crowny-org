// ===== CROWNY i18n (국제화) 시스템 v1.0 =====
// 언어 감지 + 수동 전환 + data-i18n 자동 교체

let currentLang = localStorage.getItem('crowny_lang') || navigator.language?.slice(0,2) || 'ko';
let langData = {};
let i18nReady = false;

// 지원 언어 목록
const SUPPORTED_LANGS = {
    ko: { name: '한국어', flag: '🇰🇷' },
    en: { name: 'English', flag: '🇺🇸' },
    zh: { name: '中文', flag: '🇨🇳' },
    ja: { name: '日本語', flag: '🇯🇵' },
    es: { name: 'Español', flag: '🇪🇸' }
};

// 지원하지 않는 언어면 ko로 폴백
if (!SUPPORTED_LANGS[currentLang]) {
    currentLang = 'ko';
}

async function loadLanguage(lang) {
    try {
        const res = await fetch(`lang/${lang}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        langData = await res.json();
        currentLang = lang;
        localStorage.setItem('crowny_lang', lang);
        document.documentElement.lang = lang;
        i18nReady = true;
        console.log(`🌐 [i18n] Loaded: ${lang} (${Object.keys(langData).length} keys)`);
    } catch (e) {
        console.warn(`🌐 [i18n] Failed to load ${lang}, fallback to ko:`, e.message);
        if (lang !== 'ko') {
            await loadLanguage('ko');
        }
    }
}

// 번역 함수 — 키 기반 조회 (dot notation 지원)
function t(key, fallback) {
    if (!key) return fallback || '';
    // dot notation: "common.confirm" → langData["common.confirm"]
    return langData[key] || fallback || key;
}

// 페이지 내 data-i18n 속성 자동 교체
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translated = t(key);
        if (translated && translated !== key) {
            el.textContent = translated;
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        const translated = t(key);
        if (translated && translated !== key) {
            el.placeholder = translated;
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        const translated = t(key);
        if (translated && translated !== key) {
            el.title = translated;
        }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.dataset.i18nHtml;
        const translated = t(key);
        if (translated && translated !== key) {
            el.innerHTML = translated;
        }
    });
}

// 언어 전환
function setLanguage(lang) {
    if (!SUPPORTED_LANGS[lang]) {
        console.warn(`🌐 [i18n] Unsupported language: ${lang}`);
        return;
    }
    loadLanguage(lang).then(() => {
        applyI18n();
        // 언어 선택 드롭다운 업데이트
        const selector = document.getElementById('lang-selector');
        if (selector) selector.value = lang;
        // 커스텀 이벤트 발생 — JS에서 동적 생성하는 텍스트도 갱신 가능
        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    });
}

// 언어 선택 UI 생성 (사이드바 하단에 삽입)
function createLanguageSelector() {
    const nav = document.querySelector('.sidebar .nav') || document.querySelector('.sidebar');
    if (!nav) return;

    const container = document.createElement('div');
    container.id = 'lang-switcher';
    container.style.cssText = 'padding:0.8rem 1rem; border-top:1px solid rgba(255,255,255,0.1); margin-top:auto;';
    container.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:1rem;">🌐</span>
            <select id="lang-selector" onchange="setLanguage(this.value)" 
                style="flex:1; padding:0.4rem 0.6rem; border-radius:6px; border:1px solid rgba(255,255,255,0.2); 
                background:rgba(255,255,255,0.1); color:inherit; font-size:0.82rem; cursor:pointer; appearance:auto;">
                ${Object.entries(SUPPORTED_LANGS).map(([code, info]) => 
                    `<option value="${code}" ${code === currentLang ? 'selected' : ''}>${info.flag} ${info.name}</option>`
                ).join('')}
            </select>
        </div>
    `;

    // 사이드바 하단에 삽입
    const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.appendChild(container);
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    loadLanguage(currentLang).then(() => {
        applyI18n();
        createLanguageSelector();
    });
});

console.log('🌐 js/i18n.js v1.0 loaded');
