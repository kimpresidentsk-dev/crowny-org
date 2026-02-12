// ===== ai-assistant.js — CROWNY AI 도우미 (Gemini 1.5 Flash) =====

const AI_ASSISTANT = (() => {
    // ── Config ──
    const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    const MAX_HISTORY = 50;
    const STORAGE_KEY = 'crowny_ai_chat';

    let apiKey = 'AIzaSyDfLgJOoI9vXUaNy7hYhZWf6vx5beyAQVw';
    let systemPrompt = '';
    let enabled = true;
    let chatHistory = [];
    let isLoading = false;

    const DEFAULT_SYSTEM_PROMPT = `당신은 크라우니(CROWNY) 플랫폼의 AI 도우미입니다.
크라우니는 메신저, 지갑, 트레이딩, 소셜, 쇼핑몰, 도서, 아트, 아티스트, 
비즈니스, CREB LABS(에너지/유전공학/생명공학/AI), 모금, 신용 서비스를 
하나로 연결한 글로벌 플랫폼입니다.

규칙:
- 사용자의 언어로 응답하세요
- 따뜻하고 친절한 톤을 유지하세요
- 크라우니 서비스를 자연스럽게 안내하세요
- 투자/금융 조언 시 "참고용이며 투자 결정은 본인 책임"을 명시하세요
- 개인정보를 외부에 공유하지 마세요`;

    const QUICK_QUESTIONS = [
        { icon: '💰', text: '내 토큰 잔액은?' },
        { icon: '📈', text: '오늘의 트레이딩 팁' },
        { icon: '🛒', text: '인기 상품 추천' },
        { icon: '🔬', text: 'CREB LABS 프로젝트 소개' },
        { icon: '📚', text: '추천 도서' },
        { icon: '❓', text: '크라우니 사용법' }
    ];

    // ── Settings Load ──
    async function loadSettings() {
        try {
            const doc = await db.collection('admin_config').doc('ai_settings').get();
            if (doc.exists) {
                const data = doc.data();
                apiKey = data.apiKey || '';
                systemPrompt = data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
                enabled = data.enabled !== false;
            } else {
                systemPrompt = DEFAULT_SYSTEM_PROMPT;
            }
        } catch (e) {
            console.error('AI settings load failed:', e);
            systemPrompt = DEFAULT_SYSTEM_PROMPT;
        }
    }

    // ── Platform Context ──
    function buildContext() {
        let ctx = systemPrompt || DEFAULT_SYSTEM_PROMPT;
        if (!currentUser) return ctx;

        ctx += '\n\n--- 현재 사용자 정보 ---';
        ctx += `\n이메일: ${currentUser.email}`;

        try {
            // offchain balances from wallet display
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

        // current page
        const activePage = document.querySelector('.page.active');
        if (activePage) ctx += `\n현재 페이지: ${activePage.id}`;

        return ctx;
    }

    // ── API Call ──
    async function sendToGemini(userMessage) {
        if (!apiKey) {
            return '⚠️ AI API 키가 설정되지 않았습니다. 관리자에게 문의하세요.';
        }

        // Build contents array from history
        const contents = chatHistory.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildContext() }] },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        };

        const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            if (res.status === 429) return '⏳ 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
            if (res.status === 403) return '🔑 API 키가 유효하지 않습니다.';
            return '❌ AI 응답 오류가 발생했습니다.';
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 받지 못했습니다.';
    }

    // ── Chat History (localStorage) ──
    function loadHistory() {
        try {
            chatHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (_) { chatHistory = []; }
    }

    function saveHistory() {
        if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
    }

    function clearHistory() {
        chatHistory = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    // ── Markdown (basic) ──
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

    // ── UI Rendering ──
    function renderChat() {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;

        if (chatHistory.length === 0) {
            container.innerHTML = renderWelcome();
            return;
        }

        container.innerHTML = chatHistory.map(m => {
            const isUser = m.role === 'user';
            return `<div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-bot'}">
                ${isUser ? '' : '<div class="ai-avatar">👑</div>'}
                <div class="ai-bubble ${isUser ? 'ai-bubble-user' : 'ai-bubble-bot'}">${isUser ? escapeHtml(m.text) : renderMarkdown(m.text)}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function renderWelcome() {
        const cards = QUICK_QUESTIONS.map(q =>
            `<button class="ai-quick-card" onclick="AI_ASSISTANT.ask('${q.icon} ${q.text}')">${q.icon} ${q.text}</button>`
        ).join('');
        return `<div class="ai-welcome">
            <div class="ai-welcome-icon">👑</div>
            <h3>${t('ai.welcome_title','안녕하세요! 크라우니 AI 도우미입니다')}</h3>
            <p>${t('ai.welcome_sub','무엇을 도와드릴까요?')}</p>
            <div class="ai-quick-cards">${cards}</div>
        </div>`;
    }

    function showTyping() {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'ai-msg ai-msg-bot ai-typing-wrap';
        el.innerHTML = '<div class="ai-avatar">👑</div><div class="ai-bubble ai-bubble-bot ai-typing"><span></span><span></span><span></span></div>';
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    function hideTyping() {
        document.querySelectorAll('.ai-typing-wrap').forEach(el => el.remove());
    }

    // ── Public: Send Message ──
    async function ask(text) {
        if (!text || isLoading) return;
        if (!enabled) { showToast('AI 도우미가 비활성화되어 있습니다', 'warning'); return; }

        const input = document.getElementById('ai-input');
        if (input) input.value = '';

        chatHistory.push({ role: 'user', text });
        renderChat();
        showTyping();
        isLoading = true;

        try {
            const reply = await sendToGemini(text);
            chatHistory.push({ role: 'model', text: reply });
            saveHistory();
        } catch (e) {
            chatHistory.push({ role: 'model', text: '❌ 오류가 발생했습니다: ' + e.message });
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

    // ── Init ──
    async function init() {
        loadHistory();
        await loadSettings();
        renderChat();
        // iOS 키보드 대응: 입력 포커스 시 입력바로 스크롤
        const inputEl = document.querySelector('.ai-input-bar input');
        if (inputEl) {
            inputEl.addEventListener('focus', () => {
                setTimeout(() => {
                    inputEl.scrollIntoView({ block: 'end', behavior: 'smooth' });
                }, 300);
            });
        }
    }

    function reset() {
        if (confirm(t('ai.clear_confirm','대화 기록을 모두 삭제할까요?'))) {
            clearHistory();
            renderChat();
        }
    }

    // ── Admin: Save Settings ──
    async function saveAdminSettings() {
        const key = document.getElementById('ai-admin-apikey')?.value?.trim() || '';
        const prompt = document.getElementById('ai-admin-prompt')?.value?.trim() || DEFAULT_SYSTEM_PROMPT;
        const on = document.getElementById('ai-admin-toggle')?.checked !== false;

        try {
            await db.collection('admin_config').doc('ai_settings').set({
                apiKey: key,
                systemPrompt: prompt,
                enabled: on,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            apiKey = key;
            systemPrompt = prompt;
            enabled = on;
            showToast('AI 설정이 저장되었습니다 ✅', 'success');
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
            if (promptEl) promptEl.value = data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
            if (toggleEl) toggleEl.checked = data.enabled !== false;
        } catch (e) { console.warn('AI admin load fail:', e); }
    }

    return { init, ask, handleSend, handleKeydown, reset, renderChat, saveAdminSettings, loadAdminSettings, DEFAULT_SYSTEM_PROMPT };
})();
