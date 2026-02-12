// ===== admin.js - 관리자 패널 (레벨/탭/오프체인/온체인/챌린지/회원/기부풀/로그) =====
// ========== ADMIN FUNCTIONS ==========
async function loadTransferRequests() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') return;
    
    const requests = await db.collection('transfer_requests')
        .where('status', '==', 'pending')
        .orderBy('requestedAt', 'desc')
        .get();
    
    console.log('Transfer requests:', requests.size);
    
    requests.forEach(doc => {
        const req = doc.data();
        console.log(`Request: ${req.fromEmail} → ${req.toEmail}: ${req.amount} ${req.token}`);
    });
}

async function adminMintTokens() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') {
        alert(t('admin.admin_only','관리자만 사용 가능합니다'));
        return;
    }
    
    const email = document.getElementById('admin-recipient')?.value;
    const token = document.getElementById('admin-token')?.value || 'CRNY';
    const amount = parseFloat(document.getElementById('admin-amount')?.value || 0);
    
    if (!email || amount <= 0) {
        alert(t('admin.enter_email_amount','이메일과 수량을 입력하세요'));
        return;
    }
    
    const users = await db.collection('users').where('email', '==', email).get();
    
    if (users.empty) {
        alert(t('social.user_not_found','사용자를 찾을 수 없습니다'));
        return;
    }
    
    const userDoc = users.docs[0];
    const userData = userDoc.data();
    const tokenKey = token.toLowerCase();
    
    await db.collection('users').doc(userDoc.id).update({
        [`balances.${tokenKey}`]: userData.balances[tokenKey] + amount
    });
    
    await db.collection('transactions').add({
        from: 'admin',
        to: userDoc.id,
        amount: amount,
        token: token,
        type: 'mint',
        timestamp: new Date()
    });
    
    alert(`✅ ${amount} ${token} 발급 완료!`);
    
    if (document.getElementById('admin-recipient')) {
        document.getElementById('admin-recipient').value = '';
        document.getElementById('admin-amount').value = '';
    }
}

// ========== 관리자 기능: 강제 청산/중단 ==========
// ========== 다단계 관리자 시스템 (계층형 임명) ==========
// 레벨 6: 수퍼관리자 — 토큰 발행/차감, 쿼터 설정, Lv5 임명 (무제한)
// 레벨 5: 국가관리자 — Lv4 임명 (쿼터 내), 온·오프체인, 챌린지
// 레벨 4: 사업관리자 — Lv3 임명 (쿼터 내), 온·오프체인, 챌린지
// 레벨 3: 서비스관리자 — Lv2 임명 (쿼터 내), 오프체인(조회), 챌린지
// 레벨 2: 운영관리자 — 오프체인(조회만), 발행/차감 불가
// 레벨 1: CS관리자 — 읽기 전용
// 레벨 0: 정회원
// 레벨 -1: 일반회원

const SUPER_ADMIN_EMAIL = 'kim.president.sk@gmail.com';
const ADMIN_EMAIL = SUPER_ADMIN_EMAIL; // 하위 호환

const ADMIN_LEVELS = {
    6: { name: t('admin.level.super','수퍼관리자'), icon: '👑', color: '#FFD700' },
    5: { name: t('admin.level.country','국가관리자'), icon: '🌍', color: '#9C27B0' },
    4: { name: t('admin.level.business','사업관리자'), icon: '💼', color: '#2196F3' },
    3: { name: t('admin.level.service','서비스관리자'), icon: '🔧', color: '#FF9800' },
    2: { name: t('admin.level.ops','운영관리자'), icon: '📝', color: '#4CAF50' },
    1: { name: t('admin.level.cs','CS관리자'), icon: '💬', color: '#607D8B' },
    0: { name: t('admin.level.member','정회원'), icon: '⭐', color: '#795548' },
    '-1': { name: t('admin.level.basic','일반회원'), icon: '👤', color: '#9E9E9E' }
};

// 현재 사용자 레벨 캐시
let currentUserLevel = -1;

// 사용자 레벨 로드 (Firestore에서)
async function loadUserLevel() {
    if (!currentUser) { currentUserLevel = -1; return; }
    
    // 수퍼관리자는 항상 레벨 6
    if (currentUser.email === SUPER_ADMIN_EMAIL) {
        currentUserLevel = 6;
        return;
    }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            currentUserLevel = userDoc.data().adminLevel ?? -1;
        }
    } catch (e) {
        console.error('레벨 로드 실패:', e);
        currentUserLevel = -1;
    }
}

// 권한 체크 함수들
function isAdmin() {
    return currentUserLevel >= 1;
}

function isSuperAdmin() {
    return currentUserLevel >= 6;
}

function hasLevel(minLevel) {
    return currentUserLevel >= minLevel;
}

function getLevelInfo(level) {
    return ADMIN_LEVELS[level] || ADMIN_LEVELS['-1'];
}

// 관리자 레벨 변경 — 계층형 임명 시스템
// 수퍼(6): Lv5까지 임명, 쿼터 무제한
// Lv5: Lv4 임명 (쿼터 내)
// Lv4: Lv3 임명 (쿼터 내)
// Lv3: Lv2 임명 (쿼터 내)
async function setUserAdminLevel(targetEmail, level) {
    if (targetEmail === SUPER_ADMIN_EMAIL) {
        showToast(t('admin.cant_change_super','수퍼관리자는 변경할 수 없습니다'), 'warning');
        return;
    }
    
    if (level < -1 || level > 5) {
        showToast(t('admin.level_range','레벨 범위: -1 ~ 5'), 'warning');
        return;
    }
    
    // ★ 권한 체크: 자기보다 1단계 아래까지만 임명 가능 (수퍼는 5까지)
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    if (level > maxAppointLevel) {
        showToast(`⛔ 권한 부족 — 최대 임명: Lv${maxAppointLevel}, 요청: Lv${level}`, 'error');
        return;
    }
    
    // 강등은 자기 레벨 미만만 가능 (수퍼는 전부)
    if (!isSuperAdmin()) {
        // 대상의 현재 레벨 확인
        const users = await db.collection('users').where('email', '==', targetEmail).get();
        if (users.empty) { showToast('사용자를 찾을 수 없습니다: ' + targetEmail, 'error'); return; }
        const targetLevel = users.docs[0].data().adminLevel ?? -1;
        if (targetLevel >= currentUserLevel) {
            showToast(`⛔ 동급 이상 관리자는 변경할 수 없습니다 (대상: Lv${targetLevel})`, 'error');
            return;
        }
    }
    
    // ★ 쿼터 체크 (승급인 경우)
    if (level >= 1) {
        const quotaOk = await checkAdminQuota(level);
        if (!quotaOk) return;
        
        const personalOk = await checkPersonalQuota(level);
        if (!personalOk) return;
    }
    
    try {
        const users = await db.collection('users').where('email', '==', targetEmail).get();
        if (users.empty) {
            showToast('사용자를 찾을 수 없습니다: ' + targetEmail, 'error');
            return;
        }
        
        const targetDoc = users.docs[0];
        const targetData = targetDoc.data();
        const prevLevel = targetData.adminLevel ?? -1;
        
        const updateData = { 
            adminLevel: level,
            appointedBy: currentUser.email,
            appointedByLevel: currentUserLevel,
            appointedAt: new Date()
        };
        // Preserve existing admin assignment fields (normalize to arrays)
        if (targetData.adminCountry) updateData.adminCountry = normalizeToArray(targetData.adminCountry);
        if (targetData.adminBusiness) updateData.adminBusiness = normalizeToArray(targetData.adminBusiness);
        if (targetData.adminService) updateData.adminService = normalizeToArray(targetData.adminService);
        if (targetData.adminStartDate) updateData.adminStartDate = targetData.adminStartDate;
        if (targetData.adminEndDate !== undefined) updateData.adminEndDate = targetData.adminEndDate;
        
        await targetDoc.ref.update(updateData);
        
        const info = getLevelInfo(level);
        
        await db.collection('admin_log').add({
            action: 'set_admin_level',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: targetEmail,
            prevLevel: prevLevel,
            newLevel: level,
            levelName: info.name,
            timestamp: new Date()
        });
        
        showToast(`✅ ${targetEmail} → ${info.icon} ${info.name} (Lv${level})`, 'success');
        loadAdminUserList();
    } catch (error) {
        showToast('권한 변경 실패: ' + error.message, 'error');
    }
}

// ★ 배열 정규화 헬퍼: 문자열이면 배열로 변환, 빈값이면 빈 배열
function normalizeToArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(v => v && v !== 'ALL');
    if (typeof val === 'string' && val !== 'ALL') return [val];
    return [];
}

// ★ 체크박스 그리드 HTML 생성
function buildCheckboxGrid(name, options, selectedArr) {
    return options.map(o => {
        const checked = selectedArr.includes(o.v) ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:0.2rem;padding:0.25rem 0.5rem;background:${checked ? '#e3f2fd' : '#f5f5f5'};border-radius:6px;cursor:pointer;font-size:0.78rem;border:1px solid ${checked ? '#90caf9' : '#ddd'};transition:all 0.15s;">
            <input type="checkbox" name="${name}" value="${o.v}" ${checked} style="margin:0;accent-color:#1565c0;"> ${o.l}
        </label>`;
    }).join('');
}

// ★ 관리자 편집 모달 — 다중 선택 (체크박스 그리드)
async function showAdminEditModal(userId, userData) {
    const level = userData.adminLevel ?? -1;
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    const canEdit = (level < currentUserLevel || isSuperAdmin()) && userData.email !== SUPER_ADMIN_EMAIL;
    
    if (!canEdit) { showToast(t('admin.cant_edit','이 사용자를 편집할 수 없습니다'), 'warning'); return; }
    
    let levelOptions = '';
    for (let lv = -1; lv <= maxAppointLevel; lv++) {
        const info = getLevelInfo(lv);
        levelOptions += `<option value="${lv}" ${lv === level ? 'selected' : ''}>${lv} ${info.name} ${info.icon}</option>`;
    }
    
    const countries = [
        {v:'KR',l:'🇰🇷 한국'},{v:'US',l:'🇺🇸 미국'},{v:'JP',l:'🇯🇵 일본'},{v:'CN',l:'🇨🇳 중국'},{v:'VN',l:'🇻🇳 베트남'},{v:'TH',l:'🇹🇭 태국'},{v:'PH',l:'🇵🇭 필리핀'},{v:'ID',l:'🇮🇩 인도네시아'},{v:'MY',l:'🇲🇾 말레이시아'},{v:'SG',l:'🇸🇬 싱가포르'},{v:'AU',l:'🇦🇺 호주'},{v:'UK',l:'🇬🇧 영국'},{v:'DE',l:'🇩🇪 독일'},{v:'FR',l:'🇫🇷 프랑스'},{v:'CA',l:'🇨🇦 캐나다'},{v:'OTHER',l:'기타'}
    ];
    const businesses = [
        {v:'trading',l:'📊 트레이딩'},{v:'marketplace',l:'🛒 마켓플레이스'},{v:'energy',l:'🌱 에너지'},{v:'art',l:'🎭 아트/NFT'},{v:'fundraise',l:'💰 펀드레이즈'},{v:'credit',l:'💳 크레딧'},{v:'social',l:'💬 소셜'},{v:'messenger',l:'📨 메신저'},{v:'beauty',l:'💄 뷰티'},{v:'sound',l:'🎵 음향'},{v:'it',l:'💻 IT'},{v:'fnb',l:'🍽️ F&B'},{v:'edu',l:'📚 교육'},{v:'health',l:'🏥 헬스'}
    ];
    const services = [
        {v:'prop-trading',l:'프랍 트레이딩'},{v:'mall',l:'Mall'},{v:'art-gallery',l:'Art'},{v:'nft-mint',l:'NFT'},{v:'energy-invest',l:'Energy'},{v:'fundraise-campaign',l:'Fundraise'},{v:'p2p-credit',l:'Credit'},{v:'social',l:'Social'},{v:'books',l:'도서'},{v:'business',l:'비즈니스'},{v:'trading',l:'Trading'}
    ];
    
    const curCountry = normalizeToArray(userData.adminCountry);
    const curBusiness = normalizeToArray(userData.adminBusiness);
    const curService = normalizeToArray(userData.adminService);
    const curStart = userData.adminStartDate ? (userData.adminStartDate.toDate ? userData.adminStartDate.toDate() : new Date(userData.adminStartDate)) : new Date();
    const curEnd = userData.adminEndDate ? (userData.adminEndDate.toDate ? userData.adminEndDate.toDate() : new Date(userData.adminEndDate)) : null;
    
    const startStr = curStart.toISOString().slice(0,10);
    const endStr = curEnd ? curEnd.toISOString().slice(0,10) : '';
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';
    overlay.innerHTML = `
        <div style="background:white;padding:1.5rem;border-radius:16px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;">
            <h3 style="margin-bottom:0.3rem;">${t('admin.settings','🔑 관리자 설정')}</h3>
            <p style="font-size:0.85rem;color:#666;margin-bottom:1rem;">${userData.nickname || t('admin.unnamed','이름없음')} · ${userData.email}</p>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.3rem;">${t('admin.admin_level','관리자 레벨')}</label>
                <select id="edit-admin-level" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;">${levelOptions}</select>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.4rem;">🌍 담당 국가 <span style="font-size:0.7rem;color:#999;">(다중 선택)</span></label>
                <div id="edit-admin-country-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminCountry', countries, curCountry)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.4rem;">💼 담당 사업 <span style="font-size:0.7rem;color:#999;">(다중 선택)</span></label>
                <div id="edit-admin-business-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminBusiness', businesses, curBusiness)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.4rem;">🔧 담당 서비스 <span style="font-size:0.7rem;color:#999;">(다중 선택)</span></label>
                <div id="edit-admin-service-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminService', services, curService)}
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
                <div>
                    <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.3rem;">📅 시작일</label>
                    <input type="date" id="edit-admin-start" value="${startStr}" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:#666;display:block;margin-bottom:0.3rem;">📅 종료일 (비우면 무기한)</label>
                    <input type="date" id="edit-admin-end" value="${endStr}" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
                </div>
            </div>
            
            <div style="display:flex;gap:0.5rem;">
                <button id="edit-admin-save" style="flex:1;padding:0.7rem;background:#9C27B0;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','저장')}</button>
                <button id="edit-admin-cancel" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">${t('common.cancel','취소')}</button>
            </div>
        </div>`;
    
    document.body.appendChild(overlay);
    
    // 체크박스 토글 시 라벨 스타일 업데이트
    overlay.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const lbl = cb.closest('label');
            if (cb.checked) { lbl.style.background = '#e3f2fd'; lbl.style.borderColor = '#90caf9'; }
            else { lbl.style.background = '#f5f5f5'; lbl.style.borderColor = '#ddd'; }
        });
    });
    
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#edit-admin-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#edit-admin-save').onclick = async () => {
        const newLevel = parseInt(document.getElementById('edit-admin-level').value);
        const countryArr = [...overlay.querySelectorAll('input[name="adminCountry"]:checked')].map(c => c.value);
        const businessArr = [...overlay.querySelectorAll('input[name="adminBusiness"]:checked')].map(c => c.value);
        const serviceArr = [...overlay.querySelectorAll('input[name="adminService"]:checked')].map(c => c.value);
        const startDate = document.getElementById('edit-admin-start').value;
        const endDate = document.getElementById('edit-admin-end').value;
        
        if (newLevel >= 1 && newLevel > level) {
            const quotaOk = await checkAdminQuota(newLevel);
            if (!quotaOk) return;
            const personalOk = await checkPersonalQuota(newLevel);
            if (!personalOk) return;
        }
        
        try {
            const updateData = {
                adminLevel: newLevel,
                adminCountry: countryArr,
                adminBusiness: businessArr,
                adminService: serviceArr,
                adminStartDate: startDate ? firebase.firestore.Timestamp.fromDate(new Date(startDate)) : firebase.firestore.FieldValue.serverTimestamp(),
                appointedBy: currentUser.email,
                appointedByLevel: currentUserLevel,
                appointedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (endDate) {
                updateData.adminEndDate = firebase.firestore.Timestamp.fromDate(new Date(endDate + 'T23:59:59'));
            } else {
                updateData.adminEndDate = null;
            }
            
            await db.collection('users').doc(userId).update(updateData);
            
            const info = getLevelInfo(newLevel);
            await db.collection('admin_log').add({
                action: 'admin_edit',
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                targetEmail: userData.email,
                prevLevel: level,
                newLevel: newLevel,
                country: countryArr, business: businessArr, service: serviceArr,
                startDate: startDate || null,
                endDate: endDate || null,
                timestamp: new Date()
            });
            
            overlay.remove();
            const cLabel = countryArr.length ? countryArr.join(',') : t('common.all','전체');
            const bLabel = businessArr.length ? businessArr.join(',') : t('common.all','전체');
            const sLabel = serviceArr.length ? serviceArr.join(',') : t('common.all','전체');
            showToast(`✅ ${userData.email} → ${info.icon} Lv${newLevel} (${cLabel}/${bLabel}/${sLabel})`, 'success');
            loadAdminUserList();
        } catch (e) {
            showToast(t('admin.settings_fail','설정 실패: ') + e.message, 'error');
        }
    };
}

// ★ 전체 쿼터 체크 (해당 레벨의 총 관리자 수)
async function checkAdminQuota(level) {
    try {
        const configDoc = await db.collection('admin_config').doc('settings').get();
        const quotas = configDoc.exists ? (configDoc.data().quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const maxTotal = levelQuota.max || 999;
        
        // 현재 해당 레벨 관리자 수
        const current = await db.collection('users').where('adminLevel', '==', level).get();
        
        if (current.size >= maxTotal) {
            alert(`⛔ Lv${level} 쿼터 초과\n\n최대: ${maxTotal}명\n현재: ${current.size}명\n\n수퍼관리자에게 쿼터 증가를 요청하세요.`);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('쿼터 체크 실패 (허용):', e);
        return true;
    }
}

// ★ 개인 임명 쿼터 체크 (내가 임명한 해당 레벨 관리자 수)
async function checkPersonalQuota(level) {
    if (isSuperAdmin()) return true; // 수퍼는 무제한
    
    try {
        const configDoc = await db.collection('admin_config').doc('settings').get();
        const quotas = configDoc.exists ? (configDoc.data().quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const perAdmin = levelQuota.perAdmin || 999;
        
        // 내가 임명한 해당 레벨 수
        const myAppointed = await db.collection('users')
            .where('appointedBy', '==', currentUser.email)
            .where('adminLevel', '==', level)
            .get();
        
        if (myAppointed.size >= perAdmin) {
            alert(`⛔ 개인 임명 쿼터 초과\n\nLv${level} 최대 임명: ${perAdmin}명\n이미 임명: ${myAppointed.size}명`);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('개인 쿼터 체크 실패 (허용):', e);
        return true;
    }
}

// ★ 쿼터 설정 (수퍼관리자 전용)
async function saveAdminQuotas() {
    if (!isSuperAdmin()) { alert('수퍼관리자만 설정 가능합니다'); return; }
    
    const quotas = {};
    for (let lv = 1; lv <= 5; lv++) {
        const maxEl = document.getElementById(`quota-max-${lv}`);
        const perEl = document.getElementById(`quota-per-${lv}`);
        if (maxEl && perEl) {
            quotas[`level${lv}`] = {
                max: parseInt(maxEl.value) || 999,
                perAdmin: parseInt(perEl.value) || 999
            };
        }
    }
    
    try {
        await db.collection('admin_config').doc('settings').set({ quotas }, { merge: true });
        alert('✅ 관리자 쿼터 저장 완료');
        loadAdminUserList();
    } catch (e) {
        alert('저장 실패: ' + e.message);
    }
}

// ★ 관리자 현황 통계 로드
async function loadAdminStats() {
    const stats = {};
    for (let lv = 1; lv <= 5; lv++) {
        try {
            const q = await db.collection('users').where('adminLevel', '==', lv).get();
            stats[lv] = q.size;
        } catch (e) { stats[lv] = '?'; }
    }
    return stats;
}

// ========== 소개자(레퍼럴) 시스템 ==========

// 소개 코드 생성 (정회원 이상) — CR-XXXXXX 고유 ID
async function generateReferralCode() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        if (userData.referralCode) {
            const nick = userData.referralNickname || userData.nickname || '';
            const display = nick ? `${nick} (${userData.referralCode})` : userData.referralCode;
            alert(`이미 소개 코드가 있습니다: ${display}`);
            return userData.referralCode;
        }
        
        // CR-XXXXXX 형식 고유 코드 생성 (변경 불가)
        let code;
        let exists = true;
        while (exists) {
            const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
            code = 'CR-' + rand;
            const dup = await db.collection('users').where('referralCode', '==', code).get();
            exists = !dup.empty;
        }
        
        // 소개 닉네임 입력
        const nickname = await showPromptModal(
            t('social.referral_nick_title', '소개 닉네임 설정'),
            t('social.referral_nick_desc', '소개 코드와 함께 표시될 닉네임을 입력하세요:\n(나중에 변경 가능)'),
            userData.nickname || ''
        );
        
        await db.collection('users').doc(currentUser.uid).update({
            referralCode: code,
            referralNickname: (nickname || '').trim() || userData.nickname || '',
            referralCount: 0,
            referralEarnings: { crny: 0, fnc: 0, crfn: 0, crtd: 0, crac: 0, crgc: 0, creb: 0 }
        });
        
        const displayNick = (nickname || '').trim() || userData.nickname || '';
        const display = displayNick ? `${displayNick} (${code})` : code;
        alert(`✅ 소개 코드 생성: ${display}\n\n이 코드를 공유하세요!\n⚠️ 소개 코드(${code})는 변경할 수 없습니다.`);
        if (typeof loadReferralInfo === 'function') loadReferralInfo();
        return code;
    } catch (error) {
        alert('코드 생성 실패: ' + error.message);
    }
}

// 소개 코드로 가입 시 연결
async function applyReferralCode(newUserId, referralCode) {
    if (!referralCode) return;
    
    try {
        const referrers = await db.collection('users')
            .where('referralCode', '==', referralCode.toUpperCase()).get();
        
        if (referrers.empty) {
            console.log('⚠️ 유효하지 않은 소개 코드:', referralCode);
            return;
        }
        
        const referrer = referrers.docs[0];
        const referrerId = referrer.id;
        
        // 신규 사용자에 소개자 기록
        await db.collection('users').doc(newUserId).update({
            referredBy: referrerId,
            referredByEmail: referrer.data().email,
            referredByCode: referralCode.toUpperCase()
        });
        
        // 소개자 카운트 증가
        await referrer.ref.update({
            referralCount: (referrer.data().referralCount || 0) + 1
        });
        
        // ★ 소개자 보상 자동 지급 (Firestore 설정값 기반)
        await distributeSignupReferralReward(referrerId, newUserId, referrer.data().email);
        
        console.log(`✅ 소개 연결 + 보상 지급: ${referralCode} → 신규 사용자`);
    } catch (error) {
        console.error('소개 코드 적용 실패:', error);
    }
}

// ★ 회원가입 시 소개자 보상 자동 지급 (설정값 기반)
async function distributeSignupReferralReward(referrerId, newUserId, referrerEmail) {
    try {
        // Firestore에서 보상 설정 로드
        const configDoc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = configDoc.exists ? configDoc.data() : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        
        const referrerDoc = await db.collection('users').doc(referrerId).get();
        if (!referrerDoc.exists) return;
        const referrerData = referrerDoc.data();
        const off = referrerData.offchainBalances || {};
        const earnings = referrerData.referralEarnings || {};
        
        const updates = {};
        const tokenEntries = Object.entries(rewards).filter(([_, v]) => v > 0);
        
        for (const [token, amount] of tokenEntries) {
            updates[`offchainBalances.${token}`] = (off[token] || 0) + amount;
            updates[`referralEarnings.${token}`] = (earnings[token] || 0) + amount;
        }
        
        if (Object.keys(updates).length > 0) {
            await db.collection('users').doc(referrerId).update(updates);
        }
        
        // 거래 로그
        for (const [token, amount] of tokenEntries) {
            await db.collection('transactions').add({
                from: 'system:referral_signup',
                to: referrerId,
                toEmail: referrerEmail || '',
                amount: amount,
                token: token.toUpperCase(),
                type: 'referral_signup_reward',
                referredUser: newUserId,
                rewardConfig: rewards,
                timestamp: new Date()
            });
        }
        
        console.log(`🎁 소개 가입 보상 지급:`, rewards, `→ ${referrerId}`);
    } catch (e) {
        console.error('소개 가입 보상 지급 실패:', e);
    }
}

// ★ 소개자 보상 설정 UI (수퍼관리자)
async function loadReferralRewardConfig() {
    try {
        const doc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = doc.exists ? doc.data() : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        ['crtd','crac','crgc','creb'].forEach(tk => {
            const el = document.getElementById('referral-cfg-' + tk);
            if (el) el.value = rewards[tk] || 0;
        });
    } catch (e) {
        console.error('소개자 보상 설정 로드 실패:', e);
    }
}

async function saveReferralRewardConfig() {
    if (!isSuperAdmin()) { showToast('수퍼관리자만 변경 가능합니다', 'warning'); return; }
    const tokens = ['crtd','crac','crgc','creb'];
    const signupRewards = {};
    for (const tk of tokens) {
        const val = parseInt(document.getElementById('referral-cfg-' + tk)?.value);
        if (isNaN(val) || val < 0 || val > 10000) {
            showToast(`${tk.toUpperCase()} 수치가 유효하지 않습니다 (0~10,000)`, 'error');
            return;
        }
        signupRewards[tk] = val;
    }
    const confirmed = await showConfirmModal(
        '소개자 보상 수치 변경',
        `회원가입 시 소개자 보상을 다음과 같이 변경합니다:\n\nCRTD: ${signupRewards.crtd}\nCRAC: ${signupRewards.crac}\nCRGC: ${signupRewards.crgc}\nCREB: ${signupRewards.creb}\n\n변경하시겠습니까?`
    );
    if (!confirmed) return;
    try {
        await db.collection('admin_config').doc('referral_rewards').set({
            signupRewards,
            updatedAt: new Date(),
            updatedBy: currentUser.email
        }, { merge: true });
        await db.collection('admin_logs').add({
            action: 'referral_reward_config_change',
            newConfig: signupRewards,
            adminEmail: currentUser.email,
            adminUid: currentUser.uid,
            timestamp: new Date()
        });
        showToast('✅ 소개자 보상 수치 저장 완료', 'success');
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

// [v13] 챌린지 참가 시 소개자 수익 배분 — 비활성화 (회원가입 보상으로 통합)
// async function distributeReferralReward — deprecated
async function distributeReferralReward_DISABLED(userId, amount, token) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        
        const referredBy = userDoc.data().referredBy;
        if (!referredBy) return;
        
        const rewardAmount = Math.floor(amount);
        if (rewardAmount <= 0) return;
        
        const tokenKey = token.toLowerCase();
        
        // 소개자 문서 로드
        const referrerDoc = await db.collection('users').doc(referredBy).get();
        if (!referrerDoc.exists) return;
        const referrerData = referrerDoc.data();
        
        if (tokenKey === 'crtd') {
            // CRTD → 즉시 오프체인 지급
            const off = referrerData.offchainBalances || {};
            await db.collection('users').doc(referredBy).update({
                [`offchainBalances.crtd`]: (off.crtd || 0) + rewardAmount,
                [`referralEarnings.crtd`]: ((referrerData.referralEarnings || {}).crtd || 0) + rewardAmount
            });
            
            console.log(`💰 소개 CRTD 즉시 지급: ${rewardAmount} → ${referredBy}`);
        } else if (tokenKey === 'crny') {
            // CRNY → 30일 후 자동 지급 (pendingRewards)
            const releaseDate = new Date();
            releaseDate.setDate(releaseDate.getDate() + 30);
            
            await db.collection('users').doc(referredBy)
                .collection('pendingRewards').add({
                    token: 'crny',
                    amount: rewardAmount,
                    sourceUser: userId,
                    sourceAmount: amount,
                    type: 'referral_commission',
                    released: false,
                    releaseDate: releaseDate,
                    createdAt: new Date()
                });
            
            // 누적 수익에도 기록 (대기 표시)
            const earnings = referrerData.referralEarnings || {};
            await db.collection('users').doc(referredBy).update({
                [`referralEarnings.crny`]: (earnings.crny || 0) + rewardAmount
            });
            
            console.log(`⏳ 소개 CRNY 30일 후 지급 예정: ${rewardAmount} → ${referredBy}`);
        } else {
            // 기타 토큰: 오프체인 즉시 지급
            const off = referrerData.offchainBalances || {};
            await db.collection('users').doc(referredBy).update({
                [`offchainBalances.${tokenKey}`]: (off[tokenKey] || 0) + rewardAmount,
                [`referralEarnings.${tokenKey}`]: ((referrerData.referralEarnings || {}).tokenKey || 0) + rewardAmount
            });
        }
        
        await db.collection('transactions').add({
            from: 'system:referral_commission',
            to: referredBy,
            amount: rewardAmount,
            token: token,
            type: 'referral_commission',
            sourceUser: userId,
            sourceAmount: amount,
            commission: '10%',
            isPending: tokenKey === 'crny',
            timestamp: new Date()
        });
    } catch (error) {
        console.error('소개 수수료 배분 실패:', error);
    }
}

// 관리자: 특정 사용자 전체 포지션 강제 청산
async function adminForceCloseAll(targetUserId, targetParticipantId, challengeId) {
    if (!isAdmin()) {
        alert(t('admin.admin_only','관리자만 사용 가능합니다'));
        return;
    }
    
    if (!window.confirm('⚠️ 관리자 강제 청산\n\n이 사용자의 모든 포지션을 강제 청산합니다.\n진행하시겠습니까?')) return;
    
    try {
        const docRef = db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId);
        const doc = await docRef.get();
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        
        const data = doc.data();
        const trades = data.trades || [];
        let totalPnL = 0;
        
        for (const trade of trades) {
            if (trade.status === 'open') {
                const priceDiff = trade.side === 'BUY' 
                    ? (currentPrice - trade.entryPrice) 
                    : (trade.entryPrice - currentPrice);
                const pnl = priceDiff * trade.multiplier * trade.contracts;
                const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
                
                trade.status = 'closed';
                trade.exitPrice = currentPrice;
                trade.pnl = pnl - fee;
                trade.fee = fee;
                trade.closedAt = new Date();
                trade.closeReason = 'ADMIN';
                totalPnL += pnl - fee + trade.margin;
            }
        }
        
        const newBalance = (data.currentBalance || 0) + totalPnL;
        
        await docRef.update({
            trades: trades,
            currentBalance: newBalance
        });
        
        // 관리자 로그
        await db.collection('admin_log').add({
            action: 'force_close_all',
            adminEmail: currentUser.email,
            targetUserId: targetUserId,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            totalPnL: totalPnL,
            timestamp: new Date()
        });
        
        alert(`✅ 강제 청산 완료!\n손익: $${totalPnL.toFixed(2)}`);
    } catch (error) {
        alert('강제 청산 실패: ' + error.message);
    }
}

// 관리자: 사용자 거래 중단 (dailyLocked 설정)
async function adminSuspendTrading(targetParticipantId, challengeId, reason) {
    if (!isAdmin()) {
        alert(t('admin.admin_only','관리자만 사용 가능합니다'));
        return;
    }
    
    const suspendReason = reason || prompt(t('admin.enter_suspend_reason','중단 사유를 입력하세요:'));
    if (!suspendReason) return;
    
    try {
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId)
            .update({
                dailyLocked: true,
                adminSuspended: true,
                suspendReason: suspendReason,
                suspendedAt: new Date(),
                suspendedBy: currentUser.email
            });
        
        await db.collection('admin_log').add({
            action: 'suspend_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            reason: suspendReason,
            timestamp: new Date()
        });
        
        alert(`✅ ${t('admin.suspended','거래 중단 처리 완료')}\n${t('admin.reason','사유')}: ${suspendReason}`);
    } catch (error) {
        alert('중단 처리 실패: ' + error.message);
    }
}

// 관리자: 거래 중단 해제
async function adminResumeTrading(targetParticipantId, challengeId) {
    if (!isAdmin()) {
        alert(t('admin.admin_only','관리자만 사용 가능합니다'));
        return;
    }
    
    try {
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId)
            .update({
                dailyLocked: false,
                adminSuspended: false,
                suspendReason: null,
                suspendedAt: null,
                suspendedBy: null
            });
        
        await db.collection('admin_log').add({
            action: 'resume_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            timestamp: new Date()
        });
        
        alert(t('admin.resumed','✅ 거래 중단 해제 완료'));
        loadAdminParticipants(); // 새로고침
    } catch (error) {
        alert('해제 실패: ' + error.message);
    }
}

// ========== 관리자 패널 UI ==========
// ═══════════════════════════════════════════════════════
// 관리자 탭 메뉴 시스템 — 권한 매트릭스
// ═══════════════════════════════════════════════════════
const ADMIN_TAB_CONFIG = [
    { id: 'dashboard', icon: '📈', label: t('admin.tab.dashboard','대시보드'), minLevel: 3 },
    { id: 'offchain',  icon: '🔥', label: t('admin.tab.offchain','오프체인'),  minLevel: 2 },
    { id: 'wallet',    icon: '💰', label: t('admin.tab.onchain','온체인'),    minLevel: 4 },
    { id: 'challenge', icon: '📊', label: t('admin.tab.challenge','챌린지'),    minLevel: 3 },
    { id: 'users',     icon: '👥', label: t('admin.tab.users','관리자'),    minLevel: 3 },
    { id: 'giving',    icon: '🎁', label: t('admin.tab.giving','기부풀'),    minLevel: 3 },
    { id: 'referral',  icon: '⭐', label: t('admin.tab.referral','소개자'),    minLevel: 6 },
    { id: 'rate',      icon: '⚖️', label: t('admin.tab.rate','비율'),      minLevel: 6 },
    { id: 'log',       icon: '📋', label: t('admin.tab.log','로그'),      minLevel: 3 },
    { id: 'coupon',    icon: '🎟️', label: t('admin.tab.coupon','쿠폰'),      minLevel: 3 },
    { id: 'products',  icon: '📦', label: t('admin.tab.products','상품승인'),  minLevel: 2 },
    { id: 'superwall', icon: '🏦', label: t('admin.tab.superwall','계좌관리'),  minLevel: 6 },
    { id: 'ai',        icon: '🤖', label: t('admin.tab.ai','AI 설정'),     minLevel: 6 }
];

let activeAdminTab = null;

function initAdminPage() {
    if (!isAdmin()) {
        document.getElementById('admin-not-authorized').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'none';
        return;
    }
    
    document.getElementById('admin-not-authorized').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    
    // 레벨 뱃지 표시
    const info = getLevelInfo(currentUserLevel);
    document.getElementById('admin-level-badge').innerHTML = 
        `${info.icon} <strong>${info.name}</strong> (레벨 ${currentUserLevel}) — ${currentUser.email}`;
    
    // 권한별 탭 동적 생성
    const tabBar = document.getElementById('admin-tab-bar');
    tabBar.innerHTML = '';
    
    const availableTabs = ADMIN_TAB_CONFIG.filter(t => hasLevel(t.minLevel));
    
    availableTabs.forEach((tab, idx) => {
        const btn = document.createElement('button');
        btn.textContent = `${tab.icon} ${tab.label}`;
        btn.style.cssText = 'padding:0.5rem 0.8rem; border:none; border-radius:8px; cursor:pointer; font-size:0.8rem; font-weight:600; white-space:nowrap; background:transparent; color:#666; transition:all 0.2s;';
        btn.onclick = () => switchAdminTab(tab.id);
        btn.id = `admin-tab-btn-${tab.id}`;
        tabBar.appendChild(btn);
    });
    
    // 첫 번째 탭 활성화
    if (availableTabs.length > 0) {
        switchAdminTab(availableTabs[0].id);
    }
    
    // ★ 발행/차감/토큰관리/배포 섹션: 수퍼관리자만 표시
    const mintSection = document.getElementById('admin-mint-section');
    const burnSection = document.getElementById('admin-burn-section');
    const tokenMgmt = document.getElementById('admin-token-mgmt-section');
    const distSection = document.getElementById('admin-dist-section');
    if (mintSection) mintSection.style.display = isSuperAdmin() ? 'block' : 'none';
    if (burnSection) burnSection.style.display = isSuperAdmin() ? 'block' : 'none';
    if (tokenMgmt) tokenMgmt.style.display = isSuperAdmin() ? 'block' : 'none';
    if (distSection) distSection.style.display = isSuperAdmin() ? 'block' : 'none';
}

function switchAdminTab(tabId) {
    // 모든 탭 컨텐츠 숨기기
    document.querySelectorAll('.admin-tab-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('#admin-tab-bar button').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#666';
    });
    
    // 선택 탭 활성화
    const content = document.getElementById(`admin-tab-${tabId}`);
    if (content) content.style.display = 'block';
    
    const btn = document.getElementById(`admin-tab-btn-${tabId}`);
    if (btn) {
        btn.style.background = '#1a1a2e';
        btn.style.color = 'white';
    }
    
    activeAdminTab = tabId;
    
    // 탭 전환 시 데이터 로드
    if (tabId === 'dashboard') loadAdminDashboardStats();
    if (tabId === 'offchain') { refreshAllTokenDropdowns(); loadTokenList(); }
    if (tabId === 'wallet') loadAdminWallet();
    if (tabId === 'users') loadAdminUserList();
    if (tabId === 'challenge') loadAdminParticipants();
    if (tabId === 'giving') adminLoadGivingPool();
    if (tabId === 'referral') loadReferralRewardConfig();
    if (tabId === 'rate') loadExchangeRate();
    if (tabId === 'coupon') loadCouponList();
    if (tabId === 'products') { loadAdminPendingProducts(); loadAdminReports(); }
    if (tabId === 'superwall') loadSuperAdminWallets();
    if (tabId === 'ai' && typeof AI_ASSISTANT !== 'undefined') AI_ASSISTANT.loadAdminSettings();
}

// ═══════════════════════════════════════════════════════
// 오프체인 관리 함수들 (admin-tab-offchain)
// ═══════════════════════════════════════════════════════

// 유저 오프체인 잔액 조회
async function adminLookupOffchain() {
    const email = document.getElementById('admin-off-lookup-email').value.trim();
    const resultEl = document.getElementById('admin-off-lookup-result');
    if (!email) { resultEl.innerHTML = `<span style="color:red;">${t('admin.enter_email','이메일 입력')}</span>`; return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { resultEl.innerHTML = `<span style="color:red;">${t('admin.user_not_found','사용자 없음')}</span>`; return; }
        
        const data = users.docs[0].data();
        const off = data.offchainBalances || {};
        const nick = data.nickname || data.displayName || t('admin.unnamed','이름없음');
        
        let total = 0;
        let balHTML = '';
        for (const key of OFFCHAIN_TOKENS_LIST) {
            const bal = off[key] || 0;
            total += bal;
            const ti = getTokenInfo(key);
            if (bal > 0 || ti.isDefault) {
                balHTML += `<div>${ti.icon} ${ti.name}: <strong style="color:${ti.color};">${bal.toLocaleString()}</strong></div>`;
            }
        }
        // DB에 있지만 레지스트리에 없는 토큰도 표시
        for (const [key, val] of Object.entries(off)) {
            if (!OFFCHAIN_TOKENS_LIST.includes(key) && val > 0) {
                total += val;
                balHTML += `<div>🪙 ${key.toUpperCase()}: <strong>${val.toLocaleString()}</strong></div>`;
            }
        }
        
        resultEl.innerHTML = `
            <div style="background:white; padding:0.8rem; border-radius:6px; border:1px solid var(--border);">
                <strong>${nick}</strong> <span style="color:var(--accent); font-size:0.8rem;">(${email})</span>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem; margin-top:0.5rem; font-size:0.85rem;">
                    ${balHTML}
                </div>
                <div style="margin-top:0.4rem; font-size:0.8rem; color:var(--accent);">합계: ${total.toLocaleString()} pt</div>
            </div>`;
    } catch (e) {
        resultEl.innerHTML = `<span style="color:red;">조회 실패: ${e.message}</span>`;
    }
}

// 포인트 발행 (민팅) — ★ 수퍼관리자(레벨 6) 전용
async function adminMintOffchain() {
    if (!hasLevel(6)) { alert(t('admin.super_only_mint','⛔ 수퍼관리자만 토큰을 발행할 수 있습니다')); return; }
    
    const email = document.getElementById('admin-off-mint-email').value.trim();
    const tokenKey = document.getElementById('admin-off-mint-token').value;
    const amount = parseInt(document.getElementById('admin-off-mint-amount').value);
    const reason = document.getElementById('admin-off-mint-reason').value.trim() || t('admin.admin_mint','관리자 발행');
    
    if (!email || !amount || amount <= 0) { alert(t('admin.enter_email_amount','이메일과 수량을 입력하세요')); return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { alert('사용자 없음: ' + email); return; }
        
        const targetDoc = users.docs[0];
        const data = targetDoc.data();
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;
        
        if (!confirm(`📈 포인트 발행\n\n대상: ${email}\n토큰: ${tokenKey.toUpperCase()}\n수량: +${amount.toLocaleString()}\n사유: ${reason}\n\n현재 잔액: ${curBal.toLocaleString()} → ${(curBal + amount).toLocaleString()}`)) return;
        
        await targetDoc.ref.update({
            [`offchainBalances.${tokenKey}`]: curBal + amount
        });
        
        // 트랜잭션 로그
        await db.collection('offchain_transactions').add({
            from: 'ADMIN', fromEmail: currentUser.email,
            to: targetDoc.id, toEmail: email,
            token: tokenKey, amount, type: 'admin_mint', reason,
            adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 관리자 활동 로그
        await db.collection('admin_log').add({
            action: 'offchain_mint', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount, reason,
            timestamp: new Date()
        });
        
        alert(`✅ ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 발행 → ${email}`);
        document.getElementById('admin-off-mint-email').value = '';
        document.getElementById('admin-off-mint-amount').value = '100';
        document.getElementById('admin-off-mint-reason').value = '';
    } catch (e) {
        alert('발행 실패: ' + e.message);
    }
}

// 포인트 차감 (소각) — ★ 수퍼관리자(레벨 6) 전용
async function adminBurnOffchain() {
    if (!hasLevel(6)) { alert(t('admin.super_only_burn','⛔ 수퍼관리자만 토큰을 차감할 수 있습니다')); return; }
    
    const email = document.getElementById('admin-off-burn-email').value.trim();
    const tokenKey = document.getElementById('admin-off-burn-token').value;
    const amount = parseInt(document.getElementById('admin-off-burn-amount').value);
    const reason = document.getElementById('admin-off-burn-reason').value.trim() || t('admin.admin_burn_reason','관리자 차감');
    
    if (!email || !amount || amount <= 0) { alert(t('admin.enter_email_amount','이메일과 수량을 입력하세요')); return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { alert('사용자 없음: ' + email); return; }
        
        const targetDoc = users.docs[0];
        const data = targetDoc.data();
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;
        
        if (amount > curBal) {
            alert(`❌ 잔액 부족!\n${email}의 ${tokenKey.toUpperCase()}: ${curBal.toLocaleString()} pt\n차감 요청: ${amount.toLocaleString()} pt`);
            return;
        }
        
        if (!confirm(`📉 포인트 차감\n\n대상: ${email}\n토큰: ${tokenKey.toUpperCase()}\n수량: -${amount.toLocaleString()}\n사유: ${reason}\n\n현재 잔액: ${curBal.toLocaleString()} → ${(curBal - amount).toLocaleString()}`)) return;
        
        await targetDoc.ref.update({
            [`offchainBalances.${tokenKey}`]: curBal - amount
        });
        
        await db.collection('offchain_transactions').add({
            from: targetDoc.id, fromEmail: email,
            to: 'ADMIN', toEmail: currentUser.email,
            token: tokenKey, amount: -amount, type: 'admin_burn', reason,
            adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('admin_log').add({
            action: 'offchain_burn', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount: -amount, reason,
            timestamp: new Date()
        });
        
        alert(`✅ ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 차감 ← ${email}`);
        document.getElementById('admin-off-burn-email').value = '';
        document.getElementById('admin-off-burn-amount').value = '100';
        document.getElementById('admin-off-burn-reason').value = '';
    } catch (e) {
        alert('차감 실패: ' + e.message);
    }
}

// ═══════════════════════════════════════════════════════
// ★ 토큰 생성 · 관리 · 일괄 배포 (수퍼관리자)
// ═══════════════════════════════════════════════════════

// 토큰 목록으로 select 옵션 생성 (동적)
function buildTokenOptions() {
    let html = '';
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        html += `<option value="${key}">${info.icon} ${info.name}</option>`;
    }
    return html;
}

// 모든 토큰 드롭다운 동적 업데이트
function refreshAllTokenDropdowns() {
    const opts = buildTokenOptions();
    ['admin-off-mint-token', 'admin-off-burn-token', 'admin-dist-token'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const prev = el.value;
            el.innerHTML = opts;
            if (prev && el.querySelector(`option[value="${prev}"]`)) el.value = prev;
        }
    });
}

// 등록된 토큰 목록 표시
async function loadTokenList() {
    const container = document.getElementById('admin-token-list');
    if (!container) return;
    
    let html = '<div style="display:grid; gap:0.4rem;">';
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        const badge = info.isDefault ? '<span style="font-size:0.6rem; background:#eee; padding:1px 4px; border-radius:2px;">기본</span>' : '<span style="font-size:0.6rem; background:#e3f2fd; padding:1px 4px; border-radius:2px;">커스텀</span>';
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:var(--bg); border-radius:4px; border-left:3px solid ${info.color};">
                <span style="font-size:0.82rem;">${info.icon} <strong>${info.name}</strong> ${info.fullName} ${badge}</span>
                ${!info.isDefault && isSuperAdmin() ? `<button onclick="deleteCustomToken('${key}')" style="background:#ff4444; color:white; border:none; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.65rem;">삭제</button>` : ''}
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ★ 새 토큰 생성
async function createCustomToken() {
    if (!isSuperAdmin()) { alert('⛔ 수퍼관리자만 토큰을 생성할 수 있습니다'); return; }
    
    const key = (document.getElementById('new-token-key').value || '').trim().toLowerCase();
    const name = (document.getElementById('new-token-name').value || '').trim().toUpperCase();
    const fullName = (document.getElementById('new-token-fullname').value || '').trim();
    const icon = (document.getElementById('new-token-icon').value || '').trim() || '🪙';
    const color = document.getElementById('new-token-color').value || '#888888';
    
    if (!key || !name) { alert('토큰 KEY와 이름은 필수입니다'); return; }
    if (key.length < 2 || key.length > 10) { alert('KEY는 2~10자 영문 소문자'); return; }
    if (!/^[a-z0-9]+$/.test(key)) { alert('KEY는 영문 소문자 + 숫자만 가능'); return; }
    if (OFFCHAIN_TOKEN_REGISTRY[key]) { alert(`이미 존재하는 토큰: ${key.toUpperCase()}`); return; }
    
    const tokenData = { name, fullName, icon, color, isDefault: false, createdBy: currentUser.email, createdAt: new Date().toISOString() };
    
    if (!confirm(`🪙 새 오프체인 토큰 생성\n\nKEY: ${key}\n이름: ${icon} ${name}\n설명: ${fullName}\n\n생성하시겠습니까?`)) return;
    
    try {
        // Firestore에 저장
        await db.collection('admin_config').doc('tokens').set({
            [`registry.${key}`]: tokenData
        }, { merge: true });
        
        // 로컬 레지스트리 업데이트
        OFFCHAIN_TOKEN_REGISTRY[key] = tokenData;
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        OFFCHAIN_TOKEN_NAMES[key] = `${name} (${fullName})`;
        
        // 관리자 로그
        await db.collection('admin_log').add({
            action: 'create_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: name, timestamp: new Date()
        });
        
        alert(`✅ ${icon} ${name} (${key}) 토큰 생성 완료!`);
        
        // UI 업데이트
        document.getElementById('new-token-key').value = '';
        document.getElementById('new-token-name').value = '';
        document.getElementById('new-token-fullname').value = '';
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        alert('토큰 생성 실패: ' + e.message);
    }
}

// 커스텀 토큰 삭제
async function deleteCustomToken(key) {
    if (!isSuperAdmin()) return;
    const info = OFFCHAIN_TOKEN_REGISTRY[key];
    if (!info || info.isDefault) { alert('기본 토큰은 삭제할 수 없습니다'); return; }
    
    if (!confirm(`⚠️ ${info.icon} ${info.name} (${key}) 삭제\n\n이미 배포된 잔액은 유지되지만, 새 발행/거래가 불가합니다.\n삭제하시겠습니까?`)) return;
    
    try {
        await db.collection('admin_config').doc('tokens').update({
            [`registry.${key}`]: firebase.firestore.FieldValue.delete()
        });
        
        delete OFFCHAIN_TOKEN_REGISTRY[key];
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        delete OFFCHAIN_TOKEN_NAMES[key];
        
        await db.collection('admin_log').add({
            action: 'delete_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: info.name, timestamp: new Date()
        });
        
        alert(`✅ ${info.icon} ${info.name} 삭제 완료`);
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        alert('삭제 실패: ' + e.message);
    }
}

// ★ 일괄 배포 (여러 사용자에게 한번에)
async function adminBatchDistribute() {
    if (!hasLevel(6)) { alert('⛔ 수퍼관리자만 일괄 배포할 수 있습니다'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || '일괄 배포';
    const emailsRaw = document.getElementById('admin-dist-emails').value.trim();
    
    if (!tokenKey || !amount || amount <= 0) { alert('토큰과 수량을 입력하세요'); return; }
    if (!emailsRaw) { alert('이메일을 입력하세요 (줄바꿈 구분)'); return; }
    
    // 이메일 파싱 (줄바꿈, 쉼표, 세미콜론)
    const emails = emailsRaw.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    
    if (emails.length === 0) { alert('유효한 이메일이 없습니다'); return; }
    
    const ti = getTokenInfo(tokenKey);
    const totalAmount = amount * emails.length;
    
    if (!confirm(`📦 일괄 배포\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} × ${emails.length}명\n총 발행: ${totalAmount.toLocaleString()}\n사유: ${reason}\n\n대상:\n${emails.slice(0, 5).join('\n')}${emails.length > 5 ? `\n... 외 ${emails.length - 5}명` : ''}\n\n실행하시겠습니까?`)) return;
    
    const resultEl = document.getElementById('admin-dist-result');
    resultEl.innerHTML = '<p style="color:var(--accent);">배포 중...</p>';
    
    let success = 0, fail = 0, failList = [];
    
    for (const email of emails) {
        try {
            const users = await db.collection('users').where('email', '==', email).get();
            if (users.empty) { fail++; failList.push(`${email} (사용자 없음)`); continue; }
            
            const targetDoc = users.docs[0];
            const off = targetDoc.data().offchainBalances || {};
            const curBal = off[tokenKey] || 0;
            
            await targetDoc.ref.update({
                [`offchainBalances.${tokenKey}`]: curBal + amount
            });
            
            await db.collection('offchain_transactions').add({
                from: 'ADMIN', fromEmail: currentUser.email,
                to: targetDoc.id, toEmail: email,
                token: tokenKey, amount, type: 'admin_batch_mint', reason,
                adminLevel: currentUserLevel,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            success++;
        } catch (e) {
            fail++;
            failList.push(`${email} (${e.message})`);
        }
    }
    
    // 관리자 로그 (한번에)
    await db.collection('admin_log').add({
        action: 'batch_distribute', adminEmail: currentUser.email,
        adminLevel: currentUserLevel,
        token: tokenKey.toUpperCase(), amountPerUser: amount,
        totalAmount: amount * success, targetCount: emails.length,
        successCount: success, failCount: fail, reason,
        timestamp: new Date()
    });
    
    resultEl.innerHTML = `
        <div style="padding:0.6rem; border-radius:6px; ${fail > 0 ? 'background:#fff3e0; border:1px solid #ffcc80;' : 'background:#e8f5e9; border:1px solid #a5d6a7;'}">
            <strong>✅ ${success}명 성공</strong>${fail > 0 ? ` / ❌ ${fail}명 실패` : ''}
            <div style="font-size:0.78rem; margin-top:0.3rem;">총 발행: ${(amount * success).toLocaleString()} ${ti.name}</div>
            ${failList.length > 0 ? `<div style="font-size:0.72rem; color:#c62828; margin-top:0.3rem;">실패: ${failList.join(', ')}</div>` : ''}
        </div>`;
    
    document.getElementById('admin-dist-emails').value = '';
}

// ★ 전체 회원 배포
async function adminDistributeToAll() {
    if (!hasLevel(6)) { alert('⛔ 수퍼관리자만 가능합니다'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || '전체 배포';
    
    if (!tokenKey || !amount || amount <= 0) { alert('토큰과 수량을 입력하세요'); return; }
    
    const ti = getTokenInfo(tokenKey);
    
    // 전체 사용자 수 확인
    const allUsers = await db.collection('users').get();
    const count = allUsers.size;
    
    if (!confirm(`⚠️ 전체 회원 배포\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} × ${count}명\n총 발행: ${(amount * count).toLocaleString()}\n\n정말 전체 ${count}명에게 배포하시겠습니까?`)) return;
    
    // 이메일 목록 추출 → 기존 배치 함수 활용
    const emails = [];
    allUsers.forEach(doc => {
        const email = doc.data().email;
        if (email) emails.push(email);
    });
    
    document.getElementById('admin-dist-emails').value = emails.join('\n');
    await adminBatchDistribute();
}

// 오프체인 거래 내역 로드
async function adminLoadOffchainTxLog() {
    if (!hasLevel(1)) return;
    const container = document.getElementById('admin-off-tx-log');
    container.innerHTML = '<p style="color:var(--accent); font-size:0.8rem;">로딩 중...</p>';
    
    try {
        const txs = await db.collection('offchain_transactions')
            .orderBy('timestamp', 'desc').limit(30).get();
        
        if (txs.empty) { container.innerHTML = '<p style="font-size:0.8rem;">거래 내역 없음</p>'; return; }
        
        const typeLabels = {
            'transfer': '전송', 'earn': '적립', 'spend': '사용',
            'admin_mint': '📈발행', 'admin_burn': '📉차감',
            'swap_offchain': '🔄환전'
        };
        const typeColors = {
            'admin_mint': '#2e7d32', 'admin_burn': '#c62828',
            'earn': '#1565c0', 'spend': '#ff6f00',
            'transfer': '#455a64', 'swap_offchain': '#6a1b9a'
        };
        
        let html = '';
        txs.forEach(doc => {
            const tx = doc.data();
            const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString('ko-KR') : '--';
            const label = typeLabels[tx.type] || tx.type;
            const color = typeColors[tx.type] || '#666';
            const fromLabel = tx.fromEmail === 'ADMIN' ? '🔐 관리자' : (tx.fromEmail || '--');
            const toLabel = tx.toEmail === 'ADMIN' ? '🔐 관리자' : (tx.toEmail || '--');
            const amountSign = (tx.amount >= 0) ? '+' : '';
            
            html += `<div style="padding:0.5rem; border-bottom:1px solid #eee; font-size:0.78rem;">
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:${color}; font-weight:700;">${label}</span>
                    <span style="color:var(--accent);">${time}</span>
                </div>
                <div>${tx.token?.toUpperCase()||'--'} <strong>${amountSign}${(tx.amount||0).toLocaleString()}</strong></div>
                <div style="color:#999; font-size:0.72rem;">${fromLabel} → ${toLabel}</div>
                ${tx.reason ? `<div style="color:#888; font-size:0.7rem; font-style:italic;">"${tx.reason}"</div>` : ''}
            </div>`;
        });
        
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p style="color:red; font-size:0.8rem;">로드 실패: ${e.message}</p>`;
    }
}

// ═══════════════════════════════════════════════════════
// 기부풀 관리 (admin-tab-giving)
// ═══════════════════════════════════════════════════════

async function adminLoadGivingPool() {
    if (!hasLevel(3)) return;
    const infoEl = document.getElementById('admin-giving-pool-info');
    const logEl = document.getElementById('admin-giving-log');
    
    try {
        // 기부풀 현황
        const poolDoc = await db.collection('giving_pool').doc('global').get();
        if (poolDoc.exists) {
            const pool = poolDoc.data();
            const updated = pool.lastUpdated?.toDate ? pool.lastUpdated.toDate().toLocaleString('ko-KR') : '--';
            infoEl.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:0.8rem; color:var(--accent);">🎁 글로벌 기부풀 잔액</div>
                    <div style="font-size:2rem; font-weight:800; color:#00897b;">${(pool.totalAmount||0).toLocaleString()} <span style="font-size:0.9rem;">CRGC pt</span></div>
                    <div style="font-size:0.75rem; color:var(--accent);">≈ ${((pool.totalAmount||0)/100).toFixed(2)} CRNY · 최종: ${updated}</div>
                </div>`;
        } else {
            infoEl.innerHTML = '<p style="text-align:center; color:var(--accent);">아직 기부풀이 없습니다</p>';
        }
        
        // 기부풀 로그
        const logs = await db.collection('giving_pool_logs')
            .orderBy('timestamp', 'desc').limit(20).get();
        
        if (logs.empty) { logEl.innerHTML = '<p style="font-size:0.8rem;">기부 로그 없음</p>'; return; }
        
        let html = '';
        logs.forEach(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.4rem; border-bottom:1px solid #eee; font-size:0.78rem;">
                <span style="color:#00897b; font-weight:600;">+${(log.givingAmount||0).toLocaleString()}</span>
                <span style="color:var(--accent);"> from ${log.email||'--'}</span>
                <span style="color:#999; float:right;">${time}</span>
            </div>`;
        });
        logEl.innerHTML = html;
    } catch (e) {
        infoEl.innerHTML = `<p style="color:red;">로드 실패: ${e.message}</p>`;
    }
}

// 기부풀 분배
async function adminDistributeGivingPool() {
    if (!hasLevel(3)) { alert('권한 부족 (레벨 3+)'); return; }
    
    const email = document.getElementById('admin-giving-email').value.trim();
    const amount = parseInt(document.getElementById('admin-giving-amount').value);
    if (!email || !amount || amount <= 0) { alert(t('admin.enter_email_amount','이메일과 수량을 입력하세요')); return; }
    
    try {
        // 기부풀 잔액 확인
        const poolRef = db.collection('giving_pool').doc('global');
        const poolDoc = await poolRef.get();
        const poolBal = poolDoc.exists ? (poolDoc.data().totalAmount || 0) : 0;
        
        if (amount > poolBal) {
            alert(`❌ 기부풀 잔액 부족!\n현재: ${poolBal.toLocaleString()} pt\n요청: ${amount.toLocaleString()} pt`);
            return;
        }
        
        // 수신자 확인
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { alert('사용자 없음: ' + email); return; }
        
        if (!confirm(`🎁 기부풀 분배\n\n대상: ${email}\n수량: ${amount.toLocaleString()} CRGC pt\n기부풀 잔액: ${poolBal.toLocaleString()} → ${(poolBal - amount).toLocaleString()}`)) return;
        
        const targetDoc = users.docs[0];
        const off = targetDoc.data().offchainBalances || {};
        
        // 기부풀 차감
        await poolRef.update({
            totalAmount: poolBal - amount,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 수신자에게 CRGC 지급
        await targetDoc.ref.update({
            [`offchainBalances.crgc`]: (off.crgc || 0) + amount
        });
        
        // 로그
        await db.collection('offchain_transactions').add({
            from: 'GIVING_POOL', fromEmail: 'giving_pool',
            to: targetDoc.id, toEmail: email,
            token: 'crgc', amount, type: 'giving_distribute',
            adminEmail: currentUser.email, adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('admin_log').add({
            action: 'giving_distribute', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, amount, timestamp: new Date()
        });
        
        alert(`✅ ${amount.toLocaleString()} CRGC 기부풀에서 ${email}에게 분배 완료`);
        adminLoadGivingPool();
    } catch (e) {
        alert('분배 실패: ' + e.message);
    }
}

// 회원 목록 로드 (수퍼관리자)
async function loadAdminUserList() {
    if (!hasLevel(3)) return;
    
    const container = document.getElementById('admin-user-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    try {
        // ★ 쿼터 정보 + 관리자 현황
        const stats = await loadAdminStats();
        let configDoc = null;
        try {
            configDoc = await db.collection('admin_config').doc('settings').get();
        } catch(e) {}
        const quotas = configDoc?.exists ? (configDoc.data().quotas || {}) : {};
        
        // ★ 수퍼관리자: 쿼터 설정 UI
        let quotaHTML = '';
        if (isSuperAdmin()) {
            quotaHTML = `
            <div style="background:#fff3e0; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <h4 style="font-size:0.85rem; margin-bottom:0.6rem;">⚙️ 관리자 쿼터 설정</h4>
                <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                    <thead>
                        <tr style="background:var(--bg);">
                            <th style="padding:0.3rem;">레벨</th>
                            <th style="padding:0.3rem;">현재</th>
                            <th style="padding:0.3rem;">최대(전체)</th>
                            <th style="padding:0.3rem;">상위1인당</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[5,4,3,2,1].map(lv => {
                            const q = quotas[`level${lv}`] || {};
                            const info = getLevelInfo(lv);
                            return `<tr>
                                <td style="padding:0.3rem;">${info.icon} Lv${lv}</td>
                                <td style="padding:0.3rem; text-align:center; font-weight:700;">${stats[lv] || 0}명</td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-max-${lv}" value="${q.max || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-per-${lv}" value="${q.perAdmin || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <button onclick="saveAdminQuotas()" style="margin-top:0.5rem; background:#FF6D00; color:white; border:none; padding:0.4rem 1rem; border-radius:4px; cursor:pointer; font-size:0.8rem;">💾 쿼터 저장</button>
            </div>`;
        }
        
        // ★ 임명 폼 (자기 레벨에 맞는 옵션만)
        let appointOptions = '';
        for (let lv = -1; lv <= maxAppointLevel; lv++) {
            const info = getLevelInfo(lv);
            appointOptions += `<option value="${lv}">${lv} ${info.name} ${info.icon}</option>`;
        }
        
        const appointHTML = `
        <div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:1rem;">
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;">🔑 관리자 임명 (최대 Lv${maxAppointLevel}까지)</h4>
            <div style="display:grid; grid-template-columns:1fr auto auto; gap:0.5rem; align-items:end;">
                <div>
                    <label style="font-size:0.7rem;">이메일</label>
                    <input type="email" id="admin-level-email" placeholder="user@email.com" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                </div>
                <div>
                    <label style="font-size:0.7rem;">레벨</label>
                    <select id="admin-level-select" style="padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                        ${appointOptions}
                    </select>
                </div>
                <button onclick="setUserAdminLevel(document.getElementById('admin-level-email').value, parseInt(document.getElementById('admin-level-select').value))" style="background:#9C27B0; color:white; border:none; padding:0.5rem 1rem; border-radius:4px; cursor:pointer;">설정</button>
            </div>
        </div>`;
        
        // ★ 관리자 목록 (관리자인 사용자만 + 최근 가입)
        const admins = await db.collection('users').where('adminLevel', '>=', 1).get();
        const recentUsers = await db.collection('users').orderBy('createdAt', 'desc').limit(20).get();
        
        // 중복 제거
        const seenIds = new Set();
        const allUsers = [];
        admins.forEach(doc => { seenIds.add(doc.id); allUsers.push({ id: doc.id, ...doc.data() }); });
        recentUsers.forEach(doc => { if (!seenIds.has(doc.id)) { seenIds.add(doc.id); allUsers.push({ id: doc.id, ...doc.data() }); } });
        
        // 레벨 내림차순 정렬
        allUsers.sort((a, b) => (b.adminLevel ?? -1) - (a.adminLevel ?? -1));
        
        window._adminUserCache = {};
        let userHTML = '';
        for (const u of allUsers) {
            const level = u.adminLevel ?? -1;
            const info = getLevelInfo(level);
            const canManage = (level < currentUserLevel || isSuperAdmin()) && u.email !== SUPER_ADMIN_EMAIL;
            window._adminUserCache[u.id] = u;
            
            const countryArr = normalizeToArray(u.adminCountry);
            const businessArr = normalizeToArray(u.adminBusiness);
            const serviceArr = normalizeToArray(u.adminService);
            const countryBadge = countryArr.map(c => `<span style="font-size:0.6rem;background:#e3f2fd;color:#1565c0;padding:1px 4px;border-radius:3px;">${c}</span>`).join('');
            const businessBadge = businessArr.map(b => `<span style="font-size:0.6rem;background:#fff3e0;color:#e65100;padding:1px 4px;border-radius:3px;">${b}</span>`).join('');
            const serviceBadge = serviceArr.map(s => `<span style="font-size:0.6rem;background:#f3e5f5;color:#7b1fa2;padding:1px 4px;border-radius:3px;">${s}</span>`).join('');
            
            let periodText = '';
            if (u.adminEndDate) {
                const end = u.adminEndDate.toDate ? u.adminEndDate.toDate() : new Date(u.adminEndDate);
                const isExpired = end < new Date();
                periodText = isExpired 
                    ? `<span style="font-size:0.6rem;color:#c62828;font-weight:700;">⏰ 만료됨</span>`
                    : `<span style="font-size:0.6rem;color:#666;">~${end.toLocaleDateString('ko-KR')}</span>`;
            }
            
            userHTML += `
                <div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; border-left:4px solid ${info.color};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                        <div style="flex:1; min-width:150px;">
                            <strong style="font-size:0.85rem;">${u.nickname || t('admin.unnamed','이름없음')}</strong>
                            <span style="font-size:0.7rem; color:var(--accent); margin-left:0.3rem;">${u.email}</span>
                            <div style="display:flex;gap:0.3rem;margin-top:0.2rem;flex-wrap:wrap;">
                                ${countryBadge}${businessBadge}${serviceBadge}${periodText}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span style="font-size:0.72rem; padding:2px 6px; background:${info.color}22; color:${info.color}; border-radius:3px;">
                                ${info.icon} Lv${level}
                            </span>
                            ${canManage ? `<button onclick="showAdminEditModal('${u.id}', window._adminUserCache['${u.id}'])" style="background:#9C27B0;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:0.65rem;">편집</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = quotaHTML + appointHTML + `
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;">👥 관리자 · 회원 목록 (${allUsers.length}명)</h4>
            ${userHTML}
        `;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
    }
}

// 참가자 일일 한도 조정 (레벨 3+)
async function adminAdjustDailyLimit(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        // 기존 값 조회
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const currentLimit = data.dailyLossLimit || 500;
        const email = data.email || data.userId || participantId;
        
        const newLimit = prompt(`[${email}]\n현재 일일 손실 한도: $${currentLimit}\n\n새 일일 손실 한도 ($):`, currentLimit);
        if (!newLimit || isNaN(newLimit)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ dailyLossLimit: Math.abs(parseFloat(newLimit)) });
        
        await db.collection('admin_log').add({
            action: 'adjust_daily_limit',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevLimit: currentLimit,
            newLimit: Math.abs(parseFloat(newLimit)),
            timestamp: new Date()
        });
        
        alert(`✅ 일일 한도 $${currentLimit} → $${newLimit} 변경 완료`);
        loadAdminParticipants();
    } catch (error) {
        alert('변경 실패: ' + error.message);
        console.error('adminAdjustDailyLimit 에러:', error);
    }
}

// 거래 잠금 해제 (레벨 3+)
async function adminUnlockTrading(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const email = data.email || data.userId || participantId;
        const locked = data.dailyLocked ? '🔒 잠금 상태' : '🔓 정상';
        const suspended = data.adminSuspended ? '⛔ 정지됨' : '활동중';
        
        if (!confirm(`[${email}]\n상태: ${locked} / ${suspended}\n일일 PnL: $${(data.dailyPnL||0).toFixed(2)}\n\n잠금 해제 + PnL 초기화?`)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ 
                dailyLocked: false,
                adminSuspended: false,
                suspendReason: null,
                dailyPnL: 0
            });
        
        await db.collection('admin_log').add({
            action: 'unlock_trading',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            timestamp: new Date()
        });
        
        alert('✅ 거래 잠금 해제 + 일일 PnL 초기화 완료');
        loadAdminParticipants();
    } catch (error) {
        alert('해제 실패: ' + error.message);
        console.error('adminUnlockTrading 에러:', error);
    }
}

// 잔액 직접 조정 (레벨 4+)
async function adminAdjustBalance(participantId, challengeId) {
    if (!hasLevel(4)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const currentBalance = data.currentBalance || 0;
        const email = data.email || data.userId || participantId;
        
        const newBalance = prompt(`[${email}]\n현재 잔액: $${currentBalance.toLocaleString()}\n손익: $${((data.currentBalance||0) - (data.initialBalance||0)).toFixed(2)}\n\n새 잔액 ($):`, currentBalance);
        if (!newBalance || isNaN(newBalance)) return;
        
        if (!confirm(`잔액 변경 확인\n$${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()}`)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ currentBalance: parseFloat(newBalance) });
        
        await db.collection('admin_log').add({
            action: 'adjust_balance',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevBalance: currentBalance,
            newBalance: parseFloat(newBalance),
            timestamp: new Date()
        });
        
        alert(`✅ 잔액 $${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()} 변경 완료`);
        loadAdminParticipants();
    } catch (error) {
        alert('변경 실패: ' + error.message);
        console.error('adminAdjustBalance 에러:', error);
    }
}

// 누적 청산 한도 조정 (레벨 3+)
async function adminAdjustMaxDrawdown(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const currentDD = data.maxDrawdown || 3000;
        const email = data.email || data.userId || participantId;
        const balance = data.currentBalance || 0;
        const pnl = balance - (data.initialBalance || 0);
        
        const newDD = prompt(`[${email}]\n현재 잔액: $${balance.toLocaleString()} (손익: $${pnl.toFixed(0)})\n현재 청산 한도: -$${currentDD.toLocaleString()}\n\n새 청산 한도 ($):`, currentDD);
        if (!newDD || isNaN(newDD)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ maxDrawdown: Math.abs(parseFloat(newDD)) });
        
        await db.collection('admin_log').add({
            action: 'adjust_max_drawdown',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevDrawdown: currentDD,
            newDrawdown: Math.abs(parseFloat(newDD)),
            timestamp: new Date()
        });
        
        alert(`✅ 청산 한도 -$${currentDD.toLocaleString()} → -$${parseFloat(newDD).toLocaleString()} 변경 완료`);
        loadAdminParticipants();
    } catch (error) {
        alert('변경 실패: ' + error.message);
        console.error('adminAdjustMaxDrawdown 에러:', error);
    }
}

// 카피트레이딩 계정 수 조정 (레벨 3+)
async function adminAdjustCopyAccounts(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const currentCopy = data.copyAccounts || 1;
        const email = data.email || data.userId || participantId;
        
        const newCopy = prompt(`[${email}]\n현재 카피트레이딩 계정 수: ${currentCopy}\n\n새 카피 계정 수 (1~10):`, currentCopy);
        if (!newCopy || isNaN(newCopy)) return;
        
        const val = Math.min(10, Math.max(1, parseInt(newCopy)));
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ copyAccounts: val });
        
        await db.collection('admin_log').add({
            action: 'adjust_copy_accounts',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevCopyAccounts: currentCopy,
            newCopyAccounts: val,
            timestamp: new Date()
        });
        
        alert(`✅ 카피 계정 ${currentCopy} → ${val} 변경 완료\n(실효 계약수 = 입력계약 × ${val})`);
        loadAdminParticipants();
    } catch (error) {
        alert('변경 실패: ' + error.message);
    }
}

// 거래 티어 (MNQ/NQ 최대 계약수) 조정 (레벨 3+)
async function adminAdjustTradingTier(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { alert('참가자를 찾을 수 없습니다'); return; }
        const data = doc.data();
        const currentTier = data.tradingTier || { MNQ: 1, NQ: 0 };
        const email = data.email || data.userId || participantId;
        
        const mnqMax = prompt(`[${email}]\n현재 MNQ 최대: ${currentTier.MNQ || 0}\nNQ 최대: ${currentTier.NQ || 0}\n\nMNQ 최대 계약수:`, currentTier.MNQ || 1);
        if (mnqMax === null) return;
        
        const nqMax = prompt(`NQ 최대 계약수:`, currentTier.NQ || 0);
        if (nqMax === null) return;
        
        const newTier = { MNQ: parseInt(mnqMax) || 0, NQ: parseInt(nqMax) || 0 };
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ tradingTier: newTier });
        
        await db.collection('admin_log').add({
            action: 'adjust_trading_tier',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevTier: currentTier,
            newTier: newTier,
            timestamp: new Date()
        });
        
        alert(`✅ 거래 티어 변경 완료\nMNQ: ${currentTier.MNQ||0} → ${newTier.MNQ}\nNQ: ${currentTier.NQ||0} → ${newTier.NQ}`);
        loadAdminParticipants();
    } catch (error) {
        alert('변경 실패: ' + error.message);
    }
}

// Admin 지갑 - 온체인 잔액 로드
// ═══════════════════════════════════════════════════════
// 삭제된 지갑 조회 (관리자)
// ═══════════════════════════════════════════════════════
async function adminLoadDeletedWallets() {
    if (!hasLevel(3)) { showToast('권한 부족 (레벨 3+)', 'warning'); return; }
    
    const container = document.getElementById('admin-deleted-wallets');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--accent);">삭제된 지갑 조회 중...</p>';
    
    try {
        const users = await db.collection('users').get();
        let html = '';
        let count = 0;
        
        for (const userDoc of users.docs) {
            const userData = userDoc.data();
            const wallets = await db.collection('users').doc(userDoc.id)
                .collection('wallets').where('status', '==', 'deleted').get();
            
            for (const wDoc of wallets.docs) {
                const w = wDoc.data();
                count++;
                const deletedAt = w.deletedAt?.toDate ? w.deletedAt.toDate().toLocaleString('ko-KR') : (w.deletedAt ? new Date(w.deletedAt).toLocaleString('ko-KR') : '--');
                html += `<div style="padding:0.6rem;background:#fff5f5;border-radius:6px;margin-bottom:0.4rem;border-left:3px solid #c62828;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                        <div>
                            <strong style="font-size:0.85rem;">${w.name || '지갑'}</strong>
                            <span style="font-size:0.7rem;color:#999;margin-left:0.3rem;">${userData.email || userDoc.id}</span>
                            <div style="font-size:0.72rem;color:#666;font-family:monospace;">${w.walletAddress || '--'}</div>
                            <div style="font-size:0.68rem;color:#c62828;">삭제: ${deletedAt}</div>
                        </div>
                        ${hasLevel(4) ? `<button onclick="adminRestoreWallet('${userDoc.id}','${wDoc.id}')" style="background:#4CAF50;color:white;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.7rem;">♻️ 복구</button>` : ''}
                    </div>
                </div>`;
            }
        }
        
        container.innerHTML = html || '<p style="font-size:0.85rem;color:#999;">삭제된 지갑이 없습니다.</p>';
        container.insertAdjacentHTML('beforebegin', `<div style="font-size:0.8rem;color:var(--accent);margin-bottom:0.3rem;">총 ${count}개 삭제된 지갑</div>`);
    } catch (e) {
        container.innerHTML = `<p style="color:red;">조회 실패: ${e.message}</p>`;
    }
}

// 삭제된 지갑 복구
async function adminRestoreWallet(userId, walletId) {
    if (!hasLevel(4)) return;
    if (!confirm('이 지갑을 복구하시겠습니까?')) return;
    try {
        await db.collection('users').doc(userId).collection('wallets').doc(walletId).update({
            status: firebase.firestore.FieldValue.delete(),
            deletedAt: firebase.firestore.FieldValue.delete(),
            restoredAt: new Date(),
            restoredBy: currentUser.email
        });
        await db.collection('admin_log').add({
            action: 'restore_wallet', adminEmail: currentUser.email,
            adminLevel: currentUserLevel, targetUserId: userId, walletId,
            timestamp: new Date()
        });
        showToast('✅ 지갑 복구 완료', 'success');
        adminLoadDeletedWallets();
    } catch (e) {
        showToast('복구 실패: ' + e.message, 'error');
    }
}

async function loadAdminWallet() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-wallet-info');
    if (!container) { console.error('admin-wallet-info 없음'); return; }
    
    container.innerHTML = '<p style="color:var(--accent);">🔄 온체인 잔액 조회 중... (v4.0)</p>';
    
    try {
        // 1. Firestore에서 관리자 지갑 주소
        console.log('🔍 Admin wallet: Firestore 조회 시작');
        const wallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        
        if (wallets.empty) {
            container.innerHTML = '<p style="color:red;">❌ Firestore에 지갑 없음</p>';
            return;
        }
        
        const adminWalletData = wallets.docs[0].data();
        const adminAddress = adminWalletData.walletAddress;
        console.log('🔍 Admin wallet address:', adminAddress);
        
        if (!adminAddress) {
            container.innerHTML = '<p style="color:red;">❌ walletAddress 필드 없음</p>';
            return;
        }
        
        // 2. 온체인 잔액 조회
        console.log('🔍 온체인 잔액 조회 시작...');
        const balances = await getAllOnchainBalances(adminAddress);
        console.log('🔍 잔액:', balances);
        
        // 3. POL 잔액 (가스비)
        const maticBalance = await web3.eth.getBalance(adminAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether')).toFixed(4);
        console.log('🔍 POL:', maticFormatted);
        
        container.innerHTML = `
            <div style="font-size:0.8rem; color:var(--accent); margin-bottom:0.5rem;">
                🔗 <span style="font-family:monospace;">${adminAddress.slice(0,6)}...${adminAddress.slice(-4)}</span>
                <span style="margin-left:0.5rem; color:#8e24aa;">Polygon</span>
            </div>
            <div style="display:flex; gap:0.8rem; flex-wrap:wrap; margin-bottom:0.5rem;">
                <div style="background:#fff3e0; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#e65100;">CRNY</div>
                    <strong style="font-size:1.2rem;">${balances.crny.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#e3f2fd; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#1565c0;">FNC</div>
                    <strong style="font-size:1.2rem;">${balances.fnc.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#e8f5e9; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#2e7d32;">CRFN</div>
                    <strong style="font-size:1.2rem;">${balances.crfn.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#f3e5f5; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#6a1b9a;">POL (가스)</div>
                    <strong style="font-size:1.2rem;">${maticFormatted}</strong>
                </div>
            </div>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem;">🔄 새로고침</button>
        `;
        
        // 전역에 저장
        window.adminWalletAddress = adminAddress;
        window.adminWalletId = wallets.docs[0].id;
        
    } catch (error) {
        console.error('Admin wallet load error:', error);
        container.innerHTML = `<p style="color:red;">잔액 조회 실패: ${error.message}</p>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem; margin-top:0.5rem;">🔄 다시 시도</button>`;
    }
}

// Admin: 온체인 ERC-20 토큰 전송
async function adminSendToken() {
    if (!isAdmin()) return;
    
    const email = document.getElementById('admin-send-email').value;
    const tokenKey = document.getElementById('admin-send-token').value;
    const amount = parseFloat(document.getElementById('admin-send-amount').value);
    
    if (!email || !amount || amount <= 0) {
        alert(t('admin.enter_email_amount','이메일과 수량을 입력하세요'));
        return;
    }
    
    try {
        // 받는 사람 찾기
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) {
            alert('사용자를 찾을 수 없습니다: ' + email);
            return;
        }
        
        const targetUser = users.docs[0];
        const targetUserId = targetUser.id;
        
        // 받는 사람의 지갑 주소 찾기
        const wallets = await db.collection('users').doc(targetUserId)
            .collection('wallets').limit(1).get();
        
        if (wallets.empty) {
            alert('사용자의 지갑을 찾을 수 없습니다');
            return;
        }
        
        const targetWalletData = wallets.docs[0].data();
        const toAddress = targetWalletData.walletAddress;
        
        if (!toAddress) {
            alert('받는 사람의 Polygon 지갑 주소가 없습니다');
            return;
        }
        
        // 관리자 private key 가져오기
        const adminWallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        
        if (adminWallets.empty) {
            alert('관리자 지갑을 찾을 수 없습니다');
            return;
        }
        
        const adminWalletData = adminWallets.docs[0].data();
        const fromPrivateKey = adminWalletData.privateKey;
        const fromAddress = adminWalletData.walletAddress;
        
        if (!fromPrivateKey) {
            alert('관리자 지갑의 개인키가 없습니다');
            return;
        }
        
        // 온체인 잔액 확인
        const balance = await getOnchainBalance(fromAddress, tokenKey);
        if (balance < amount) {
            alert(`온체인 잔액 부족!\n보유: ${balance.toFixed(4)} ${tokenKey.toUpperCase()}\n필요: ${amount}`);
            return;
        }
        
        // MATIC 잔액 확인 (가스비)
        const maticBalance = await web3.eth.getBalance(fromAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether'));
        if (maticFormatted < 0.01) {
            alert(`⚠️ POL(MATIC) 잔액 부족! 가스비가 필요합니다.\n보유: ${maticFormatted.toFixed(4)} POL\n최소 0.01 POL 필요`);
            return;
        }
        
        const tokenSymbol = tokenKey.toUpperCase();
        if (!window.confirm(
            `🔗 온체인 토큰 전송\n\n` +
            `보내는 사람: ${fromAddress.slice(0,6)}...${fromAddress.slice(-4)}\n` +
            `받는 사람: ${email}\n` +
            `  (${toAddress.slice(0,6)}...${toAddress.slice(-4)})\n` +
            `토큰: ${amount} ${tokenSymbol}\n` +
            `체인: Polygon\n\n` +
            `⚠️ 온체인 트랜잭션은 취소할 수 없습니다.\n진행하시겠습니까?`
        )) return;
        
        // 전송 진행 UI
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = '⏳ 전송 중...';
            sendBtn.disabled = true;
        }
        
        // 온체인 전송
        const receipt = await sendOnchainToken(fromPrivateKey, toAddress, tokenKey, amount);
        
        // Firestore에도 기록 (내부 잔액 동기화)
        const targetBalances = targetWalletData.balances || {};
        await db.collection('users').doc(targetUserId)
            .collection('wallets').doc(wallets.docs[0].id)
            .update({
                [`balances.${tokenKey}`]: (targetBalances[tokenKey] || 0) + amount
            });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid,
            fromEmail: ADMIN_EMAIL,
            fromAddress: fromAddress,
            to: targetUserId,
            toEmail: email,
            toAddress: toAddress,
            amount: amount,
            token: tokenSymbol,
            type: 'onchain_transfer',
            txHash: receipt.transactionHash,
            chain: 'polygon',
            timestamp: new Date()
        });
        
        await db.collection('admin_log').add({
            action: 'onchain_send_token',
            adminEmail: currentUser.email,
            targetEmail: email,
            token: tokenSymbol,
            amount: amount,
            txHash: receipt.transactionHash,
            timestamp: new Date()
        });
        
        alert(
            `✅ 온체인 전송 완료!\n\n` +
            `${amount} ${tokenSymbol} → ${email}\n` +
            `TX: ${receipt.transactionHash.slice(0,10)}...`
        );
        
        document.getElementById('admin-send-email').value = '';
        document.getElementById('admin-send-amount').value = '1';
        loadAdminWallet();
        
    } catch (error) {
        console.error('온체인 전송 실패:', error);
        alert('전송 실패: ' + error.message);
    } finally {
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = '보내기';
            sendBtn.disabled = false;
        }
    }
}

// 관리자: 모든 챌린지의 참가자 목록 로드
async function loadAdminParticipants() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-participants-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        // 모든 챌린지 가져오기
        const challenges = await db.collection('prop_challenges')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        
        if (challenges.empty) {
            container.innerHTML = '<p style="color:var(--accent);">챌린지가 없습니다.</p>';
            return;
        }
        
        let html = '';
        
        for (const challengeDoc of challenges.docs) {
            const challenge = challengeDoc.data();
            const challengeId = challengeDoc.id;
            
            // 해당 챌린지의 참가자 가져오기
            const participants = await db.collection('prop_challenges').doc(challengeId)
                .collection('participants')
                .get();
            
            html += `
                <div style="border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:1rem;">
                    <h4 style="margin-bottom:0.5rem;">📊 ${challenge.title || '챌린지'} <span style="font-size:0.75rem; color:var(--accent);">(${challengeId.slice(0,8)})</span></h4>
                    <p style="font-size:0.8rem; color:var(--accent); margin-bottom:0.8rem;">참가자: ${participants.size}명</p>
            `;
            
            if (participants.empty) {
                html += '<p style="font-size:0.85rem; color:var(--accent);">참가자 없음</p>';
            } else {
                for (const pDoc of participants.docs) {
                    const p = pDoc.data();
                    const participantId = pDoc.id;
                    const openTrades = (p.trades || []).filter(t => t.status === 'open');
                    const initial = p.initialBalance || 100000;
                    const current = p.currentBalance || 100000;
                    const pnl = current - initial;
                    const pnlColor = pnl >= 0 ? '#0066cc' : '#cc0000';
                    const isSuspended = p.adminSuspended || false;
                    const isLocked = p.dailyLocked || false;
                    
                    let statusBadge = '🟢 정상';
                    if (isSuspended) statusBadge = '⛔ 관리자 중단';
                    else if (isLocked) statusBadge = '🔒 일일 제한';
                    
                    html += `
                        <div style="background:var(--bg); padding:0.8rem; border-radius:6px; margin-bottom:0.5rem; border-left:3px solid ${isSuspended ? '#cc0000' : '#0066cc'};">
                            <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:0.5rem;">
                                <div>
                                    <strong style="font-size:0.9rem;">${p.email || p.userId || '알 수 없음'}</strong>
                                    <span style="font-size:0.75rem; margin-left:0.5rem;">${statusBadge}</span>
                                    <div style="font-size:0.8rem; color:var(--accent); margin-top:0.3rem;">
                                        잔액: $${current.toLocaleString()} | 
                                        손익: <span style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}</span> | 
                                        포지션: ${openTrades.length}개
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">
                                        일일 PnL: <span style="color:${(p.dailyPnL || 0) < 0 ? '#cc0000' : '#0066cc'}">$${(p.dailyPnL || 0).toFixed(2)}</span> / 
                                        일일한도: <span style="font-weight:700;">$${p.dailyLossLimit || 500}</span> · 
                                        청산한도: <span style="font-weight:700;">$${(p.maxDrawdown || 3000).toLocaleString()}</span>
                                        ${p.copyAccounts > 1 ? ` · <span style="color:#FF6D00; font-weight:700;">카피: ${p.copyAccounts}계정</span>` : ''}
                                        ${p.tradingTier ? ` · <span style="color:#9C27B0;">MNQ×${p.tradingTier.MNQ||0} NQ×${p.tradingTier.NQ||0}</span>` : ''}
                                    </div>
                                    ${isSuspended ? `<div style="font-size:0.75rem; color:#cc0000; margin-top:0.2rem;">사유: ${p.suspendReason || '-'}</div>` : ''}
                                </div>
                                <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                                    ${openTrades.length > 0 ? `
                                        <button onclick="adminForceCloseAll('${p.userId}', '${participantId}', '${challengeId}')" 
                                            style="background:#cc0000; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            💥 강제 청산
                                        </button>
                                    ` : ''}
                                    ${!isSuspended ? `
                                        <button onclick="adminSuspendTrading('${participantId}', '${challengeId}')" 
                                            style="background:#ff9800; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            ⛔ 거래 중단
                                        </button>
                                    ` : `
                                        <button onclick="adminResumeTrading('${participantId}', '${challengeId}')" 
                                            style="background:#4caf50; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            ✅ 중단 해제
                                        </button>
                                    `}
                                    ${isLocked ? `
                                        <button onclick="adminUnlockTrading('${participantId}', '${challengeId}')" 
                                            style="background:#2196F3; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            🔓 잠금 해제
                                        </button>
                                    ` : ''}
                                    <button onclick="adminAdjustDailyLimit('${participantId}', '${challengeId}')" 
                                        style="background:#607D8B; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        📊 일일한도
                                    </button>
                                    <button onclick="adminAdjustMaxDrawdown('${participantId}', '${challengeId}')" 
                                        style="background:#455A64; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        💀 청산한도
                                    </button>
                                    <button onclick="adminAdjustBalance('${participantId}', '${challengeId}')" 
                                        style="background:#795548; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        💰 잔액 조정
                                    </button>
                                    <button onclick="adminAdjustCopyAccounts('${participantId}', '${challengeId}')" 
                                        style="background:#FF6D00; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        📋 카피계정
                                    </button>
                                    <button onclick="adminAdjustTradingTier('${participantId}', '${challengeId}')" 
                                        style="background:#9C27B0; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        📊 거래티어
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
            
            html += '</div>';
        }
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
        console.error('Admin participants load error:', error);
    }
}

// 관리자: 활동 로그 로드
async function loadAdminLog() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-log-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        const logs = await db.collection('admin_log')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        
        if (logs.empty) {
            container.innerHTML = '<p style="color:var(--accent);">로그가 없습니다.</p>';
            return;
        }
        
        let html = '';
        logs.forEach(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ko-KR') : '-';
            
            let actionText = '';
            let actionColor = '';
            switch (log.action) {
                case 'force_close_all':
                    actionText = '💥 강제 청산';
                    actionColor = '#cc0000';
                    break;
                case 'suspend_trading':
                    actionText = '⛔ 거래 중단';
                    actionColor = '#ff9800';
                    break;
                case 'resume_trading':
                    actionText = '✅ 중단 해제';
                    actionColor = '#4caf50';
                    break;
                default:
                    actionText = log.action;
                    actionColor = '#666';
            }
            
            html += `
                <div style="padding:0.6rem; border-bottom:1px solid var(--border); font-size:0.85rem;">
                    <span style="color:${actionColor}; font-weight:600;">${actionText}</span>
                    <span style="color:var(--accent); margin-left:0.5rem;">${time}</span>
                    ${log.reason ? `<div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">사유: ${log.reason}</div>` : ''}
                    ${log.totalPnL !== undefined ? `<div style="font-size:0.75rem; margin-top:0.2rem;">손익: $${log.totalPnL.toFixed(2)}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로그 로드 실패: ${error.message}</p>`;
    }
}

// ========== PROP TRADING ==========
async function loadPropTrading() {
    const container = document.getElementById('trading-challenges');
    container.innerHTML = '<p style="text-align:center; padding:2rem;">로딩 중...</p>';
    
    try {
        const challenges = await db.collection('prop_challenges')
            .where('status', '==', 'active')
            .get();
        
        container.innerHTML = '';
        
        if (challenges.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;">📊</p>
                    <p>진행 중인 챌린지가 없습니다</p>
                </div>
            `;
            return;
        }
        
        for (const doc of challenges.docs) {
            const ch = doc.data();
            const tiers = ch.tiers || {};
            const tierKeys = Object.keys(tiers).sort();
            
            // 티어 카드 생성
            let tierHTML = '';
            for (const key of tierKeys) {
                const t = tiers[key];
                tierHTML += `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center; border:1px solid var(--border);">
                        <div style="font-size:1.3rem; font-weight:800; color:#8B2BE2;">${key}군</div>
                        <div style="font-size:1.4rem; font-weight:700; color:#0066cc; margin:0.3rem 0;">${t.deposit} CRTD</div>
                        <div style="font-size:0.75rem; color:var(--accent); line-height:1.6;">
                            💰 $${(t.account||100000).toLocaleString()} 계좌<br>
                            💀 -$${(t.liquidation||3000).toLocaleString()} 청산<br>
                            📈 +$${(t.profitThreshold||1000).toLocaleString()}~ → CRTD<br>
                            💎 ${(t.withdrawUnit||1000).toLocaleString()} 단위 인출
                        </div>
                        <button onclick="joinChallenge('${doc.id}','${key}')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.6rem; font-size:0.9rem;">
                            🚀 ${key}군 참가
                        </button>
                    </div>
                `;
            }
            
            // 티어가 없으면 기본값 (하위 호환)
            if (tierKeys.length === 0) {
                tierHTML = `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center;">
                        <div style="font-size:1.2rem; font-weight:700; color:#0066cc;">${ch.entryFeeCRTD || 100} CRTD</div>
                        <button onclick="joinChallenge('${doc.id}','A')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.7rem;">
                            🚀 참가
                        </button>
                    </div>
                `;
            }
            
            const card = document.createElement('div');
            card.style.cssText = 'background:white; padding:1.5rem; border-radius:12px; margin-bottom:1rem; border:2px solid var(--border);';
            card.innerHTML = `
                <h3 style="margin-bottom:0.3rem;">${ch.name}</h3>
                <p style="color:var(--accent); margin-bottom:0.8rem; font-size:0.85rem;">${ch.description || ''}</p>
                
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:0.6rem; margin-bottom:0.8rem;">
                    ${tierHTML}
                </div>
                
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--accent); padding-top:0.5rem; border-top:1px solid var(--border);">
                    <span>📊 ${ch.allowedProduct || 'MNQ'} | 🔴 일일 -$${ch.dailyLossLimit || 500}</span>
                    <span>👥 ${ch.participants || 0}명 참가중</span>
                </div>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Load challenges error:', error);
        container.innerHTML = '<p style="text-align:center; color:red;">로딩 실패</p>';
    }
}

async function showCreateChallenge() {
    if (!isAdmin()) {
        alert('관리자만 챌린지를 생성할 수 있습니다');
        return;
    }
    
    const formHTML = `
        <div id="create-challenge-form" style="background:white; padding:1.5rem; border-radius:12px; margin-top:1rem; border:2px solid var(--accent);">
            <h3 style="margin-bottom:1rem;">🆕 CRTD 프랍 챌린지 생성</h3>
            
            <div style="display:grid; gap:0.8rem;">
                <div>
                    <label style="font-size:0.85rem; font-weight:600;">챌린지 이름</label>
                    <input type="text" id="ch-name" value="교육게임 v1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                </div>
                
                <!-- ★ 티어 설정 -->
                <div style="background:linear-gradient(135deg, rgba(138,43,226,0.05), rgba(0,102,204,0.05)); padding:1rem; border-radius:8px; border:1px solid rgba(138,43,226,0.2);">
                    <h4 style="margin-bottom:0.8rem;">💎 CRTD 티어 설정</h4>
                    <p style="font-size:0.75rem; color:var(--accent); margin-bottom:0.8rem;">사용하지 않을 티어는 참가비를 0으로 설정</p>
                    
                    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%;">
                        <table style="min-width:580px; border-collapse:collapse; font-size:0.82rem;">
                            <thead>
                                <tr style="background:var(--bg);">
                                    <th style="padding:0.4rem; text-align:left;">티어</th>
                                    <th style="padding:0.4rem;">참가비<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">가상계좌<br>($)</th>
                                    <th style="padding:0.4rem;">청산선<br>(-$)</th>
                                    <th style="padding:0.4rem;">수익기준<br>(+$)</th>
                                    <th style="padding:0.4rem;">인출단위<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">MNQ<br>최대</th>
                                    <th style="padding:0.4rem;">NQ<br>최대</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅰️ A군</td>
                                    <td><input type="number" id="tier-a-deposit" value="100" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-account" value="100000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-liq" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-profit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-mnq" value="3" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-nq" value="0" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr style="background:var(--bg);">
                                    <td style="padding:0.4rem; font-weight:700;">🅱️ B군</td>
                                    <td><input type="number" id="tier-b-deposit" value="200" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-account" value="150000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-liq" value="5000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-profit" value="1500" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-mnq" value="5" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-nq" value="1" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅲 C군</td>
                                    <td><input type="number" id="tier-c-deposit" value="500" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-account" value="300000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-liq" value="10000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-profit" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-mnq" value="10" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-nq" value="3" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">📊 상품 제한</label>
                        <select id="ch-product" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="MNQ">MNQ (마이크로) 전용</option>
                            <option value="NQ">NQ (미니) 전용</option>
                            <option value="BOTH">MNQ + NQ 모두</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">📦 최대 계약 수</label>
                        <input type="number" id="ch-max-contracts" value="1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">🔴 일일 손실 한도 ($)</label>
                        <input type="number" id="ch-daily-limit" value="500" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">📈 최대 동시 포지션</label>
                        <input type="number" id="ch-max-positions" value="5" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏳ 기간 (일)</label>
                        <input type="number" id="ch-duration" value="30" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏰ 정산</label>
                        <select id="ch-settlement" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="EOD">EOD (End of Day)</option>
                            <option value="WEEKLY">주간</option>
                            <option value="MONTHLY">월간</option>
                        </select>
                    </div>
                </div>
                
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button onclick="submitCreateChallenge()" class="btn-primary" style="flex:1; padding:0.8rem;">✅ 챌린지 생성</button>
                    <button onclick="document.getElementById('create-challenge-form').remove()" style="flex:0.5; padding:0.8rem; background:var(--border); border:none; border-radius:6px; cursor:pointer;">취소</button>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('create-challenge-form');
    if (existing) existing.remove();
    
    const container = document.getElementById('trading-challenges');
    if (container) {
        container.insertAdjacentHTML('afterend', formHTML);
    }
}

function readTierInput(prefix) {
    const deposit = parseFloat(document.getElementById(`tier-${prefix}-deposit`).value) || 0;
    if (deposit <= 0) return null; // 0이면 비활성
    return {
        deposit: deposit,
        account: parseFloat(document.getElementById(`tier-${prefix}-account`).value) || 100000,
        liquidation: parseFloat(document.getElementById(`tier-${prefix}-liq`).value) || 3000,
        profitThreshold: parseFloat(document.getElementById(`tier-${prefix}-profit`).value) || 1000,
        withdrawUnit: parseFloat(document.getElementById(`tier-${prefix}-unit`).value) || 1000,
        mnqMax: parseInt(document.getElementById(`tier-${prefix}-mnq`)?.value) || 1,
        nqMax: parseInt(document.getElementById(`tier-${prefix}-nq`)?.value) || 0
    };
}

async function submitCreateChallenge() {
    if (!isAdmin()) return;
    
    const name = document.getElementById('ch-name').value;
    if (!name) { alert('챌린지 이름을 입력하세요'); return; }
    
    // 티어 읽기
    const tiers = {};
    const tierA = readTierInput('a'); if (tierA) tiers.A = tierA;
    const tierB = readTierInput('b'); if (tierB) tiers.B = tierB;
    const tierC = readTierInput('c'); if (tierC) tiers.C = tierC;
    
    if (Object.keys(tiers).length === 0) {
        alert('최소 1개 티어의 참가비를 설정하세요');
        return;
    }
    
    try {
        const challengeData = {
            name: name,
            description: name,
            tiers: tiers,
            // 공통 설정
            allowedProduct: document.getElementById('ch-product').value || 'MNQ',
            maxContracts: parseInt(document.getElementById('ch-max-contracts').value) || 1,
            dailyLossLimit: parseFloat(document.getElementById('ch-daily-limit').value) || 500,
            maxPositions: parseInt(document.getElementById('ch-max-positions').value) || 5,
            duration: parseInt(document.getElementById('ch-duration').value) || 30,
            settlement: document.getElementById('ch-settlement').value || 'EOD',
            rewardToken: 'CRTD',
            participants: 0,
            totalPool: 0,
            status: 'active',
            createdBy: currentUser.email,
            createdAt: new Date()
        };
        
        await db.collection('prop_challenges').add(challengeData);
        
        const tierSummary = Object.entries(tiers).map(([k,v]) => `${k}군=${v.deposit}CRTD`).join(', ');
        alert(`✅ 챌린지 생성 완료!\n\n${name}\n티어: ${tierSummary}\n상품: ${challengeData.allowedProduct}`);
        
        document.getElementById('create-challenge-form')?.remove();
        loadPropTrading();
    } catch (error) {
        alert('생성 실패: ' + error.message);
    }
}

async function joinChallenge(challengeId, tierKey) {
    if (!currentUser) { alert('로그인이 필요합니다'); return; }
    
    const challenge = await db.collection('prop_challenges').doc(challengeId).get();
    const data = challenge.data();
    
    // ★ 티어 정보 로드
    const tiers = data.tiers || {};
    const tier = tiers[tierKey] || { deposit: data.entryFeeCRTD || 100, account: data.initialBalance || 100000, liquidation: 3000, profitThreshold: 1000, withdrawUnit: 1000 };
    
    // 중복 참가 체크
    const existing = await db.collection('prop_challenges').doc(challengeId)
        .collection('participants').where('userId', '==', currentUser.uid).where('status', '==', 'active').get();
    if (!existing.empty) {
        alert('이미 이 챌린지에 참가 중입니다.');
        return;
    }
    
    // CRTD 잔고 확인 (offchainBalances는 users 루트 문서에 저장됨)
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data() || {};
    const offchain = userData.offchainBalances || {};
    const crtdBalance = offchain.crtd || 0;
    
    console.log('🔍 joinChallenge 잔고체크:', { uid: currentUser.uid, offchain, crtdBalance, required: tier.deposit });
    
    if (crtdBalance < tier.deposit) {
        alert(`CRTD 잔액 부족 — 필요: ${tier.deposit}, 보유: ${crtdBalance}`);
        return;
    }
    
    const productText = data.allowedProduct === 'BOTH' ? 'MNQ + NQ' : (data.allowedProduct || 'MNQ');
    
    const confirmMsg = 
        `📋 ${data.name} (${tierKey}군)\n\n` +
        `💎 참가비: ${tier.deposit} CRTD\n` +
        `💰 가상 계좌: $${tier.account.toLocaleString()}\n` +
        `📊 상품: ${productText}\n` +
        `📈 포지션: 최대 ${data.maxPositions || 5}개\n\n` +
        `── 프랍 규칙 ──\n` +
        `💀 -$${tier.liquidation.toLocaleString()} → 계좌 청산 (${tier.deposit} CRTD 소멸)\n` +
        `📈 +$${tier.profitThreshold.toLocaleString()} 초과분 → 1:1 CRTD 변환\n` +
        `💰 ${tier.withdrawUnit.toLocaleString()} CRTD 단위 인출 가능\n` +
        `🔴 일일 한도: -$${data.dailyLossLimit || 500}\n\n` +
        `참가하시겠습니까?`;
    
    const ok = typeof showConfirmModal === 'function' 
        ? await showConfirmModal('🎯 CRTD 프랍 트레이딩', confirmMsg)
        : window.confirm(confirmMsg);
    
    if (!ok) return;
    
    try {
        // CRTD 차감
        await spendOffchainPoints('crtd', tier.deposit, `챌린지 참가: ${data.name} (${tierKey}군)`);
        
        // 참가자 추가
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').add({
                userId: currentUser.uid,
                email: currentUser.email,
                walletId: currentWalletId,
                joinedAt: new Date(),
                // ★ 티어 정보
                tier: tierKey,
                crtdDeposit: tier.deposit,
                liquidation: tier.liquidation,
                profitThreshold: tier.profitThreshold,
                withdrawUnit: tier.withdrawUnit,
                crtdWithdrawn: 0,
                // 가상 계좌
                initialBalance: tier.account,
                currentBalance: tier.account,
                // 공통 설정
                allowedProduct: data.allowedProduct || 'MNQ',
                tradingTier: tier.mnqMax !== undefined ? { MNQ: tier.mnqMax || 1, NQ: tier.nqMax || 0 } : (data.tradingTier || null),
                maxContracts: Math.max(tier.mnqMax || 1, tier.nqMax || 0, data.maxContracts || 1),
                copyAccounts: 1,
                maxPositions: data.maxPositions || 5,
                dailyLossLimit: data.dailyLossLimit || 500,
                maxDrawdown: tier.liquidation,
                // 트레이딩 상태
                profitPercent: 0,
                dailyPnL: 0,
                totalPnL: 0,
                trades: [],
                status: 'active',
                lastEOD: new Date()
            });
        
        await db.collection('prop_challenges').doc(challengeId).update({
            participants: (data.participants || 0) + 1,
            totalPool: (data.totalPool || 0) + tier.deposit
        });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid, fromEmail: currentUser.email,
            to: 'system:challenge', amount: tier.deposit, token: 'CRTD',
            type: 'challenge_entry', challengeId: challengeId, tier: tierKey,
            timestamp: new Date()
        });
        
        alert(
            `✅ 챌린지 참가 완료! (${tierKey}군)\n\n` +
            `💎 ${tier.deposit} CRTD 차감\n` +
            `💰 가상 계좌 $${tier.account.toLocaleString()} 지급\n\n` +
            `💀 -$${tier.liquidation.toLocaleString()} 청산\n` +
            `📈 +$${tier.profitThreshold.toLocaleString()}~ → CRTD 변환\n` +
            `💰 ${tier.withdrawUnit.toLocaleString()} CRTD 단위 인출`
        );
        
        // [v13] 챌린지 참가 시 소개자 수수료 제거 — 회원가입 보상으로 통합
        // await distributeReferralReward(currentUser.uid, Math.floor(tier.deposit * 0.1), 'CRTD');
        
        loadUserWallet();
        loadPropTrading();
        loadTradingDashboard();
    } catch (error) {
        console.error('Join error:', error);
        alert('참가 실패: ' + error.message);
    }
}

// ========== ART - 디지털 아트 거래소 ==========


// (ART 코드 → app-art.js로 분리됨)

// ========== MALL - 쇼핑몰 ==========

const MALL_CATEGORIES = { present:'💄 프레즌트', doctor:'💊 포닥터', medical:'🏥 메디컬', avls:'🎬 AVLs', solution:'🔐 프라이빗', architect:'🏗️ 아키텍트', mall:'🛒 크라우니몰', designers:'👗 디자이너스', other:'📦 기타' };

async function registerProduct() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const title = document.getElementById('product-title').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const imageFiles = document.getElementById('product-image').files;
    if (!title || !price) { showToast('상품명과 가격을 입력하세요', 'warning'); return; }
    if (!imageFiles || imageFiles.length === 0) { showToast('상품 이미지를 선택하세요', 'warning'); return; }
    if (imageFiles.length > 5) { showToast('이미지는 최대 5장까지 가능합니다', 'warning'); return; }
    
    try {
        // Multi-image: resize all images
        const images = [];
        for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
            const resized = await fileToBase64Resized(imageFiles[i], 400);
            images.push(resized);
        }
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        await db.collection('products').add({
            title, description: document.getElementById('product-desc').value.trim(),
            category: document.getElementById('product-category').value,
            price, priceToken: 'CRGC',
            stock: parseInt(document.getElementById('product-stock').value) || 1,
            images, // 다중 이미지 배열
            imageData: images[0], // 하위 호환: 첫번째 이미지
            sellerId: currentUser.uid, sellerEmail: currentUser.email,
            sellerNickname: userDoc.data()?.nickname || '',
            sold: 0, status: (currentUser.email === 'kim.president.sk@gmail.com') ? 'active' : 'pending', createdAt: new Date()
        });
        
        showToast(`🛒 "${title}" 등록 완료!`, 'success');
        document.getElementById('product-title').value = '';
        document.getElementById('product-desc').value = '';
        document.getElementById('product-image').value = '';
        const preview = document.getElementById('product-image-preview');
        if (preview) preview.innerHTML = '';
        loadMallProducts();
    } catch (e) { showToast('등록 실패: ' + e.message, 'error'); }
}

// ========== 오프체인/CRNY 비율 관리 (수퍼관리자) ==========

// 현재 비율 로드 (토큰별 개별 비율)
async function loadExchangeRate() {
    try {
        const doc = await db.collection('admin_config').doc('exchange_rate').get();
        if (doc.exists) {
            const data = doc.data();
            const legacyRate = data.rate || 100;
            
            // Per-token rates
            window.OFFCHAIN_RATES = data.rates || {crtd: legacyRate, crac: legacyRate, crgc: legacyRate, creb: legacyRate};
            window.OFFCHAIN_RATE = legacyRate; // backward compat
            
            // Update UI inputs
            ['crtd','crac','crgc','creb'].forEach(t => {
                const el = document.getElementById('rate-' + t);
                if (el) el.value = window.OFFCHAIN_RATES[t] || legacyRate;
            });
            
            // History display (token info + reason)
            if (data.history && data.history.length > 0) {
                const histEl = document.getElementById('admin-rate-history');
                if (histEl) {
                    histEl.innerHTML = data.history.slice(-20).reverse().map(h => {
                        const date = h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString('ko-KR') : new Date(h.timestamp).toLocaleString('ko-KR');
                        const tokenLabel = h.token ? h.token.toUpperCase() : '전체';
                        return `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem; font-size:0.8rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div><span style="background:#e3f2fd; color:#1565c0; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.7rem; font-weight:700;">${tokenLabel}</span> <strong>${h.oldRate} → ${h.newRate}</strong></div>
                                <span style="color:var(--accent); font-size:0.7rem;">${date}</span>
                            </div>
                            <div style="color:#666; font-size:0.75rem; margin-top:0.2rem;">📝 ${h.reason || '-'}</div>
                            <div style="color:var(--accent); font-size:0.7rem;">${h.adminEmail}</div>
                        </div>`;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.warn('비율 로드 실패:', e);
    }
}

// 비율 변경 요청 (토큰별 개별 비율, 2단계 확인)
async function requestRateChange() {
    if (!isSuperAdmin()) { showToast('수퍼관리자만 변경 가능합니다', 'warning'); return; }
    
    const reason = (document.getElementById('rate-change-reason')?.value || '').trim();
    if (!reason) { showToast('변경 사유를 입력하세요', 'warning'); return; }
    
    const tokens = ['crtd', 'crac', 'crgc', 'creb'];
    const currentRates = window.OFFCHAIN_RATES || {};
    const newRates = {};
    const changes = [];
    
    for (const t of tokens) {
        const val = parseInt(document.getElementById('rate-' + t)?.value);
        if (!val || val < 1 || val > 10000) {
            showToast(`${t.toUpperCase()} 비율이 유효하지 않습니다 (1~10,000)`, 'error');
            return;
        }
        newRates[t] = val;
        const oldVal = currentRates[t] || 100;
        if (val !== oldVal) {
            changes.push({token: t, oldRate: oldVal, newRate: val});
        }
    }
    
    if (changes.length === 0) { showToast('변경된 비율이 없습니다', 'info'); return; }
    
    const changeText = changes.map(c => `${c.token.toUpperCase()}: ${c.oldRate} → ${c.newRate}`).join('\n');
    const confirmed = await showConfirmModal('⚖️ 비율 변경 확인', `다음 비율이 변경됩니다:\n\n${changeText}\n\n사유: ${reason}\n\n모든 브릿지 거래에 즉시 적용됩니다.`);
    if (!confirmed) return;
    
    // 2차 확인
    const code = await showPromptModal('보안 확인', '"RATE" 를 정확히 입력하세요:', '');
    if (code !== 'RATE') { showToast('확인 코드 불일치. 변경 취소됨.', 'error'); return; }
    
    try {
        const doc = await db.collection('admin_config').doc('exchange_rate').get();
        const existingHistory = doc.exists ? (doc.data().history || []) : [];
        
        for (const c of changes) {
            existingHistory.push({
                token: c.token,
                oldRate: c.oldRate,
                newRate: c.newRate,
                reason: reason,
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                timestamp: new Date()
            });
        }
        
        await db.collection('admin_config').doc('exchange_rate').set({
            rates: newRates,
            rate: newRates.crtd, // legacy compat
            lastChangedBy: currentUser.email,
            lastChangedAt: new Date(),
            history: existingHistory
        });
        
        await db.collection('admin_log').add({
            action: 'exchange_rate_change',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            changes: changes,
            reason: reason,
            timestamp: new Date()
        });
        
        window.OFFCHAIN_RATES = newRates;
        window.OFFCHAIN_RATE = newRates.crtd;
        
        showToast(`✅ ${changes.length}개 토큰 비율 변경 완료!`, 'success');
        document.getElementById('rate-change-reason').value = '';
        loadExchangeRate();
        
    } catch (e) {
        showToast('비율 변경 실패: ' + e.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════
// 쿠폰 관리 (admin-tab-coupon)
// ═══════════════════════════════════════════════════════

async function createCoupon() {
    const name = (document.getElementById('coupon-name').value || '').trim();
    const code = (document.getElementById('coupon-code').value || '').trim().toUpperCase();
    const tokenKey = document.getElementById('coupon-token').value;
    const amount = parseInt(document.getElementById('coupon-amount').value);
    const maxUses = parseInt(document.getElementById('coupon-max-uses').value) || 0;
    const expiryVal = document.getElementById('coupon-expiry').value;
    const description = (document.getElementById('coupon-desc').value || '').trim();

    if (!name) { showToast('쿠폰 이름을 입력하세요', 'error'); return; }
    if (!code || code.length < 3) { showToast('쿠폰 코드는 3자 이상 영문/숫자로 입력하세요', 'error'); return; }
    if (!tokenKey) { showToast('토큰을 선택하세요', 'error'); return; }
    if (!amount || amount <= 0) { showToast('유효한 수량을 입력하세요', 'error'); return; }

    try {
        const existing = await db.collection('coupons').where('code', '==', code).get();
        if (!existing.empty) { showToast('이미 존재하는 쿠폰 코드입니다', 'error'); return; }

        await db.collection('coupons').add({
            name: name,
            code: code,
            tokenKey: tokenKey,
            amount: amount,
            maxUses: maxUses,
            usedCount: 0,
            expiresAt: expiryVal ? firebase.firestore.Timestamp.fromDate(new Date(expiryVal)) : null,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            enabled: true,
            description: description
        });

        showToast('✅ 쿠폰 생성 완료: ' + code, 'success');
        document.getElementById('coupon-name').value = '';
        document.getElementById('coupon-code').value = '';
        document.getElementById('coupon-amount').value = '';
        document.getElementById('coupon-desc').value = '';
        loadCouponList();
    } catch (e) {
        showToast(t('admin.coupon_fail','쿠폰 생성 실패: ') + e.message, 'error');
    }
}

async function loadCouponList() {
    const listEl = document.getElementById('coupon-list');
    if (!listEl) return;
    listEl.innerHTML = '<p>로딩 중...</p>';

    try {
        const snap = await db.collection('coupons').orderBy('createdAt', 'desc').get();
        if (snap.empty) { listEl.innerHTML = '<p style="color:#999;">생성된 쿠폰이 없습니다</p>'; return; }

        const tokenNames = { crtd: 'CRTD', crac: 'CRAC', crgc: 'CRGC', creb: 'CREB' };
        let html = '<table style="width:100%; border-collapse:collapse; font-size:0.8rem;"><tr style="background:#f5f5f5;"><th style="padding:0.5rem; text-align:left;">쿠폰</th><th>토큰</th><th>수량</th><th>사용</th><th>상태</th><th>관리</th></tr>';

        snap.forEach(doc => {
            const c = doc.data();
            const expiry = c.expiresAt ? c.expiresAt.toDate().toLocaleDateString('ko-KR') : '무제한';
            const usageText = c.maxUses > 0 ? `${c.usedCount}/${c.maxUses}` : `${c.usedCount}/∞`;
            const statusColor = c.enabled ? '#2e7d32' : '#c62828';
            const statusText = c.enabled ? '활성' : '비활성';
            const couponName = c.name || c.code;
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:0.5rem;">
                    <div style="font-weight:700;">${couponName}</div>
                    <div style="font-size:0.7rem; color:#888; font-family:monospace;">코드: ${c.code}</div>
                </td>
                <td style="text-align:center;">${tokenNames[c.tokenKey] || c.tokenKey}</td>
                <td style="text-align:center;">${c.amount.toLocaleString()}</td>
                <td style="text-align:center;">${usageText}</td>
                <td style="text-align:center; color:${statusColor}; font-weight:600;">${statusText}</td>
                <td style="text-align:center;">
                    <div style="display:flex; flex-direction:column; gap:3px; align-items:center;">
                        <button onclick="toggleCoupon('${doc.id}', ${!c.enabled})" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:${c.enabled ? '#ffcdd2' : '#c8e6c9'}; color:${c.enabled ? '#c62828' : '#2e7d32'}; width:100%;">${c.enabled ? '비활성화' : '활성화'}</button>
                        <button onclick="viewCouponLog('${doc.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#e3f2fd; color:#1565c0; width:100%;">📜 로그</button>
                        <button onclick="deleteCoupon('${doc.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#fce4ec; color:#c62828; width:100%;">🗑️ 삭제</button>
                    </div>
                </td>
            </tr>`;
            if (c.description) {
                html += `<tr><td colspan="6" style="padding:0.2rem 0.5rem; font-size:0.7rem; color:#999;">📝 ${c.description} | 만료: ${expiry}</td></tr>`;
            }
        });
        html += '</table>';
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '<p style="color:red;">로드 실패: ' + e.message + '</p>';
    }
}

async function toggleCoupon(couponId, enabled) {
    try {
        await db.collection('coupons').doc(couponId).update({ enabled: enabled });
        loadCouponList();
    } catch (e) {
        showToast('상태 변경 실패: ' + e.message, 'error');
    }
}

async function deleteCoupon(couponId, code) {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(`쿠폰 "${code}" 를 삭제하시겠습니까?\n사용 로그는 유지됩니다.`, async () => {
            try {
                await db.collection('coupons').doc(couponId).delete();
                showToast('🗑️ 쿠폰 삭제 완료', 'success');
                loadCouponList();
            } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    } else {
        if (!confirm(`쿠폰 "${code}" 를 삭제하시겠습니까?`)) return;
        try {
            await db.collection('coupons').doc(couponId).delete();
            showToast('🗑️ 쿠폰 삭제 완료', 'success');
            loadCouponList();
        } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
    }
}

async function viewCouponLog(couponId, code) {
    const section = document.getElementById('coupon-log-section');
    const listEl = document.getElementById('coupon-log-list');
    if (!section || !listEl) return;
    section.style.display = 'block';
    listEl.innerHTML = '<p>로딩 중...</p>';
    section.scrollIntoView({ behavior: 'smooth' });

    try {
        // coupon_logs 컬렉션에서 조회
        const snap = await db.collection('coupon_logs').where('couponId', '==', couponId).orderBy('usedAt', 'desc').limit(100).get();
        if (snap.empty) {
            // fallback: coupons/{id}/usage 서브컬렉션
            const snap2 = await db.collection('coupons').doc(couponId).collection('usage').orderBy('usedAt', 'desc').limit(100).get();
            if (snap2.empty) { listEl.innerHTML = `<p style="color:#999;">📜 "${code}" 사용 내역이 없습니다.</p>`; return; }
            renderCouponLog(snap2, listEl, code);
            return;
        }
        renderCouponLog(snap, listEl, code);
    } catch (e) {
        // index 없을 수 있으므로 orderBy 없이 재시도
        try {
            const snap = await db.collection('coupon_logs').where('couponId', '==', couponId).limit(100).get();
            if (snap.empty) { listEl.innerHTML = `<p style="color:#999;">📜 "${code}" 사용 내역이 없습니다.</p>`; return; }
            renderCouponLog(snap, listEl, code);
        } catch (e2) {
            listEl.innerHTML = `<p style="color:red;">로그 조회 실패: ${e2.message}</p>`;
        }
    }
}

function renderCouponLog(snap, listEl, code) {
    let html = `<p style="font-weight:700; margin-bottom:0.5rem;">📜 "${code}" 사용 로그 (${snap.size}건)</p>`;
    html += '<table style="width:100%; border-collapse:collapse; font-size:0.75rem;"><tr style="background:#f5f5f5;"><th style="padding:0.4rem;">일시</th><th>사용자</th><th>수량</th></tr>';
    snap.forEach(doc => {
        const d = doc.data();
        const date = d.usedAt ? (d.usedAt.toDate ? d.usedAt.toDate() : new Date(d.usedAt)) : null;
        const dateStr = date ? date.toLocaleString('ko-KR') : '-';
        const user = d.userEmail || d.userId || '-';
        const amt = d.amount ? d.amount.toLocaleString() : '-';
        html += `<tr style="border-bottom:1px solid #eee;"><td style="padding:0.4rem; text-align:center;">${dateStr}</td><td style="text-align:center;">${user}</td><td style="text-align:center;">${amt}</td></tr>`;
    });
    html += '</table>';
    listEl.innerHTML = html;
}

function closeCouponLog() {
    const section = document.getElementById('coupon-log-section');
    if (section) section.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// 🏦 슈퍼관리자 계좌 관리 (오리지널 + 운영)
// ═══════════════════════════════════════════════════════

async function loadSuperAdminWallets() {
    if (!isSuperAdmin()) return;
    const container = document.getElementById('admin-tab-superwall');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = '<div style="background:white;padding:1.5rem;border-radius:12px;"><p style="color:var(--accent);">🔄 계좌 정보 로드 중...</p></div>';
    
    try {
        const uid = currentUser.uid;
        const walletsRef = db.collection('users').doc(uid).collection('wallets');
        
        // Load or create wallet docs
        const [originalDoc, operatingDoc, defaultDoc] = await Promise.all([
            walletsRef.doc('original').get(),
            walletsRef.doc('operating').get(),
            walletsRef.doc('default').get()
        ]);
        
        // Get active wallet setting
        const userDoc = await db.collection('users').doc(uid).get();
        const activeWallet = userDoc.data()?.activeWallet || 'default';
        
        const wallets = {
            original: originalDoc.exists ? originalDoc.data() : null,
            operating: operatingDoc.exists ? operatingDoc.data() : null,
            default: defaultDoc.exists ? defaultDoc.data() : null
        };
        
        // Format balances
        function formatBal(walletData) {
            if (!walletData) return '<span style="color:#999;">미생성</span>';
            const bal = walletData.offchainBalances || walletData.balances || {};
            const entries = Object.entries(bal).filter(([,v]) => v > 0);
            if (entries.length === 0) return '<span style="color:#999;">잔액 없음</span>';
            return entries.map(([k, v]) => `<span style="font-size:0.8rem;">${k.toUpperCase()}: <strong>${v.toLocaleString()}</strong></span>`).join(' · ');
        }
        
        function walletCard(type, label, icon, color, data) {
            const isActive = activeWallet === type;
            const exists = !!data;
            return `
                <div style="background:${isActive ? `linear-gradient(135deg,${color}15,${color}08)` : 'white'};padding:1.2rem;border-radius:12px;border:2px solid ${isActive ? color : '#eee'};position:relative;">
                    ${isActive ? `<span style="position:absolute;top:8px;right:8px;background:${color};color:white;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">활성</span>` : ''}
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.8rem;">
                        <span style="font-size:1.5rem;">${icon}</span>
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${label}</div>
                            <div style="font-size:0.7rem;color:#999;">${type === 'original' ? '원본 자산 보관 (안전 금고)' : type === 'operating' ? '일상 운영/거래용' : '기존 기본 지갑'}</div>
                        </div>
                    </div>
                    <div style="margin-bottom:0.8rem;">${formatBal(data)}</div>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        ${!exists ? `<button onclick="createSuperWallet('${type}')" style="background:${color};color:white;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;">➕ 생성</button>` : ''}
                        ${exists && !isActive ? `<button onclick="switchActiveWallet('${type}')" style="background:${color};color:white;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;">🔄 활성화</button>` : ''}
                        ${exists ? `<button onclick="showInternalTransfer('${type}')" style="background:#455a64;color:white;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;">↔️ 이체</button>` : ''}
                    </div>
                </div>`;
        }
        
        container.innerHTML = `
            <div style="background:white;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
                <h3 style="margin-bottom:0.3rem;">🏦 슈퍼관리자 계좌 관리</h3>
                <p style="font-size:0.78rem;color:#666;margin-bottom:1.2rem;">오리지널 계좌(금고)와 운영 계좌를 분리 관리합니다. 오리지널 계좌 출금 시 2단계 확인이 필요합니다.</p>
                
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;">
                    ${walletCard('original', '오리지널 계좌', '🔐', '#FF6D00', wallets.original)}
                    ${walletCard('operating', '운영 계좌', '⚡', '#1565C0', wallets.operating)}
                    ${walletCard('default', '기본 지갑', '💼', '#2E7D32', wallets.default)}
                </div>
            </div>
            
            <div style="background:white;padding:1.5rem;border-radius:12px;">
                <h4 style="margin-bottom:0.8rem;">📜 내부 이체 로그</h4>
                <div id="super-wallet-log" style="max-height:300px;overflow-y:auto;"><p style="color:#999;font-size:0.8rem;">로그 로딩 중...</p></div>
            </div>`;
        
        // Load transfer logs
        loadSuperWalletLog();
    } catch (e) {
        container.innerHTML = `<div style="background:white;padding:1.5rem;border-radius:12px;"><p style="color:red;">로드 실패: ${e.message}</p></div>`;
    }
}

async function createSuperWallet(type) {
    if (!isSuperAdmin()) return;
    const labels = { original: '오리지널 계좌 (금고)', operating: '운영 계좌', default: '기본 지갑' };
    const confirmed = await showConfirmModal('🏦 계좌 생성', `${labels[type]}을(를) 생성하시겠습니까?\n\n빈 잔액으로 생성됩니다.`);
    if (!confirmed) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).collection('wallets').doc(type).set({
            type: type,
            offchainBalances: {},
            balances: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.email
        });
        showToast(`✅ ${labels[type]} 생성 완료`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('생성 실패: ' + e.message, 'error');
    }
}

async function switchActiveWallet(type) {
    if (!isSuperAdmin()) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ activeWallet: type });
        showToast(`🔄 활성 계좌 → ${type}`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('전환 실패: ' + e.message, 'error');
    }
}

async function showInternalTransfer(fromType) {
    if (!isSuperAdmin()) return;
    
    const targets = ['original', 'operating', 'default'].filter(t => t !== fromType);
    const labels = { original: '🔐 오리지널', operating: '⚡ 운영', default: '💼 기본' };
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:white;padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:0.5rem;">↔️ 내부 이체</h3>
            <p style="font-size:0.8rem;color:#666;margin-bottom:1rem;">보내는 계좌: <strong>${labels[fromType]}</strong></p>
            
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#666;">받는 계좌</label>
                <select id="transfer-to" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
                    ${targets.map(t => `<option value="${t}">${labels[t]}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#666;">토큰</label>
                <input type="text" id="transfer-token" placeholder="예: crtd" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#666;">수량</label>
                <input type="number" id="transfer-amount" min="1" placeholder="0" style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
            
            ${fromType === 'original' ? '<p style="font-size:0.75rem;color:#FF6D00;margin-bottom:0.8rem;">⚠️ 오리지널 계좌 출금: 2단계 확인 필요</p>' : ''}
            
            <div style="display:flex;gap:0.5rem;">
                <button id="transfer-submit" style="flex:1;padding:0.7rem;background:#1565C0;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">💸 이체</button>
                <button id="transfer-cancel" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">취소</button>
            </div>
        </div>`;
    
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#transfer-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#transfer-submit').onclick = async () => {
        const toType = document.getElementById('transfer-to').value;
        const tokenKey = (document.getElementById('transfer-token').value || '').trim().toLowerCase();
        const amount = parseInt(document.getElementById('transfer-amount').value);
        
        if (!tokenKey || !amount || amount <= 0) { showToast('토큰과 수량을 입력하세요', 'warning'); return; }
        
        // Check balance
        const fromDoc = await db.collection('users').doc(currentUser.uid).collection('wallets').doc(fromType).get();
        if (!fromDoc.exists) { showToast('보내는 계좌가 없습니다', 'error'); return; }
        const fromBal = (fromDoc.data().offchainBalances || {})[tokenKey] || 0;
        if (fromBal < amount) { showToast(`잔액 부족: ${tokenKey.toUpperCase()} ${fromBal} < ${amount}`, 'error'); return; }
        
        // 2-step confirm for original account
        if (fromType === 'original') {
            const ok1 = await showConfirmModal('🔐 오리지널 계좌 출금 확인', `오리지널 계좌(금고)에서 ${amount.toLocaleString()} ${tokenKey.toUpperCase()}를 ${labels[toType]}로 이체합니다.\n\n이 작업은 관리자 로그에 기록됩니다.`);
            if (!ok1) return;
            const code = await showPromptModal('보안 확인', '"CONFIRM"을 정확히 입력하세요:', '');
            if (code !== 'CONFIRM') { showToast('확인 코드 불일치. 이체 취소됨.', 'error'); return; }
        }
        
        try {
            const uid = currentUser.uid;
            const toDoc = await db.collection('users').doc(uid).collection('wallets').doc(toType).get();
            const toBal = toDoc.exists ? ((toDoc.data().offchainBalances || {})[tokenKey] || 0) : 0;
            
            // If target wallet doesn't exist, create it
            if (!toDoc.exists) {
                await db.collection('users').doc(uid).collection('wallets').doc(toType).set({
                    type: toType, offchainBalances: {}, balances: {},
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Update both wallets
            await db.collection('users').doc(uid).collection('wallets').doc(fromType).update({
                [`offchainBalances.${tokenKey}`]: fromBal - amount
            });
            await db.collection('users').doc(uid).collection('wallets').doc(toType).update({
                [`offchainBalances.${tokenKey}`]: toBal + amount
            });
            
            // Log
            await db.collection('admin_log').add({
                action: 'super_internal_transfer',
                adminEmail: currentUser.email,
                fromWallet: fromType,
                toWallet: toType,
                token: tokenKey,
                amount: amount,
                timestamp: new Date()
            });
            
            overlay.remove();
            showToast(`✅ ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 이체 완료 (${fromType} → ${toType})`, 'success');
            loadSuperAdminWallets();
        } catch (e) {
            showToast('이체 실패: ' + e.message, 'error');
        }
    };
}

async function loadSuperWalletLog() {
    const container = document.getElementById('super-wallet-log');
    if (!container) return;
    
    try {
        const logs = await db.collection('admin_log')
            .where('action', '==', 'super_internal_transfer')
            .orderBy('timestamp', 'desc').limit(20).get();
        
        if (logs.empty) { container.innerHTML = '<p style="font-size:0.8rem;color:#999;">이체 내역 없음</p>'; return; }
        
        const labels = { original: '🔐 오리지널', operating: '⚡ 운영', default: '💼 기본' };
        let html = '';
        logs.forEach(doc => {
            const d = doc.data();
            const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.5rem;border-bottom:1px solid #eee;font-size:0.8rem;">
                <div style="display:flex;justify-content:space-between;">
                    <span><strong>${d.amount?.toLocaleString()} ${(d.token||'').toUpperCase()}</strong> ${labels[d.fromWallet]||d.fromWallet} → ${labels[d.toWallet]||d.toWallet}</span>
                    <span style="color:#999;font-size:0.72rem;">${time}</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p style="color:red;font-size:0.8rem;">로그 로드 실패: ${e.message}</p>`;
    }
}

// ═══════════════════════════════════════════════════════
// 📈 대시보드 통계 (admin-tab-dashboard)
// ═══════════════════════════════════════════════════════

let _dashboardCache = null;
let _dashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // 5분

async function loadAdminDashboardStats(forceRefresh = false) {
    if (!hasLevel(3)) return;

    const now = Date.now();

    // 로컬 메모리 캐시 체크
    if (!forceRefresh && _dashboardCache && (now - _dashboardCacheTime < DASHBOARD_CACHE_TTL)) {
        renderDashboardStats(_dashboardCache);
        return;
    }

    // Firestore 캐시 체크
    if (!forceRefresh) {
        try {
            const cacheDoc = await db.collection('admin_config').doc('dashboard_cache').get();
            if (cacheDoc.exists) {
                const cached = cacheDoc.data();
                const cachedAt = cached.cachedAt?.toMillis?.() || 0;
                if (now - cachedAt < DASHBOARD_CACHE_TTL) {
                    _dashboardCache = cached;
                    _dashboardCacheTime = cachedAt;
                    renderDashboardStats(cached);
                    return;
                }
            }
        } catch (e) { console.warn('대시보드 캐시 로드 실패:', e); }
    }

    // 데이터 수집
    const cacheInfoEl = document.getElementById('dashboard-cache-info');
    if (cacheInfoEl) cacheInfoEl.textContent = t('admin.dash_loading', '집계 중...');

    try {
        const stats = {};

        // 날짜 기준
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        // 1) 사용자 통계
        const usersSnap = await db.collection('users').get();
        stats.totalUsers = usersSnap.size;
        let todayUsers = 0, weekUsers = 0;
        usersSnap.forEach(doc => {
            const d = doc.data();
            const created = d.createdAt?.toDate?.() || (d.createdAt ? new Date(d.createdAt) : null);
            if (created) {
                if (created >= todayStart) todayUsers++;
                if (created >= weekStart) weekUsers++;
            }
        });
        stats.todayUsers = todayUsers;
        stats.weekUsers = weekUsers;

        // 최근 7일 가입자 (일별)
        const signups7d = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(todayStart); d.setDate(d.getDate() - i);
            signups7d[d.toISOString().slice(0,10)] = 0;
        }
        usersSnap.forEach(doc => {
            const d = doc.data();
            const created = d.createdAt?.toDate?.() || (d.createdAt ? new Date(d.createdAt) : null);
            if (created) {
                const key = created.toISOString().slice(0,10);
                if (key in signups7d) signups7d[key]++;
            }
        });
        stats.signups7d = signups7d;

        // 2) 거래 통계
        const txSnap = await db.collection('offchain_transactions').get();
        stats.totalTx = txSnap.size;
        let todayTx = 0;
        const txByToken = {};
        txSnap.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate?.() || null;
            if (ts && ts >= todayStart) todayTx++;
            const tk = (d.token || 'unknown').toUpperCase();
            txByToken[tk] = (txByToken[tk] || 0) + Math.abs(d.amount || 0);
        });
        stats.todayTx = todayTx;
        stats.txByToken = txByToken;

        // 3) 섹션별 통계
        const sections = {};

        // MALL
        const productsSnap = await db.collection('products').get();
        const ordersSnap = await db.collection('orders').get();
        let mallRevenue = 0;
        ordersSnap.forEach(doc => { mallRevenue += doc.data().totalPrice || doc.data().price || 0; });
        sections.mall = { icon: '🛒', label: 'MALL', items: [
            { label: t('admin.dash.total_products','총 상품'), value: productsSnap.size },
            { label: t('admin.dash.total_orders','총 주문'), value: ordersSnap.size },
            { label: t('admin.dash.total_revenue','총 매출'), value: mallRevenue.toLocaleString() + ' pt' }
        ]};

        // ART
        let artCount = 0, artSold = 0;
        try {
            const artSnap = await db.collection('artworks').get();
            artCount = artSnap.size;
            artSnap.forEach(doc => { artSold += doc.data().sold || 0; });
        } catch(e) {}
        sections.art = { icon: '🎭', label: 'ART', items: [
            { label: t('admin.dash.total_artworks','총 작품'), value: artCount },
            { label: t('admin.dash.total_art_sold','총 판매'), value: artSold }
        ]};

        // BOOKS
        let bookCount = 0, bookSold = 0;
        try {
            const bookSnap = await db.collection('books').get();
            bookCount = bookSnap.size;
            bookSnap.forEach(doc => { bookSold += doc.data().sold || 0; });
        } catch(e) {}
        sections.books = { icon: '📚', label: 'BOOKS', items: [
            { label: t('admin.dash.total_books','총 등록 책'), value: bookCount },
            { label: t('admin.dash.total_book_sold','총 판매'), value: bookSold }
        ]};

        // TRADING
        let activeChallenges = 0, totalParticipants = 0;
        try {
            const chSnap = await db.collection('prop_challenges').where('status', '==', 'active').get();
            activeChallenges = chSnap.size;
            for (const doc of chSnap.docs) {
                totalParticipants += doc.data().participants || 0;
            }
        } catch(e) {}
        sections.trading = { icon: '📊', label: 'TRADING', items: [
            { label: t('admin.dash.active_challenges','활성 챌린지'), value: activeChallenges },
            { label: t('admin.dash.participants','참가자'), value: totalParticipants }
        ]};

        // SOCIAL
        let postCount = 0, commentCount = 0;
        try {
            const postSnap = await db.collection('posts').get();
            postCount = postSnap.size;
            // 댓글은 서브컬렉션이므로 대략적으로 카운트
            for (const doc of postSnap.docs) {
                const comments = await doc.ref.collection('comments').get();
                commentCount += comments.size;
                if (commentCount > 500) break; // 성능 보호
            }
        } catch(e) {}
        sections.social = { icon: '💬', label: 'SOCIAL', items: [
            { label: t('admin.dash.total_posts','총 게시물'), value: postCount },
            { label: t('admin.dash.total_comments','총 댓글'), value: commentCount > 500 ? '500+' : commentCount }
        ]};

        stats.sections = sections;

        // Firestore에 캐시 저장
        try {
            await db.collection('admin_config').doc('dashboard_cache').set({
                ...stats,
                cachedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.warn('대시보드 캐시 저장 실패:', e); }

        _dashboardCache = stats;
        _dashboardCacheTime = Date.now();
        renderDashboardStats(stats);

    } catch (e) {
        console.error('대시보드 통계 로드 실패:', e);
        if (cacheInfoEl) cacheInfoEl.textContent = '로드 실패: ' + e.message;
    }
}

function renderDashboardStats(stats) {
    // 사용자 통계
    const el = (id) => document.getElementById(id);
    if (el('dash-total-users')) el('dash-total-users').textContent = (stats.totalUsers || 0).toLocaleString();
    if (el('dash-today-users')) el('dash-today-users').textContent = (stats.todayUsers || 0).toLocaleString();
    if (el('dash-week-users')) el('dash-week-users').textContent = (stats.weekUsers || 0).toLocaleString();

    // 거래 통계
    if (el('dash-total-tx')) el('dash-total-tx').textContent = (stats.totalTx || 0).toLocaleString();
    if (el('dash-today-tx')) el('dash-today-tx').textContent = (stats.todayTx || 0).toLocaleString();

    // 토큰별 거래량
    const txByToken = stats.txByToken || {};
    const tokenEl = el('dash-tx-by-token');
    if (tokenEl) {
        tokenEl.innerHTML = Object.entries(txByToken).map(([tk, vol]) => {
            const info = typeof getTokenInfo === 'function' ? getTokenInfo(tk.toLowerCase()) : { icon: '🪙', color: '#888' };
            return `<div style="background:${info.color}11; border:1px solid ${info.color}33; padding:0.5rem; border-radius:8px; text-align:center;">
                <div style="font-size:0.7rem; color:${info.color};">${info.icon || '🪙'} ${tk}</div>
                <div style="font-size:1rem; font-weight:700;">${vol.toLocaleString()}</div>
            </div>`;
        }).join('');
    }

    // 섹션별 통계
    const sections = stats.sections || {};
    const sectionEl = el('dash-section-stats');
    if (sectionEl) {
        const colors = { mall: '#00BFA5', art: '#E91E63', books: '#FF9800', trading: '#FF6D00', social: '#2196F3' };
        sectionEl.innerHTML = Object.entries(sections).map(([key, sec]) => {
            const color = colors[key] || '#607D8B';
            return `<div style="background:white; border:1px solid ${color}33; border-left:4px solid ${color}; padding:1rem; border-radius:10px;">
                <div style="font-weight:700; margin-bottom:0.5rem;">${sec.icon} ${sec.label}</div>
                ${(sec.items || []).map(item => `<div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:0.2rem 0;">
                    <span style="color:#666;">${item.label}</span>
                    <strong>${item.value}</strong>
                </div>`).join('')}
            </div>`;
        }).join('');
    }

    // 차트: 최근 7일 가입자 바 차트
    const signups7d = stats.signups7d || {};
    const chartEl = el('dash-chart-signups');
    if (chartEl) {
        const values = Object.values(signups7d);
        const maxVal = Math.max(...values, 1);
        chartEl.innerHTML = Object.entries(signups7d).map(([date, count]) => {
            const pct = Math.max((count / maxVal) * 100, 2);
            const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { weekday: 'short' });
            return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
                <span style="font-size:0.7rem; font-weight:700; color:#1565c0;">${count}</span>
                <div style="width:100%; background:linear-gradient(180deg,#42a5f5,#1565c0); border-radius:4px 4px 0 0; height:${pct}%; min-height:4px; transition:height 0.3s;"></div>
                <span style="font-size:0.65rem; color:#999;">${dayLabel}</span>
            </div>`;
        }).join('');
    }

    // 차트: 토큰별 거래량 바 차트
    const chartTokenEl = el('dash-chart-tokens');
    if (chartTokenEl) {
        const entries = Object.entries(txByToken);
        if (entries.length === 0) {
            chartTokenEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;color:#999;font-size:0.85rem;">거래 데이터 없음</div>';
        } else {
            const maxVol = Math.max(...entries.map(([,v]) => v), 1);
            const tokenColors = { CRTD: '#FF6D00', CRAC: '#E91E63', CRGC: '#00BFA5', CREB: '#2E7D32' };
            chartTokenEl.innerHTML = entries.map(([tk, vol]) => {
                const pct = Math.max((vol / maxVol) * 100, 2);
                const color = tokenColors[tk] || '#607D8B';
                return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
                    <span style="font-size:0.68rem; font-weight:700; color:${color};">${vol.toLocaleString()}</span>
                    <div style="width:100%; background:linear-gradient(180deg,${color}cc,${color}); border-radius:4px 4px 0 0; height:${pct}%; min-height:4px; transition:height 0.3s;"></div>
                    <span style="font-size:0.7rem; color:#666; font-weight:600;">${tk}</span>
                </div>`;
            }).join('');
        }
    }

    // 캐시 정보
    const cacheInfoEl = el('dashboard-cache-info');
    if (cacheInfoEl) {
        const cacheTime = _dashboardCacheTime ? new Date(_dashboardCacheTime).toLocaleTimeString('ko-KR') : '';
        cacheInfoEl.textContent = cacheTime ? `캐시: ${cacheTime}` : '';
    }
}

// ========== 상품 승인 관리 (admin-tab-products) ==========

async function loadAdminPendingProducts() {
    const c = document.getElementById('admin-pending-products');
    if (!c) return;
    c.innerHTML = '로딩...';
    try {
        const snap = await db.collection('products').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);">대기 중인 상품이 없습니다 ✅</p>'; return; }
        c.innerHTML = '';
        snap.forEach(d => {
            const p = d.data();
            const thumb = p.images?.[0] || p.imageData || '';
            const dateStr = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:var(--bg);padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #ff9800;">
                <div style="display:flex;gap:0.8rem;align-items:center;">
                    <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;background:#f0f0f0;flex-shrink:0;">
                        ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;">🛒</div>'}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;">${p.title}</div>
                        <div style="font-size:0.8rem;color:var(--accent);">${p.sellerNickname || p.sellerEmail} · ${p.price} CRGC · 재고 ${p.stock} · ${dateStr}</div>
                        ${p.description ? `<div style="font-size:0.8rem;color:#555;margin-top:0.2rem;">${p.description.slice(0,80)}${p.description.length>80?'...':''}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="approveProduct('${d.id}')" style="flex:1;background:#4CAF50;color:white;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;">✅ 승인</button>
                    <button onclick="rejectProduct('${d.id}')" style="flex:1;background:#f44336;color:white;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;">❌ 거부</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function approveProduct(productId) {
    try {
        await db.collection('products').doc(productId).update({ status: 'active', approvedAt: new Date(), approvedBy: currentUser.uid });
        // 판매자에게 알림
        const pDoc = await db.collection('products').doc(productId).get();
        const p = pDoc.data();
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `✅ "${p.title}" 상품이 승인되었습니다!`, link: `#page=product-detail&id=${productId}` });
        }
        showToast('✅ 상품 승인 완료', 'success');
        loadAdminPendingProducts();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function rejectProduct(productId) {
    const reason = await showPromptModal('거부 사유', '거부 사유를 입력하세요', '');
    if (!reason) return;
    try {
        await db.collection('products').doc(productId).update({ status: 'rejected', rejectedAt: new Date(), rejectedBy: currentUser.uid, rejectReason: reason });
        const pDoc = await db.collection('products').doc(productId).get();
        const p = pDoc.data();
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `❌ "${p.title}" 상품이 거부되었습니다. 사유: ${reason}`, link: '' });
        }
        showToast('상품 거부 완료', 'info');
        loadAdminPendingProducts();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== 신고 관리 ==========

async function loadAdminReports() {
    const c = document.getElementById('admin-reports-list');
    if (!c) return;
    c.innerHTML = '로딩...';
    try {
        const snap = await db.collection('reports').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);">대기 중인 신고가 없습니다 ✅</p>'; return; }
        c.innerHTML = '';
        const REPORT_REASONS = { fake: '허위상품', inappropriate: '부적절', scam: '사기의심', other: '기타' };
        snap.forEach(d => {
            const r = d.data();
            const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:#fff3e0;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #f44336;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>🚨 ${REPORT_REASONS[r.reason] || r.reason}</strong>
                        <span style="font-size:0.75rem;color:var(--accent);margin-left:0.5rem;">${dateStr}</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--accent);">${r.targetType}: ${r.targetId?.slice(0,8)}...</span>
                </div>
                <div style="font-size:0.8rem;color:#555;margin:0.3rem 0;">신고자: ${r.reporterEmail || r.reporterId?.slice(0,8)}</div>
                ${r.detail ? `<div style="font-size:0.8rem;color:#555;">상세: ${r.detail}</div>` : ''}
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="handleReport('${d.id}','confirmed')" style="flex:1;background:#f44336;color:white;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">🗑️ 삭제조치</button>
                    <button onclick="handleReport('${d.id}','dismissed')" style="flex:1;background:#999;color:white;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">무시</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function handleReport(reportId, action) {
    try {
        const rDoc = await db.collection('reports').doc(reportId).get();
        const r = rDoc.data();
        await db.collection('reports').doc(reportId).update({ status: action, handledBy: currentUser.uid, handledAt: new Date() });
        if (action === 'confirmed' && r.targetType === 'product' && r.targetId) {
            await db.collection('products').doc(r.targetId).update({ status: 'removed', removedAt: new Date(), removedReason: '신고 확인' });
        }
        showToast(action === 'confirmed' ? '🗑️ 신고 확인 및 삭제 조치' : '신고 무시 처리', action === 'confirmed' ? 'warning' : 'info');
        loadAdminReports();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

