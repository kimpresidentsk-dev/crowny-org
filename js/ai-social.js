// ===== ai-social.js - AI 캐릭터 소셜 봇 시스템 (v1.0) =====
// 5명의 AI 캐릭터가 소셜 피드에 자동 포스팅 + 댓글 답변

const AI_SOCIAL = (() => {
    const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    
    // 캐릭터 봇 계정 UID (Firestore에 저장)
    const BOT_CHARACTERS = {
        kps: {
            uid: 'bot_kps',
            nickname: 'KPS 김선경',
            avatar: 'images/kps-avatar.png',
            emoji: '👔',
            topics: ['비전', '전략', '리더십', '크라우니 사업', '팀워크', '긍정 에너지', '화장품', '글로벌 시장'],
            style: '격식체, 전략적, 큰 그림, 낙천적. 사업가 관점에서 인사이트 공유. 팀원들을 격려하고 크라우니의 미래를 이야기함.',
            postFrequency: 'daily'
        },
        hansun: {
            uid: 'bot_hansun',
            nickname: '한선피아노',
            avatar: 'images/hansun-avatar.png',
            emoji: '🎹',
            topics: ['피아노', '음악', '트레이딩', '일상', 'MZ세대', '자기계발', '감성'],
            style: '부드러운 존댓말(~요), 이모지 활용, 따뜻하고 공감적. 음악과 투자 이야기를 섞음. 겸손하고 평화로운 톤.',
            postFrequency: 'daily'
        },
        michael: {
            uid: 'bot_michael',
            nickname: '마이클',
            avatar: 'images/michael-avatar.png',
            emoji: '🎤',
            topics: ['공연', '엔터테인먼트', '트레이딩', '콘텐츠', '마케팅', '실행력', '현장 이야기'],
            style: '직설적, 실용적. "결론부터 말하면" 스타일. 형 같은 느낌. 행동 중심 조언. 풍부한 경험담.',
            postFrequency: 'daily'
        },
        matthew: {
            uid: 'bot_matthew',
            nickname: '매튜',
            avatar: 'images/matthew-avatar.png',
            emoji: '🔧',
            topics: ['블록체인', '기술', '음향', '데이터 분석', '토큰 경제', '시스템', '신뢰'],
            style: '논리적, 데이터 기반. 숫자와 근거 제시. 차분하고 신뢰감 있는 말투. 기술 인사이트 공유.',
            postFrequency: 'daily'
        },
        crownygirl: {
            uid: 'bot_crownygirl',
            nickname: '크라우니걸',
            avatar: 'images/crownygirl-avatar.png',
            emoji: '✨',
            topics: ['뷰티', '화장품', '스킨케어', '건강', '운동', '다이어트', '일상 팁', '긍정'],
            style: '밝고 친근, 에너지 넘침. 이모지 많이 사용. 가끔 엉뚱. "크라우니걸이 도와드릴게요! ✨" 같은 표현. 뷰티/건강 전문.',
            postFrequency: 'daily'
        }
    };

    let geminiApiKey = '';

    async function init() {
        // API 키 로드
        try {
            const settings = await db.collection('admin_config').doc('ai_settings').get();
            const data = settings.data() || {};
            geminiApiKey = (data.apiKey && data.apiKey.length > 10) ? data.apiKey : 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        } catch (e) {
            geminiApiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        }

        // 봇 프로필 문서 확인/생성 — 관리자 로그인 상태에서만
        if (typeof currentUser !== 'undefined' && currentUser) {
            for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
                try {
                    const doc = await db.collection('bot_profiles').doc(char.uid).get();
                    if (!doc.exists) {
                        await db.collection('bot_profiles').doc(char.uid).set({
                            email: `${key}@crowny.bot`,
                            nickname: char.nickname,
                            photoURL: char.avatar,
                            isBot: true,
                            botCharacter: key,
                            createdAt: new Date(),
                            statusMessage: `${char.emoji} AI 크라우니 멤버`
                        });
                        console.log(`[AI-Social] Bot profile created: ${char.nickname}`);
                    }
                } catch (e) {
                    console.warn(`[AI-Social] Bot profile skip for ${key} (will use local data):`, e.message);
                }
            }
        }
    }

    // Gemini로 포스트 내용 생성
    async function generatePost(charKey) {
        const char = BOT_CHARACTERS[charKey];
        if (!char) return null;

        const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

        const now = new Date();
        const hour = now.getHours();
        let timeContext = '';
        if (hour < 10) timeContext = '아침 시간대';
        else if (hour < 14) timeContext = '점심 시간대';
        else if (hour < 18) timeContext = '오후 시간대';
        else timeContext = '저녁 시간대';

        const topic = char.topics[Math.floor(Math.random() * char.topics.length)];

        const prompt = `당신은 크라우니 플랫폼의 "${char.nickname}" 캐릭터입니다.
성격/말투: ${char.style}
지금은 ${timeContext}입니다.

소셜 피드에 올릴 짧은 글을 하나 작성하세요.
주제 힌트: ${topic}
${lang !== 'ko' ? `\n언어: ${langNames[lang] || lang}로 작성하세요.` : ''}

규칙:
- 2~4문장으로 짧고 임팩트 있게
- 해시태그 1~3개 포함 (#크라우니 필수)
- 이모지 자연스럽게 활용
- 광고처럼 보이지 않게, 진짜 사람이 쓴 것처럼
- 가끔 다른 멤버를 언급하거나 질문을 던져도 좋음
- JSON 없이 순수 텍스트만 출력`;

        try {
            const res = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.9, maxOutputTokens: 300 }
                })
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error(`[AI-Social] Gemini ${res.status}:`, errText);
                // 403이면 DB에서 다른 키 시도
                if (res.status === 403 && geminiApiKey === 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA') {
                    try {
                        const s = await db.collection('admin_config').doc('ai_settings').get();
                        const d = s.data() || {};
                        if (d.apiKey && d.apiKey.length > 10 && d.apiKey !== geminiApiKey) {
                            geminiApiKey = d.apiKey;
                            return await generatePost(charKey); // retry with DB key
                        }
                    } catch(e2) {}
                }
                return null;
            }
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        } catch (e) {
            console.error('[AI-Social] Generate post failed:', e);
            return null;
        }
    }

    // 소셜 피드에 포스트 게시
    async function publishPost(charKey, text) {
        const char = BOT_CHARACTERS[charKey];
        if (!char || !text) return null;

        const hashtags = (text.match(/#[\w가-힣]+/g) || []).map(h => h.slice(1));
        const mentions = (text.match(/@[\w가-힣]+/g) || []).map(m => m.slice(1));

        const postData = {
            userId: char.uid,
            text: text,
            imageUrl: null,
            likes: 0,
            likedBy: [],
            commentCount: 0,
            shareCount: 0,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            hashtags,
            mentions,
            isBot: true,
            botCharacter: charKey
        };

        try {
            const ref = await db.collection('posts').add(postData);
            console.log(`[AI-Social] ${char.nickname} posted (${ref.id}): ${text.substring(0, 50)}...`);
            showToast(`${char.emoji} ${char.nickname} 포스팅 완료!`, 'success');
            return ref.id;
        } catch (e) {
            console.error('[AI-Social] Publish failed:', e);
            showToast(`❌ ${char.nickname} 포스팅 실패: ${e.message}`, 'error');
            return null;
        }
    }

    // 댓글에 AI 답변
    async function replyToComment(postId, comment, charKey) {
        const char = BOT_CHARACTERS[charKey];
        if (!char || !comment) return;

        const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

        const prompt = `당신은 크라우니 플랫폼의 "${char.nickname}"입니다.
성격/말투: ${char.style}

사용자가 내 글에 이런 댓글을 남겼습니다: "${comment}"

자연스럽게 답글을 작성하세요.
${lang !== 'ko' ? `언어: ${langNames[lang] || lang}로 답변하세요.` : ''}

규칙:
- 1~2문장으로 짧게
- 캐릭터 성격 유지
- 친근하고 자연스럽게`;

        try {
            const res = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 150 }
                })
            });
            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!reply) return;

            await db.collection('posts').doc(postId).collection('comments').add({
                userId: char.uid,
                text: reply,
                timestamp: new Date(),
                isBot: true,
                botCharacter: charKey
            });
            await db.collection('posts').doc(postId).update({
                commentCount: firebase.firestore.FieldValue.increment(1)
            });
            console.log(`[AI-Social] ${char.nickname} replied: ${reply.substring(0, 50)}...`);
        } catch (e) {
            console.error('[AI-Social] Reply failed:', e);
        }
    }

    // 새 댓글 감지 → 봇 글에 달린 댓글이면 자동 답변
    function watchBotPostComments() {
        const botUids = Object.values(BOT_CHARACTERS).map(c => c.uid);

        // 최근 봇 포스트 감시
        db.collection('posts')
            .where('isBot', '==', true)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(snapshot => {
                snapshot.docs.forEach(postDoc => {
                    const post = postDoc.data();
                    const charKey = post.botCharacter;
                    if (!charKey) return;

                    // 이 포스트의 댓글 감시
                    postDoc.ref.collection('comments')
                        .orderBy('timestamp', 'desc')
                        .limit(5)
                        .onSnapshot(commentSnap => {
                            commentSnap.docChanges().forEach(change => {
                                if (change.type !== 'added') return;
                                const comment = change.doc.data();
                                // 봇이 쓴 댓글이면 무시 (무한 루프 방지)
                                if (comment.isBot) return;
                                // 30초 이내 댓글만 답변 (과거 댓글 무시)
                                const commentTime = comment.timestamp?.toDate?.() || new Date();
                                if (Date.now() - commentTime.getTime() > 30000) return;

                                // 3~10초 랜덤 딜레이 후 답변 (자연스러움)
                                const delay = 3000 + Math.random() * 7000;
                                setTimeout(() => {
                                    replyToComment(postDoc.id, comment.text, charKey);
                                }, delay);
                            });
                        });
                });
            });
    }

    // 자동 포스팅 (관리자가 트리거)
    async function autoPostAll() {
        try { if (!geminiApiKey) await init(); } catch(e) { console.warn('[AI-Social] init warn:', e); }
        // API 키 폴백
        if (!geminiApiKey) geminiApiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        const results = [];
        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            try {
                console.log(`[AI-Social] Generating post for ${char.nickname}...`);
                const text = await generatePost(key);
                if (text) {
                    // 캐릭터 간 시간차 (자연스러움)
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    const postId = await publishPost(key, text);
                    results.push({ character: char.nickname, postId, text: text.substring(0, 60) });
                } else {
                    results.push({ character: char.nickname, error: 'Gemini 응답 없음' });
                }
            } catch (e) {
                console.error(`[AI-Social] ${char.nickname} error:`, e);
                results.push({ character: char.nickname, error: e.message });
            }
        }
        return results;
    }

    // 특정 캐릭터만 포스팅
    async function autoPostOne(charKey) {
        try { if (!geminiApiKey) await init(); } catch(e) { console.warn('[AI-Social] init warn:', e); }
        if (!geminiApiKey) geminiApiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        const text = await generatePost(charKey);
        if (text) {
            const postId = await publishPost(charKey, text);
            return { character: BOT_CHARACTERS[charKey]?.nickname, postId, text };
        }
        return null;
    }

    // 봇 포스트에 봇 배지 표시를 위한 헬퍼
    function isBotUser(userId) {
        return Object.values(BOT_CHARACTERS).some(c => c.uid === userId);
    }

    function getBotBadge(userId) {
        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            if (char.uid === userId) return `<span style="background:linear-gradient(135deg,#D4AF37,#F0C060);color:#1a1a2e;font-size:0.6rem;padding:0.1rem 0.4rem;border-radius:10px;font-weight:700;margin-left:0.3rem;">AI ${char.emoji}</span>`;
        }
        return '';
    }

    return {
        init,
        autoPostAll,
        autoPostOne,
        watchBotPostComments,
        generatePost,
        publishPost,
        replyToComment,
        isBotUser,
        getBotBadge,
        BOT_CHARACTERS
    };
})();
