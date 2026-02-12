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
        alert('관리자만 사용 가능합니다');
        return;
    }
    
    const email = document.getElementById('admin-recipient')?.value;
    const token = document.getElementById('admin-token')?.value || 'CRNY';
    const amount = parseFloat(document.getElementById('admin-amount')?.value || 0);
    
    if (!email || amount <= 0) {
        alert('이메일과 수량을 입력하세요');
        return;
    }
    
    const users = await db.collection('users').where('email', '==', email).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
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
// ========== 다단계 관리자 시스템 ==========
// 레벨 6: 수퍼관리자 (모든 권한 + 관리자 임명)
// 레벨 5: 국가관리자 (해당 국가 사용자 전체 관리)
// 레벨 4: 사업관리자 (챌린지 생성/토큰 배분)
// 레벨 3: 서비스관리자 (한도 조정/거래 중단·해제)
// 레벨 2: 운영관리자 (컨텐츠/이미지/설정 수정)
// 레벨 1: CS관리자 (주문확인/메시지/읽기전용)
// 레벨 0: 정회원 (소개자 등록, 수익 배분)
// 레벨 -1: 일반회원

const SUPER_ADMIN_EMAIL = 'kim.president.sk@gmail.com';
const ADMIN_EMAIL = SUPER_ADMIN_EMAIL; // 하위 호환

const ADMIN_LEVELS = {
    6: { name: '수퍼관리자', icon: '👑', color: '#FFD700' },
    5: { name: '국가관리자', icon: '🌍', color: '#9C27B0' },
    4: { name: '사업관리자', icon: '💼', color: '#2196F3' },
    3: { name: '서비스관리자', icon: '🔧', color: '#FF9800' },
    2: { name: '운영관리자', icon: '📝', color: '#4CAF50' },
    1: { name: 'CS관리자', icon: '💬', color: '#607D8B' },
    0: { name: '정회원', icon: '⭐', color: '#795548' },
    '-1': { name: '일반회원', icon: '👤', color: '#9E9E9E' }
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

// 관리자 레벨 변경 (수퍼관리자만)
async function setUserAdminLevel(targetEmail, level) {
    if (!isSuperAdmin()) {
        alert('수퍼관리자만 권한을 변경할 수 있습니다');
        return;
    }
    
    if (level < -1 || level > 5) {
        alert('레벨 범위: -1 ~ 5');
        return;
    }
    
    try {
        const users = await db.collection('users').where('email', '==', targetEmail).get();
        if (users.empty) {
            alert('사용자를 찾을 수 없습니다: ' + targetEmail);
            return;
        }
        
        const targetDoc = users.docs[0];
        await targetDoc.ref.update({ adminLevel: level });
        
        const info = getLevelInfo(level);
        
        await db.collection('admin_log').add({
            action: 'set_admin_level',
            adminEmail: currentUser.email,
            targetEmail: targetEmail,
            newLevel: level,
            levelName: info.name,
            timestamp: new Date()
        });
        
        alert(`✅ ${targetEmail}\n${info.icon} ${info.name} (레벨 ${level}) 설정 완료`);
        loadAdminUserList();
    } catch (error) {
        alert('권한 변경 실패: ' + error.message);
    }
}

// ========== 소개자(레퍼럴) 시스템 ==========

// 소개 코드 생성 (정회원 이상)
async function generateReferralCode() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        if (userData.referralCode) {
            alert(`이미 소개 코드가 있습니다: ${userData.referralCode}`);
            return userData.referralCode;
        }
        
        // 6자리 코드 생성
        const code = (userData.nickname || currentUser.email.split('@')[0]).slice(0, 4).toUpperCase() 
            + Math.random().toString(36).slice(2, 4).toUpperCase();
        
        await db.collection('users').doc(currentUser.uid).update({
            referralCode: code,
            referralCount: 0,
            referralEarnings: { crny: 0, fnc: 0, crfn: 0 }
        });
        
        alert(`✅ 소개 코드 생성: ${code}\n\n이 코드를 공유하세요!`);
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
        
        // 소개자에게 보상 (CRNY 1개)
        const referrerWallets = await db.collection('users').doc(referrerId)
            .collection('wallets').limit(1).get();
        
        if (!referrerWallets.empty) {
            const walletDoc = referrerWallets.docs[0];
            const balances = walletDoc.data().balances || {};
            await walletDoc.ref.update({
                'balances.crny': (balances.crny || 0) + 1
            });
            
            await db.collection('transactions').add({
                from: 'system:referral',
                to: referrerId,
                toEmail: referrer.data().email,
                amount: 1,
                token: 'CRNY',
                type: 'referral_reward',
                referredUser: newUserId,
                timestamp: new Date()
            });
        }
        
        console.log(`✅ 소개 연결: ${referralCode} → 신규 사용자`);
    } catch (error) {
        console.error('소개 코드 적용 실패:', error);
    }
}

// 챌린지 참가 시 소개자 수익 배분
async function distributeReferralReward(userId, amount, token) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        
        const referredBy = userDoc.data().referredBy;
        if (!referredBy) return;
        
        // 10% 수익 배분
        const rewardAmount = Math.floor(amount * 0.1);
        if (rewardAmount <= 0) return;
        
        const referrerWallets = await db.collection('users').doc(referredBy)
            .collection('wallets').limit(1).get();
        
        if (!referrerWallets.empty) {
            const walletDoc = referrerWallets.docs[0];
            const balances = walletDoc.data().balances || {};
            const tokenKey = token.toLowerCase();
            await walletDoc.ref.update({
                [`balances.${tokenKey}`]: (balances[tokenKey] || 0) + rewardAmount
            });
            
            // 소개자 누적 수익
            const referrerDoc = await db.collection('users').doc(referredBy).get();
            const earnings = referrerDoc.data()?.referralEarnings || {};
            await db.collection('users').doc(referredBy).update({
                [`referralEarnings.${tokenKey}`]: (earnings[tokenKey] || 0) + rewardAmount
            });
            
            await db.collection('transactions').add({
                from: 'system:referral_commission',
                to: referredBy,
                amount: rewardAmount,
                token: token,
                type: 'referral_commission',
                sourceUser: userId,
                sourceAmount: amount,
                commission: '10%',
                timestamp: new Date()
            });
            
            console.log(`💰 소개 수수료: ${rewardAmount} ${token} → ${referredBy}`);
        }
    } catch (error) {
        console.error('소개 수수료 배분 실패:', error);
    }
}

// 관리자: 특정 사용자 전체 포지션 강제 청산
async function adminForceCloseAll(targetUserId, targetParticipantId, challengeId) {
    if (!isAdmin()) {
        alert('관리자만 사용 가능합니다');
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
        alert('관리자만 사용 가능합니다');
        return;
    }
    
    const suspendReason = reason || prompt('중단 사유를 입력하세요:');
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
        
        alert(`✅ 거래 중단 처리 완료\n사유: ${suspendReason}`);
    } catch (error) {
        alert('중단 처리 실패: ' + error.message);
    }
}

// 관리자: 거래 중단 해제
async function adminResumeTrading(targetParticipantId, challengeId) {
    if (!isAdmin()) {
        alert('관리자만 사용 가능합니다');
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
        
        alert('✅ 거래 중단 해제 완료');
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
    { id: 'offchain',  icon: '🔥', label: '오프체인',  minLevel: 2 },
    { id: 'wallet',    icon: '💰', label: '온체인',    minLevel: 4 },
    { id: 'challenge', icon: '📊', label: '챌린지',    minLevel: 3 },
    { id: 'users',     icon: '👥', label: '회원',      minLevel: 6 },
    { id: 'giving',    icon: '🎁', label: '기부풀',    minLevel: 3 },
    { id: 'log',       icon: '📋', label: '로그',      minLevel: 3 }
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
    if (tabId === 'wallet') loadAdminWallet();
    if (tabId === 'users') loadAdminUserList();
    if (tabId === 'challenge') loadAdminParticipants();
    if (tabId === 'giving') adminLoadGivingPool();
}

// ═══════════════════════════════════════════════════════
// 오프체인 관리 함수들 (admin-tab-offchain)
// ═══════════════════════════════════════════════════════

// 유저 오프체인 잔액 조회
async function adminLookupOffchain() {
    const email = document.getElementById('admin-off-lookup-email').value.trim();
    const resultEl = document.getElementById('admin-off-lookup-result');
    if (!email) { resultEl.innerHTML = '<span style="color:red;">이메일 입력</span>'; return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { resultEl.innerHTML = '<span style="color:red;">사용자 없음</span>'; return; }
        
        const data = users.docs[0].data();
        const off = data.offchainBalances || { crtd: 0, crac: 0, crgc: 0, creb: 0 };
        const nick = data.nickname || data.displayName || '이름없음';
        const total = (off.crtd||0) + (off.crac||0) + (off.crgc||0) + (off.creb||0);
        
        resultEl.innerHTML = `
            <div style="background:white; padding:0.8rem; border-radius:6px; border:1px solid var(--border);">
                <strong>${nick}</strong> <span style="color:var(--accent); font-size:0.8rem;">(${email})</span>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem; margin-top:0.5rem; font-size:0.85rem;">
                    <div>📈 CRTD: <strong style="color:#FF6D00;">${(off.crtd||0).toLocaleString()}</strong></div>
                    <div>🎭 CRAC: <strong style="color:#E91E63;">${(off.crac||0).toLocaleString()}</strong></div>
                    <div>🛒 CRGC: <strong style="color:#00BFA5;">${(off.crgc||0).toLocaleString()}</strong></div>
                    <div>🌱 CREB: <strong style="color:#2E7D32;">${(off.creb||0).toLocaleString()}</strong></div>
                </div>
                <div style="margin-top:0.4rem; font-size:0.8rem; color:var(--accent);">합계: ${total.toLocaleString()} pt (≈ ${(total/100).toFixed(2)} CRNY)</div>
            </div>`;
    } catch (e) {
        resultEl.innerHTML = `<span style="color:red;">조회 실패: ${e.message}</span>`;
    }
}

// 포인트 발행 (민팅) — 레벨 2+
async function adminMintOffchain() {
    if (!hasLevel(2)) { alert('권한 부족 (레벨 2 이상)'); return; }
    
    const email = document.getElementById('admin-off-mint-email').value.trim();
    const tokenKey = document.getElementById('admin-off-mint-token').value;
    const amount = parseInt(document.getElementById('admin-off-mint-amount').value);
    const reason = document.getElementById('admin-off-mint-reason').value.trim() || '관리자 발행';
    
    if (!email || !amount || amount <= 0) { alert('이메일과 수량 입력'); return; }
    
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

// 포인트 차감 (소각) — 레벨 2+
async function adminBurnOffchain() {
    if (!hasLevel(2)) { alert('권한 부족 (레벨 2 이상)'); return; }
    
    const email = document.getElementById('admin-off-burn-email').value.trim();
    const tokenKey = document.getElementById('admin-off-burn-token').value;
    const amount = parseInt(document.getElementById('admin-off-burn-amount').value);
    const reason = document.getElementById('admin-off-burn-reason').value.trim() || '관리자 차감';
    
    if (!email || !amount || amount <= 0) { alert('이메일과 수량 입력'); return; }
    
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
    if (!email || !amount || amount <= 0) { alert('이메일과 수량 입력'); return; }
    
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
    if (!hasLevel(6)) return;
    
    const container = document.getElementById('admin-user-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        const users = await db.collection('users').orderBy('createdAt', 'desc').limit(50).get();
        
        if (users.empty) {
            container.innerHTML = '<p>회원이 없습니다</p>';
            return;
        }
        
        let html = '';
        users.forEach(doc => {
            const u = doc.data();
            const level = u.adminLevel ?? -1;
            const info = getLevelInfo(level);
            const referral = u.referralCode ? `📎 ${u.referralCode}` : '';
            const referredBy = u.referredByCode ? `← ${u.referredByCode}` : '';
            
            html += `
                <div style="padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem; border-left:4px solid ${info.color};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                        <div>
                            <strong>${u.nickname || '이름없음'}</strong>
                            <span style="font-size:0.75rem; color:var(--accent); margin-left:0.3rem;">${u.email}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.75rem; padding:2px 6px; background:${info.color}22; color:${info.color}; border-radius:3px;">
                                ${info.icon} ${info.name}
                            </span>
                            <span style="font-size:0.7rem; color:var(--accent);">${referral} ${referredBy}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
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
        const currentLimit = data.dailyLossLimit || 100;
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

// Admin 지갑 - 온체인 잔액 로드
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
        alert('이메일과 수량을 입력하세요');
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
                                        일일한도: <span style="font-weight:700;">$${p.dailyLossLimit || 100}</span> · 
                                        청산한도: <span style="font-weight:700;">$${(p.maxDrawdown || 3000).toLocaleString()}</span>
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
                    <span>📊 ${ch.allowedProduct || 'MNQ'} | 🔴 일일 -$${ch.dailyLossLimit || 100}</span>
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
                    
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                            <thead>
                                <tr style="background:var(--bg);">
                                    <th style="padding:0.4rem; text-align:left;">티어</th>
                                    <th style="padding:0.4rem;">참가비<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">가상계좌<br>($)</th>
                                    <th style="padding:0.4rem;">청산선<br>(-$)</th>
                                    <th style="padding:0.4rem;">수익기준<br>(+$)</th>
                                    <th style="padding:0.4rem;">인출단위<br>(CRTD)</th>
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
                                </tr>
                                <tr style="background:var(--bg);">
                                    <td style="padding:0.4rem; font-weight:700;">🅱️ B군</td>
                                    <td><input type="number" id="tier-b-deposit" value="200" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-account" value="150000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-liq" value="5000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-profit" value="1500" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅲 C군</td>
                                    <td><input type="number" id="tier-c-deposit" value="500" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-account" value="300000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-liq" value="10000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-profit" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
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
        withdrawUnit: parseFloat(document.getElementById(`tier-${prefix}-unit`).value) || 1000
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
    
    // CRTD 잔고 확인
    const walletDoc = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').doc(currentWalletId || 'default').get();
    const offchain = walletDoc.data()?.offchain || {};
    const crtdBalance = offchain.crtd || 0;
    
    if (crtdBalance < tier.deposit) {
        alert(`CRTD 잔액 부족\n\n필요: ${tier.deposit} CRTD\n보유: ${crtdBalance} CRTD\n\nCRTD는 관리자로부터 받을 수 있습니다.`);
        return;
    }
    
    const productText = data.allowedProduct === 'BOTH' ? 'MNQ + NQ' : (data.allowedProduct || 'MNQ');
    
    const ok = window.confirm(
        `🎯 CRTD 프랍 트레이딩\n\n` +
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
        `참가하시겠습니까?`
    );
    
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
                tradingTier: data.tradingTier || null,
                maxContracts: data.maxContracts || 1,
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
        
        // 소개자 수수료 (10%)
        await distributeReferralReward(currentUser.uid, tier.deposit * 0.1, 'CRTD');
        
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
    if (!currentUser) { alert('로그인 필요'); return; }
    const title = document.getElementById('product-title').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const imageFile = document.getElementById('product-image').files[0];
    if (!title || !price) { alert('상품명과 가격을 입력하세요'); return; }
    if (!imageFile) { alert('상품 이미지를 선택하세요'); return; }
    
    try {
        const imageData = await fileToBase64Resized(imageFile, 600);
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        await db.collection('products').add({
            title, description: document.getElementById('product-desc').value.trim(),
            category: document.getElementById('product-category').value,
            price, priceToken: document.getElementById('product-token').value,
            stock: parseInt(document.getElementById('product-stock').value) || 1,
            imageData, sellerId: currentUser.uid, sellerEmail: currentUser.email,
            sellerNickname: userDoc.data()?.nickname || '',
            sold: 0, status: 'active', createdAt: new Date()
        });
        
        alert(`🛒 "${title}" 등록 완료!`);
        document.getElementById('product-title').value = '';
        document.getElementById('product-desc').value = '';
        document.getElementById('product-image').value = '';
        loadMallProducts();
    } catch (e) { alert('등록 실패: ' + e.message); }
}

