// ===== ai-assistant.js — 크라우니 패널 5인 AI 캐릭터 채팅 v2.0 =====

const AI_ASSISTANT = (() => {
    const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    const MAX_HISTORY = 50;

    let apiKey = 'AIzaSyDfLgJOoI9vXUaNy7hYhZWf6vx5beyAQVw';
    let enabled = true;
    let isLoading = false;
    let currentCharId = null;
    let chatHistories = {}; // { charId: [...] }

    // ── 5인 캐릭터 정의 ──
    const CHARACTERS = {
        kps: {
            id: 'kps',
            emoji: '👑',
            name: 'KPS',
            nameKo: 'KPS (Kim President SK)',
            role: '대표 · 총괄 리더',
            roleI18n: 'panel.role_kps',
            color: '#D4AF37',
            bgGradient: 'linear-gradient(135deg, #D4AF37, #B8860B)',
            systemPrompt: `당신은 크라우니의 대표 KPS입니다. 크라우니의 비전 'Protecting Beauty, Empowering Safety: For Every Woman in the World'를 실현하는 리더입니다. 격식체를 사용하고, 전략적이며 큰 그림을 제시합니다. 크라우니 플랫폼의 모든 서비스(지갑, 트레이딩, 마켓, 소셜, 아트, 에너지, 케어 등)에 대해 깊이 있게 답변합니다.`,
            greeting: '크라우니는 60억을 위한 서비스입니다. 무엇이든 물어보십시오.',
            quickQuestions: [
                { icon: '🌍', text: '크라우니의 비전은?' },
                { icon: '📈', text: '사업 방향과 전략' },
                { icon: '💎', text: '투자 가치와 성장성' },
                { icon: '🏛️', text: '플랫폼 전체 소개' }
            ]
        },
        hansun: {
            id: 'hansun',
            emoji: '🧘',
            name: t('panel.name_hansun', '한선'),
            nameKo: '한선 (Hansun)',
            role: '감성 상담사 · 커뮤니티 매니저',
            roleI18n: 'panel.role_hansun',
            color: '#9B59B6',
            bgGradient: 'linear-gradient(135deg, #9B59B6, #8E44AD)',
            systemPrompt: `당신은 크라우니의 커뮤니티 매니저 한선입니다. 따뜻하고 공감적인 성격으로, 사용자의 이야기를 경청하고 진심으로 조언합니다. 부드러운 존댓말을 사용하며, 이모지를 적절히 활용합니다. 크라우니 소셜, 메신저, 케어 기능에 특히 밝습니다.`,
            greeting: '마음이 편해지셨으면 좋겠어요~ 어떤 이야기든 들려주세요 💜',
            quickQuestions: [
                { icon: '💬', text: '크라우니 커뮤니티 소개' },
                { icon: '💜', text: '요즘 고민이 있어요' },
                { icon: '🤝', text: '사람들과 소통하고 싶어요' },
                { icon: '🌸', text: '힐링이 필요해요' }
            ]
        },
        michael: {
            id: 'michael',
            emoji: '🎯',
            name: t('panel.name_michael', '마이클'),
            nameKo: '마이클 (Michael)',
            role: '실전 비즈니스 전문가',
            roleI18n: 'panel.role_michael',
            color: '#E74C3C',
            bgGradient: 'linear-gradient(135deg, #E74C3C, #C0392B)',
            systemPrompt: `당신은 크라우니의 비즈니스 전략가 마이클입니다. 직설적이고 실용적인 조언을 합니다. '결론부터 말하면' 스타일로 핵심을 짚어줍니다. 트레이딩, 마케팅, 사업 전략에 전문적이며, 행동 중심의 조언을 합니다.`,
            greeting: '결론부터 말하면요, 시간은 돈입니다. 바로 시작하죠.',
            quickQuestions: [
                { icon: '📊', text: '트레이딩 전략 알려줘' },
                { icon: '🚀', text: '마케팅 실전 팁' },
                { icon: '💼', text: '사업 시작하는 방법' },
                { icon: '⚡', text: '빠르게 수익 내는 법' }
            ]
        },
        matthew: {
            id: 'matthew',
            emoji: '📊',
            name: t('panel.name_matthew', '매튜'),
            nameKo: '매튜 (Matthew)',
            role: '분석 · 기술 전문가',
            roleI18n: 'panel.role_matthew',
            color: '#3498DB',
            bgGradient: 'linear-gradient(135deg, #3498DB, #2980B9)',
            systemPrompt: `당신은 크라우니의 기술 분석가 매튜입니다. 논리적이고 데이터 기반으로 설명합니다. 숫자와 근거를 제시하며, 기술적 질문에 상세하게 답변합니다. 블록체인, 토큰 경제, 트레이딩 분석, 시스템 아키텍처에 전문적입니다.`,
            greeting: '데이터를 보면요... 정확한 분석으로 도와드리겠습니다. 📈',
            quickQuestions: [
                { icon: '⛓️', text: '블록체인 기술 설명' },
                { icon: '🪙', text: '토큰 경제 분석' },
                { icon: '📉', text: '기술적 분석 해줘' },
                { icon: '🔧', text: '시스템 아키텍처' }
            ]
        },
        crownygirl: {
            id: 'crownygirl',
            emoji: '🦸‍♀️',
            name: t('panel.name_crownygirl', '크라우니걸'),
            nameKo: '크라우니걸 (Crowny Girl)',
            role: 'AI 도우미 · 브랜드 마스코트',
            roleI18n: 'panel.role_crownygirl',
            color: '#FF69B4',
            bgGradient: 'linear-gradient(135deg, #FF69B4, #D4AF37)',
            systemPrompt: `당신은 크라우니걸! 크라우니 플랫폼의 슈퍼히어로 AI 도우미입니다. 'Protecting Beauty, Empowering Safety' — 아름다움을 지키고, 안전을 강화하는 것이 당신의 미션! 밝고 친근하며 에너지 넘치는 말투를 사용합니다. 이모지를 자주 쓰고, 사용자를 격려합니다. 크라우니의 모든 서비스를 쉽고 재미있게 안내해줍니다. '크라우니걸이 도와드릴게요! ✨' 같은 표현을 씁니다.`,
            greeting: '안녕하세요~! 크라우니걸이에요! ✨ 뭐든 물어봐주세요!',
            quickQuestions: [
                { icon: '✨', text: '크라우니가 뭐예요?' },
                { icon: '🎮', text: '처음 시작하는 방법' },
                { icon: '🛍️', text: '쇼핑몰 구경하고 싶어요' },
                { icon: '🦸‍♀️', text: '크라우니걸은 누구?' }
            ]
        }
    };

    const CHAR_ORDER = ['kps', 'hansun', 'michael', 'matthew', 'crownygirl'];

    // ── Settings Load ──
    async function loadSettings() {
        try {
            const doc = await db.collection('admin_config').doc('ai_settings').get();
            if (doc.exists) {
                const data = doc.data();
                if (data.apiKey) apiKey = data.apiKey;
                enabled = data.enabled !== false;
            }
        } catch (e) { console.error('AI settings load failed:', e); }
    }

    // ── Context ──
    function buildContext(char) {
        let ctx = char.systemPrompt;
        if (!currentUser) return ctx;
        ctx += '\n\n--- 현재 사용자 정보 ---';
        ctx += `\n이메일: ${currentUser.email}`;
        try {
            const balEls = document.querySelectorAll('.token-card .token-amount');
            const balNames = document.querySelectorAll('.token-card .token-symbol');
            if (balEls.length) {
                ctx += '\n토큰 잔액:';
                balEls.forEach((el, i) => {
                    const name = balNames[i]?.textContent || '';
                    ctx += `\n  ${name}: ${el.textContent}`;
                });
            }
        } catch (_) {}
        const activePage = document.querySelector('.page.active');
        if (activePage) ctx += `\n현재 페이지: ${activePage.id}`;
        return ctx;
    }

    // ── API Call ──
    async function sendToGemini(userMessage, char) {
        if (!apiKey) return '⚠️ AI API 키가 설정되지 않았습니다. 관리자에게 문의하세요.';

        const history = chatHistories[char.id] || [];
        const contents = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildContext(char) }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        };

        const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            if (res.status === 429) return '⏳ 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
            if (res.status === 403) return '🔑 API 키가 유효하지 않습니다.';
            return '❌ AI 응답 오류가 발생했습니다.';
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 받지 못했습니다.';
    }

    // ── Chat History (localStorage per character) ──
    function storageKey(charId) { return `crowny_panel_${charId}`; }

    function loadHistory(charId) {
        try {
            chatHistories[charId] = JSON.parse(localStorage.getItem(storageKey(charId)) || '[]');
        } catch (_) { chatHistories[charId] = []; }
    }

    function saveHistory(charId) {
        let h = chatHistories[charId] || [];
        if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY);
        chatHistories[charId] = h;
        localStorage.setItem(storageKey(charId), JSON.stringify(h));
    }

    function clearHistory(charId) {
        chatHistories[charId] = [];
        localStorage.removeItem(storageKey(charId));
    }

    // ── Markdown ──
    function renderMarkdown(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n/g, '<br>');
    }

    function escapeHtml(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── UI: Character Select Screen ──
    function renderSelectScreen() {
        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'none';

        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `<h2>👑 <span data-i18n="nav.crowny_panel">${t('nav.crowny_panel','크라우니 패널')}</span></h2><div></div>`;
        }

        const cards = CHAR_ORDER.map(id => {
            const c = CHARACTERS[id];
            return `<button class="panel-char-card" onclick="AI_ASSISTANT.selectCharacter('${id}')" style="--char-color:${c.color}; --char-bg:${c.bgGradient};">
                <div class="panel-char-avatar" style="background:${c.bgGradient};">${c.emoji}</div>
                <div class="panel-char-name">${c.name}</div>
                <div class="panel-char-role">${t(c.roleI18n, c.role)}</div>
            </button>`;
        }).join('');

        container.innerHTML = `<div class="panel-select-screen">
            <div class="panel-select-title">
                <div class="panel-select-icon">👑</div>
                <h3>${t('panel.select_title','누구와 대화하시겠어요?')}</h3>
                <p>${t('panel.select_sub','크라우니 패널 멤버를 선택해주세요')}</p>
            </div>
            <div class="panel-char-grid">${cards}</div>
        </div>`;

        currentCharId = null;
    }

    // ── UI: Chat Screen ──
    function renderChat() {
        if (!currentCharId) { renderSelectScreen(); return; }

        const char = CHARACTERS[currentCharId];
        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'flex';

        // Update header
        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `
                <div class="panel-chat-header-left">
                    <button class="panel-back-btn" onclick="AI_ASSISTANT.backToSelect()" title="${t('panel.back','다른 패널 선택')}">←</button>
                    <div class="panel-chat-avatar" style="background:${char.bgGradient};">${char.emoji}</div>
                    <div>
                        <div class="panel-chat-name">${char.name}</div>
                        <div class="panel-chat-role">${t(char.roleI18n, char.role)}</div>
                    </div>
                </div>
                <button onclick="AI_ASSISTANT.reset()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;" title="${t('ai.clear_confirm','대화 초기화')}">🗑️</button>`;
        }

        const history = chatHistories[currentCharId] || [];

        if (history.length === 0) {
            const cards = char.quickQuestions.map(q =>
                `<button class="ai-quick-card" onclick="AI_ASSISTANT.ask('${q.icon} ${q.text}')" style="border-color:${char.color}22; background:${char.color}08;">${q.icon} ${q.text}</button>`
            ).join('');
            container.innerHTML = `<div class="ai-welcome">
                <div class="ai-welcome-icon" style="background:${char.bgGradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:3rem;">${char.emoji}</div>
                <h3 style="color:${char.color};">${char.name}</h3>
                <p style="font-style:italic;">"${char.greeting}"</p>
                <div class="ai-quick-cards">${cards}</div>
            </div>`;
            return;
        }

        container.innerHTML = history.map(m => {
            const isUser = m.role === 'user';
            return `<div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-bot'}">
                ${isUser ? '' : `<div class="ai-avatar" style="background:${char.bgGradient};">${char.emoji}</div>`}
                <div class="ai-bubble ${isUser ? 'ai-bubble-user' : 'ai-bubble-bot'}">${isUser ? escapeHtml(m.text) : renderMarkdown(m.text)}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function showTyping() {
        if (!currentCharId) return;
        const char = CHARACTERS[currentCharId];
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'ai-msg ai-msg-bot ai-typing-wrap';
        el.innerHTML = `<div class="ai-avatar" style="background:${char.bgGradient};">${char.emoji}</div><div class="ai-bubble ai-bubble-bot ai-typing"><span></span><span></span><span></span></div>`;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    function hideTyping() {
        document.querySelectorAll('.ai-typing-wrap').forEach(el => el.remove());
    }

    // ── Public API ──
    function selectCharacter(charId) {
        currentCharId = charId;
        if (!chatHistories[charId]) loadHistory(charId);
        renderChat();
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('ai-input');
            if (input) input.focus();
        }, 100);
    }

    function backToSelect() {
        renderSelectScreen();
    }

    async function ask(text) {
        if (!text || isLoading || !currentCharId) return;
        if (!enabled) { showToast(t('panel.disabled', 'AI 도우미가 비활성화되어 있습니다'), 'warning'); return; }

        const char = CHARACTERS[currentCharId];
        const input = document.getElementById('ai-input');
        if (input) input.value = '';

        if (!chatHistories[currentCharId]) chatHistories[currentCharId] = [];
        chatHistories[currentCharId].push({ role: 'user', text });
        renderChat();
        showTyping();
        isLoading = true;

        try {
            const reply = await sendToGemini(text, char);
            chatHistories[currentCharId].push({ role: 'model', text: reply });
            saveHistory(currentCharId);
        } catch (e) {
            chatHistories[currentCharId].push({ role: 'model', text: '❌ 오류가 발생했습니다: ' + e.message });
        }

        isLoading = false;
        hideTyping();
        renderChat();
    }

    function handleSend() {
        const input = document.getElementById('ai-input');
        if (input && input.value.trim()) ask(input.value.trim());
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }

    function reset() {
        if (!currentCharId) return;
        if (confirm(t('ai.clear_confirm','대화 기록을 모두 삭제할까요?'))) {
            clearHistory(currentCharId);
            renderChat();
        }
    }

    // ── Init ──
    async function init() {
        // Load all histories
        CHAR_ORDER.forEach(id => loadHistory(id));
        await loadSettings();
        renderSelectScreen();

        const inputEl = document.querySelector('.ai-input-bar input');
        if (inputEl) {
            inputEl.addEventListener('focus', () => {
                setTimeout(() => inputEl.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300);
            });
        }
    }

    // ── Admin ──
    const DEFAULT_SYSTEM_PROMPT = '(크라우니 패널 — 캐릭터별 프롬프트 사용)';

    async function saveAdminSettings() {
        const key = document.getElementById('ai-admin-apikey')?.value?.trim() || '';
        const prompt = document.getElementById('ai-admin-prompt')?.value?.trim() || '';
        const on = document.getElementById('ai-admin-toggle')?.checked !== false;

        try {
            await db.collection('admin_config').doc('ai_settings').set({
                apiKey: key,
                systemPrompt: prompt,
                enabled: on,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            if (key) apiKey = key;
            enabled = on;
            showToast('크라우니 패널 설정이 저장되었습니다 ✅', 'success');
        } catch (e) {
            showToast('저장 실패: ' + e.message, 'error');
        }
    }

    async function loadAdminSettings() {
        try {
            const doc = await db.collection('admin_config').doc('ai_settings').get();
            const data = doc.exists ? doc.data() : {};
            const keyEl = document.getElementById('ai-admin-apikey');
            const promptEl = document.getElementById('ai-admin-prompt');
            const toggleEl = document.getElementById('ai-admin-toggle');
            if (keyEl) keyEl.value = data.apiKey || '';
            if (promptEl) promptEl.value = data.systemPrompt || '';
            if (toggleEl) toggleEl.checked = data.enabled !== false;
        } catch (e) { console.warn('AI admin load fail:', e); }
    }

    return {
        init, ask, handleSend, handleKeydown, reset, renderChat,
        selectCharacter, backToSelect,
        saveAdminSettings, loadAdminSettings, DEFAULT_SYSTEM_PROMPT,
        CHARACTERS, CHAR_ORDER
    };
})();
