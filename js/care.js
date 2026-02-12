// ===== care.js v1.0 - 크라우니케어: 가족돌봄/건강관리/SOS/케어모드UI =====
// IIFE 패턴

window.CARE = (function() {
    'use strict';

    // ========== STATE ==========
    let careGroup = null;
    let careGroupId = null;
    let careRole = null; // 'guardian' | 'member'
    let clockInterval = null;
    let slideshowInterval = null;
    let slideshowPhotos = [];
    let slideshowIndex = 0;
    let medicationListeners = [];

    const QUICK_REPLIES = [
        { emoji: '😊', text: '좋아요' },
        { emoji: '🙏', text: '고마워' },
        { emoji: '❤️', text: '사랑해' },
        { emoji: '👍', text: '알겠어' },
        { emoji: '🍚', text: '밥먹었어' },
        { emoji: '💊', text: '약먹었어' }
    ];

    // ========== INIT ==========
    function init() {
        if (!currentUser) return;
        startClock();
        loadCareGroup();
    }

    // ========== CLOCK ==========
    function startClock() {
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    function updateClock() {
        const el = document.getElementById('care-clock');
        if (!el) return;
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;

        const dateEl = document.getElementById('care-date');
        if (dateEl) {
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
        }
    }

    // ========== CARE GROUP ==========
    async function loadCareGroup() {
        if (!currentUser) return;
        try {
            // Find group where user is a member
            const snap = await db.collection('care_groups')
                .where('memberUids', 'array-contains', currentUser.uid)
                .limit(1).get();

            if (!snap.empty) {
                careGroupId = snap.docs[0].id;
                careGroup = snap.docs[0].data();
                const me = (careGroup.members || []).find(m => m.uid === currentUser.uid);
                careRole = me ? me.role : 'member';
                renderCareHome();
                loadMessages();
                loadSchedules();
                loadMedications();
                loadPhotos();
            } else {
                renderNoGroup();
            }
        } catch(e) {
            console.error('Care group load error:', e);
            renderNoGroup();
        }
    }

    // ========== RENDER: NO GROUP ==========
    function renderNoGroup() {
        const c = document.getElementById('care-content');
        if (!c) return;
        c.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem;">
                <div style="font-size:4rem; margin-bottom:1rem;">💝</div>
                <h2 style="font-size:1.8rem; margin-bottom:1rem;">${t('care.welcome','크라우니케어에 오신 것을 환영합니다')}</h2>
                <p style="font-size:1.2rem; color:#666; margin-bottom:2rem;">${t('care.no_group','가족 그룹을 만들거나 초대를 받아 시작하세요')}</p>
                <button onclick="CARE.showCreateGroup()" class="care-btn care-btn-primary" style="font-size:1.2rem; padding:1rem 2rem;">
                    👨‍👩‍👧‍👦 ${t('care.create_group','가족 그룹 만들기')}
                </button>
            </div>`;
    }

    // ========== CREATE GROUP ==========
    async function showCreateGroup() {
        const name = await showPromptModal(
            t('care.create_group','가족 그룹 만들기'),
            t('care.group_name_prompt','그룹 이름을 입력하세요 (예: 우리 가족)'),
            ''
        );
        if (!name) return;

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : (currentUser.displayName || currentUser.email);

            const ref = await db.collection('care_groups').add({
                name: name,
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                memberUids: [currentUser.uid],
                members: [{
                    uid: currentUser.uid,
                    email: currentUser.email,
                    nickname: nickname,
                    role: 'guardian',
                    joinedAt: new Date().toISOString()
                }]
            });
            careGroupId = ref.id;
            showToast(t('care.group_created','가족 그룹이 생성되었습니다! 🎉'));
            loadCareGroup();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류가 발생했습니다'), 'error');
        }
    }

    // ========== INVITE MEMBER ==========
    async function inviteMember() {
        const email = await showPromptModal(
            t('care.invite','가족 초대'),
            t('care.invite_prompt','초대할 가족의 이메일을 입력하세요'),
            ''
        );
        if (!email) return;

        const roleChoice = await showPromptModal(
            t('care.role_select','역할 선택'),
            t('care.role_prompt','guardian(보호자) 또는 member(피보호자)를 입력하세요'),
            'member'
        );
        const role = (roleChoice === 'guardian') ? 'guardian' : 'member';

        try {
            // Find user by email
            const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
            if (userSnap.empty) {
                showToast(t('care.user_not_found','해당 이메일의 사용자를 찾을 수 없습니다'), 'error');
                return;
            }
            const invitedUser = userSnap.docs[0];
            const invitedData = invitedUser.data();

            // Check already member
            if ((careGroup.memberUids || []).includes(invitedUser.id)) {
                showToast(t('care.already_member','이미 그룹에 속해 있습니다'), 'error');
                return;
            }

            await db.collection('care_groups').doc(careGroupId).update({
                memberUids: firebase.firestore.FieldValue.arrayUnion(invitedUser.id),
                members: firebase.firestore.FieldValue.arrayUnion({
                    uid: invitedUser.id,
                    email: email,
                    nickname: invitedData.nickname || email,
                    role: role,
                    joinedAt: new Date().toISOString()
                })
            });

            // Send notification
            await db.collection('notifications').add({
                userId: invitedUser.id,
                type: 'care_invite',
                message: `💝 ${careGroup.name} 가족 그룹에 초대되었습니다`,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast(t('care.invited','초대가 완료되었습니다! 💝'));
            loadCareGroup();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류가 발생했습니다'), 'error');
        }
    }

    // ========== RENDER: CARE HOME ==========
    function renderCareHome() {
        const c = document.getElementById('care-content');
        if (!c) return;

        const membersHtml = (careGroup.members || []).map(m =>
            `<span class="care-member-tag ${m.role === 'guardian' ? 'guardian' : 'member-tag'}">${m.role === 'guardian' ? '🛡️' : '💛'} ${m.nickname}</span>`
        ).join('');

        c.innerHTML = `
            <!-- Clock -->
            <div class="care-clock-wrap">
                <div id="care-clock" class="care-clock">00:00:00</div>
                <div id="care-date" class="care-date"></div>
            </div>

            <!-- Group Info -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <h3 style="margin:0; font-size:1.4rem;">👨‍👩‍👧‍👦 ${careGroup.name}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.inviteMember()" class="care-btn care-btn-small">➕ ${t('care.invite_short','초대')}</button>` : ''}
                </div>
                <div style="margin-top:0.8rem; display:flex; flex-wrap:wrap; gap:0.5rem;">${membersHtml}</div>
            </div>

            <!-- SOS Button -->
            <div style="text-align:center; margin:1.5rem 0;">
                <button onclick="CARE.triggerSOS()" class="care-sos-btn">
                    🆘 SOS
                    <span style="display:block; font-size:1rem; margin-top:0.3rem;">${t('care.sos_label','긴급 호출')}</span>
                </button>
            </div>

            <!-- Messages -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">💬 ${t('care.messages','가족 메시지')}</h3>
                    <button onclick="CARE.showSendMessage()" class="care-btn care-btn-small">✏️ ${t('care.write','쓰기')}</button>
                </div>
                <div id="care-messages" style="margin-top:1rem;"></div>
                <!-- Quick Reply -->
                <div class="care-quick-replies">
                    ${QUICK_REPLIES.map(q => `<button onclick="CARE.sendQuickReply('${q.emoji} ${q.text}')" class="care-quick-btn">${q.emoji}<br><span>${q.text}</span></button>`).join('')}
                </div>
            </div>

            <!-- Today Schedule -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">📅 ${t('care.schedule','오늘의 일정')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddSchedule()" class="care-btn care-btn-small">➕</button>` : ''}
                </div>
                <div id="care-schedules" style="margin-top:1rem;"></div>
            </div>

            <!-- Medications -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">💊 ${t('care.medications','약 복용')}</h3>
                    ${careRole === 'guardian' ? `<button onclick="CARE.showAddMedication()" class="care-btn care-btn-small">➕</button>` : ''}
                </div>
                <div id="care-medications" style="margin-top:1rem;"></div>
            </div>

            <!-- Health Log -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">❤️‍🩹 ${t('care.health','건강 기록')}</h3>
                    <button onclick="CARE.showAddHealthLog()" class="care-btn care-btn-small">➕ ${t('care.record','기록')}</button>
                </div>
                <div id="care-health-logs" style="margin-top:1rem;"></div>
            </div>

            <!-- Photo Slideshow -->
            <div class="care-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.3rem;">📸 ${t('care.photos','가족 사진')}</h3>
                    <button onclick="CARE.uploadPhoto()" class="care-btn care-btn-small">📷 ${t('care.upload','업로드')}</button>
                </div>
                <div id="care-slideshow" class="care-slideshow"></div>
            </div>

            <!-- Smart Board Link -->
            <div style="text-align:center; margin:2rem 0 1rem;">
                <a href="#page=care-board" onclick="CARE.openSmartBoard(); return false;" class="care-btn care-btn-primary" style="display:inline-block; text-decoration:none; font-size:1.1rem; padding:1rem 2rem;">
                    🖥️ ${t('care.smartboard','스마트보드 모드')}
                </a>
            </div>
        `;

        updateClock();
        loadHealthLogs();
    }

    // ========== MESSAGES ==========
    async function loadMessages() {
        if (!careGroupId) return;
        const el = document.getElementById('care-messages');
        if (!el) return;

        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('messages').orderBy('createdAt', 'desc').limit(3).get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#999; font-size:1.1rem; text-align:center;">${t('care.no_messages','아직 메시지가 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const msg = d.data();
                const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) : '';
                return `<div class="care-message-card">
                    <div style="font-weight:700; font-size:1.1rem;">${msg.senderName || '가족'}</div>
                    <div style="font-size:1.3rem; margin:0.5rem 0;">${msg.text}</div>
                    <div style="color:#999; font-size:0.9rem;">${time}</div>
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showSendMessage() {
        const text = await showPromptModal(
            t('care.send_message','메시지 보내기'),
            t('care.message_prompt','가족에게 보낼 메시지를 입력하세요'),
            ''
        );
        if (!text) return;

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('messages').add({
                text: text,
                senderId: currentUser.uid,
                senderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Notify other members
            for (const m of careGroup.members) {
                if (m.uid !== currentUser.uid) {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_message',
                        message: `💝 ${nickname}: ${text}`,
                        read: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            showToast(t('care.message_sent','메시지를 보냈습니다 💝'));
            loadMessages();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function sendQuickReply(text) {
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('messages').add({
                text: text,
                senderId: currentUser.uid,
                senderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(`${text} 전송! 💝`);
            loadMessages();
        } catch(e) {
            console.error(e);
        }
    }

    // ========== SCHEDULES ==========
    async function loadSchedules() {
        if (!careGroupId) return;
        const el = document.getElementById('care-schedules');
        if (!el) return;

        try {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('schedules').orderBy('time', 'asc').get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#999; font-size:1.1rem; text-align:center;">${t('care.no_schedule','등록된 일정이 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const s = d.data();
                const now = new Date();
                const [hh, mm] = (s.time || '00:00').split(':');
                const schedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hh), parseInt(mm));
                const isPast = now > schedTime;
                return `<div class="care-schedule-item ${isPast ? 'past' : ''}">
                    <span class="care-schedule-time">${s.time}</span>
                    <span class="care-schedule-label">${s.icon || '📌'} ${s.title}</span>
                    ${careRole === 'guardian' ? `<button onclick="CARE.deleteSchedule('${d.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">🗑️</button>` : ''}
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddSchedule() {
        const title = await showPromptModal(t('care.add_schedule','일정 추가'), t('care.schedule_title_prompt','일정 제목 (예: 🚶 산책)'), '');
        if (!title) return;
        const time = await showPromptModal(t('care.schedule_time','시간'), t('care.time_prompt','시간을 입력하세요 (예: 09:00)'), '09:00');
        if (!time) return;

        try {
            await db.collection('care_groups').doc(careGroupId).collection('schedules').add({
                title: title,
                time: time,
                icon: title.match(/\p{Emoji}/u)?.[0] || '📌',
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.schedule_added','일정이 추가되었습니다 📅'));
            loadSchedules();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function deleteSchedule(id) {
        if (!confirm(t('care.delete_confirm','삭제하시겠습니까?'))) return;
        try {
            await db.collection('care_groups').doc(careGroupId).collection('schedules').doc(id).delete();
            showToast(t('common.delete','삭제됨'));
            loadSchedules();
        } catch(e) { console.error(e); }
    }

    // ========== MEDICATIONS ==========
    async function loadMedications() {
        if (!careGroupId) return;
        const el = document.getElementById('care-medications');
        if (!el) return;

        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('medications').orderBy('time', 'asc').get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#999; font-size:1.1rem; text-align:center;">${t('care.no_meds','등록된 약이 없습니다')}</p>`;
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            el.innerHTML = snap.docs.map(d => {
                const med = d.data();
                const taken = med.takenDates && med.takenDates.includes(today);
                return `<div class="care-med-item ${taken ? 'taken' : ''}">
                    <div>
                        <div style="font-weight:700; font-size:1.2rem;">💊 ${med.name}</div>
                        <div style="color:#666; font-size:1rem;">⏰ ${med.time} · ${med.repeat || '매일'}</div>
                    </div>
                    ${taken
                        ? `<span class="care-med-done">✅ ${t('care.taken','복용완료')}</span>`
                        : `<button onclick="CARE.confirmMedication('${d.id}')" class="care-btn care-btn-med">💊 ${t('care.take','복용확인')}</button>`
                    }
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddMedication() {
        const name = await showPromptModal(t('care.add_med','약 추가'), t('care.med_name_prompt','약 이름을 입력하세요'), '');
        if (!name) return;
        const time = await showPromptModal(t('care.med_time','복용 시간'), t('care.time_prompt','시간을 입력하세요 (예: 08:00)'), '08:00');
        if (!time) return;

        try {
            await db.collection('care_groups').doc(careGroupId).collection('medications').add({
                name: name,
                time: time,
                repeat: '매일',
                takenDates: [],
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.med_added','약이 등록되었습니다 💊'));
            loadMedications();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    async function confirmMedication(medId) {
        const today = new Date().toISOString().split('T')[0];
        try {
            await db.collection('care_groups').doc(careGroupId).collection('medications').doc(medId).update({
                takenDates: firebase.firestore.FieldValue.arrayUnion(today)
            });

            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            // Notify guardians
            for (const m of careGroup.members) {
                if (m.role === 'guardian' && m.uid !== currentUser.uid) {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_medication',
                        message: `💊 ${nickname}님이 약을 복용했습니다`,
                        read: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            showToast(t('care.med_confirmed','복용 확인! 💊✅'));
            loadMedications();
        } catch(e) {
            console.error(e);
        }
    }

    // ========== HEALTH LOGS ==========
    async function loadHealthLogs() {
        if (!careGroupId) return;
        const el = document.getElementById('care-health-logs');
        if (!el) return;

        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('health_logs').orderBy('createdAt', 'desc').limit(5).get();

            if (snap.empty) {
                el.innerHTML = `<p style="color:#999; font-size:1.1rem; text-align:center;">${t('care.no_health','기록이 없습니다')}</p>`;
                return;
            }

            el.innerHTML = snap.docs.map(d => {
                const h = d.data();
                const date = h.createdAt ? new Date(h.createdAt.toDate()).toLocaleDateString('ko-KR') : '';
                const items = [];
                if (h.bloodPressure) items.push(`🩸 혈압: ${h.bloodPressure}`);
                if (h.temperature) items.push(`🌡️ 체온: ${h.temperature}°C`);
                if (h.bloodSugar) items.push(`💉 혈당: ${h.bloodSugar}`);
                if (h.weight) items.push(`⚖️ 체중: ${h.weight}kg`);
                return `<div class="care-health-card">
                    <div style="font-weight:700;">${h.recorderName || ''} · ${date}</div>
                    <div style="margin-top:0.5rem; font-size:1.1rem;">${items.join(' &nbsp;|&nbsp; ')}</div>
                </div>`;
            }).join('');
        } catch(e) {
            console.error(e);
        }
    }

    async function showAddHealthLog() {
        // Simple multi-step
        const bp = await showPromptModal('🩸 혈압', '혈압을 입력하세요 (예: 120/80, 없으면 빈칸)', '');
        const temp = await showPromptModal('🌡️ 체온', '체온을 입력하세요 (예: 36.5, 없으면 빈칸)', '');
        const sugar = await showPromptModal('💉 혈당', '혈당을 입력하세요 (없으면 빈칸)', '');
        const weight = await showPromptModal('⚖️ 체중', '체중을 입력하세요 (kg, 없으면 빈칸)', '');

        if (!bp && !temp && !sugar && !weight) {
            showToast(t('care.no_data','입력된 데이터가 없습니다'), 'error');
            return;
        }

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            await db.collection('care_groups').doc(careGroupId).collection('health_logs').add({
                bloodPressure: bp || null,
                temperature: temp ? parseFloat(temp) : null,
                bloodSugar: sugar || null,
                weight: weight ? parseFloat(weight) : null,
                recorderId: currentUser.uid,
                recorderName: nickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(t('care.health_saved','건강 기록이 저장되었습니다 ❤️‍🩹'));
            loadHealthLogs();
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    // ========== SOS ==========
    async function triggerSOS() {
        const confirmed = await showConfirm(
            t('care.sos_confirm_title','🆘 긴급 호출'),
            t('care.sos_confirm','정말 긴급 호출을 보내시겠습니까? 모든 보호자에게 알림이 전송됩니다.')
        );
        if (!confirmed) return;

        let location = null;
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch(e) {
            console.warn('Location unavailable:', e);
        }

        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const nickname = userDoc.exists ? userDoc.data().nickname : currentUser.email;

            // Save SOS record
            await db.collection('care_groups').doc(careGroupId).collection('sos_logs').add({
                senderId: currentUser.uid,
                senderName: nickname,
                location: location,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Notify all guardians
            for (const m of careGroup.members) {
                if (m.uid !== currentUser.uid) {
                    await db.collection('notifications').add({
                        userId: m.uid,
                        type: 'care_sos',
                        message: `🆘 긴급! ${nickname}님이 SOS를 호출했습니다!${location ? ` (위치: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})` : ''}`,
                        read: false,
                        priority: 'urgent',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            showToast(t('care.sos_sent','🆘 긴급 호출이 전송되었습니다!'), 'error');
        } catch(e) {
            console.error(e);
            showToast(t('common.error','오류'), 'error');
        }
    }

    // ========== PHOTOS ==========
    async function loadPhotos() {
        if (!careGroupId) return;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('photos').orderBy('createdAt', 'desc').limit(20).get();

            slideshowPhotos = snap.docs.map(d => d.data());
            renderSlideshow();
        } catch(e) {
            console.error(e);
        }
    }

    function renderSlideshow() {
        const el = document.getElementById('care-slideshow');
        if (!el) return;
        if (slideshowPhotos.length === 0) {
            el.innerHTML = `<p style="color:#999; text-align:center; padding:2rem;">${t('care.no_photos','아직 사진이 없습니다 📸')}</p>`;
            return;
        }
        const photo = slideshowPhotos[slideshowIndex % slideshowPhotos.length];
        el.innerHTML = `
            <div class="care-photo-frame">
                <img src="${photo.url}" alt="${photo.caption || ''}" style="width:100%; max-height:400px; object-fit:cover; border-radius:12px;">
                ${photo.caption ? `<p style="text-align:center; margin-top:0.5rem; font-size:1.1rem; color:#666;">${photo.caption}</p>` : ''}
            </div>
            ${slideshowPhotos.length > 1 ? `<div style="text-align:center; margin-top:0.5rem;">
                <button onclick="CARE.prevPhoto()" class="care-btn care-btn-small">◀</button>
                <span style="margin:0 1rem; color:#999;">${(slideshowIndex % slideshowPhotos.length) + 1} / ${slideshowPhotos.length}</span>
                <button onclick="CARE.nextPhoto()" class="care-btn care-btn-small">▶</button>
            </div>` : ''}`;
    }

    function prevPhoto() { slideshowIndex = (slideshowIndex - 1 + slideshowPhotos.length) % slideshowPhotos.length; renderSlideshow(); }
    function nextPhoto() { slideshowIndex = (slideshowIndex + 1) % slideshowPhotos.length; renderSlideshow(); }

    function uploadPhoto() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const resized = await resizeImage(ev.target.result, 1200);
                    const caption = await showPromptModal('📸 사진 설명', '사진에 대한 설명을 입력하세요 (선택)', '');

                    await db.collection('care_groups').doc(careGroupId).collection('photos').add({
                        url: resized,
                        caption: caption || '',
                        uploaderId: currentUser.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    showToast(t('care.photo_uploaded','사진이 업로드되었습니다 📸'));
                    loadPhotos();
                } catch(e) {
                    console.error(e);
                    showToast(t('common.error','오류'), 'error');
                }
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ========== SMART BOARD ==========
    function openSmartBoard() {
        history.pushState(null, '', '#page=care-board');
        renderSmartBoard();
    }

    function renderSmartBoard() {
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('.main-content').style.marginLeft = '0';

        const main = document.querySelector('.main-content');
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Create or show board
        let board = document.getElementById('care-board');
        if (!board) {
            board = document.createElement('section');
            board.id = 'care-board';
            board.className = 'page care-board-fullscreen';
            main.appendChild(board);
        }
        board.classList.add('active');

        const bgPhoto = slideshowPhotos.length > 0 ? slideshowPhotos[0].url : '';

        board.innerHTML = `
            <div class="care-board-bg" ${bgPhoto ? `style="background-image:url(${bgPhoto})"` : ''}>
                <div class="care-board-overlay">
                    <button onclick="CARE.exitSmartBoard()" class="care-board-exit">✕</button>
                    <div class="care-board-clock" id="care-board-clock">00:00</div>
                    <div class="care-board-date" id="care-board-date"></div>
                    <div id="care-board-messages" class="care-board-messages"></div>
                    <div id="care-board-schedule" class="care-board-schedule"></div>
                    <button onclick="CARE.triggerSOS()" class="care-sos-btn" style="margin-top:2rem;">
                        🆘 SOS
                    </button>
                </div>
            </div>`;

        // Update board clock
        updateBoardClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateBoardClock, 1000);

        // Load board messages
        loadBoardMessages();
        loadBoardSchedule();

        // Slideshow
        if (slideshowPhotos.length > 1) {
            if (slideshowInterval) clearInterval(slideshowInterval);
            let idx = 0;
            slideshowInterval = setInterval(() => {
                idx = (idx + 1) % slideshowPhotos.length;
                const bg = document.querySelector('.care-board-bg');
                if (bg) bg.style.backgroundImage = `url(${slideshowPhotos[idx].url})`;
            }, 10000);
        }
    }

    function updateBoardClock() {
        const el = document.getElementById('care-board-clock');
        if (!el) return;
        const now = new Date();
        el.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const dateEl = document.getElementById('care-board-date');
        if (dateEl) {
            const days = ['일','월','화','수','목','금','토'];
            dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
        }
    }

    async function loadBoardMessages() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-messages');
        if (!el) return;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('messages').orderBy('createdAt','desc').limit(3).get();
            el.innerHTML = snap.docs.map(d => {
                const m = d.data();
                return `<div class="care-board-msg">${m.senderName}: ${m.text}</div>`;
            }).join('');
        } catch(e) {}
    }

    async function loadBoardSchedule() {
        if (!careGroupId) return;
        const el = document.getElementById('care-board-schedule');
        if (!el) return;
        try {
            const snap = await db.collection('care_groups').doc(careGroupId)
                .collection('schedules').orderBy('time','asc').get();
            el.innerHTML = snap.docs.map(d => {
                const s = d.data();
                return `<div class="care-board-sched">${s.time} ${s.icon || '📌'} ${s.title}</div>`;
            }).join('');
        } catch(e) {}
    }

    function exitSmartBoard() {
        if (slideshowInterval) clearInterval(slideshowInterval);
        document.getElementById('sidebar').style.display = '';
        document.querySelector('.main-content').style.marginLeft = '';
        const board = document.getElementById('care-board');
        if (board) board.classList.remove('active');
        showPage('care');
    }

    // ========== HASH ROUTING ==========
    function checkHash() {
        if (location.hash === '#page=care-board') {
            if (currentUser) {
                loadCareGroup().then(() => renderSmartBoard());
            }
        }
    }

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
        if (location.hash === '#page=care-board') {
            CARE.openSmartBoard();
        }
    });

    // ========== PUBLIC API ==========
    return {
        init,
        showCreateGroup,
        inviteMember,
        triggerSOS,
        showSendMessage,
        sendQuickReply,
        showAddSchedule,
        deleteSchedule,
        showAddMedication,
        confirmMedication,
        showAddHealthLog,
        uploadPhoto,
        prevPhoto,
        nextPhoto,
        openSmartBoard,
        exitSmartBoard,
        checkHash
    };
})();
