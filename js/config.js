// ===== config.js - 전역변수, 토큰설정, 슬롯/리스크 =====
// Cache Buster - Version 5.3 - Admin Tabs + Dual Feed + SL/TP Inline
// Global State
let currentUser = null;
let userWallet = null;

// ========== POLYGON ERC-20 토큰 컨트랙트 ==========
const POLYGON_TOKENS = {
    crny: {
        name: 'CRNY (크라우니코인)',
        address: '0xe56173b6a57680286253566B9C80Fcc175c88bE1',
        decimals: 18,
        symbol: 'CRNY'
    },
    fnc: {
        name: 'FNC (포네크레딧)',
        address: '0x68E3aA1049F583C2f1701fefc4443e398ebF32ee',
        decimals: 18,
        symbol: 'FNC'
    },
    crfn: {
        name: 'CRFN (크라우니포네)',
        address: '0x396DAd0C7625a4881cA0cd444Cd80A9bbce4A054',
        decimals: 18,
        symbol: 'CRFN'
    }
};

// ERC-20 최소 ABI (조회 + 전송)
const ERC20_ABI = [
    { "constant": true, "inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "balance", "type": "uint256"}], "type": "function" },
    { "constant": false, "inputs": [{"name": "_to", "type": "address"},{"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{"name": "", "type": "string"}], "type": "function" }
];

// ========== CRNY SLOT SYSTEM ==========
const SLOT_TABLE = [
    { min: 1,  max: 4,  slots: 1 },
    { min: 5,  max: 6,  slots: 2 },
    { min: 7,  max: 9,  slots: 3 },
    { min: 10, max: 14, slots: 4 },
    { min: 15, max: 20, slots: 5 },
    { min: 21, max: 30, slots: 10 },
    { min: 31, max: 50, slots: 20 },
    { min: 51, max: 69, slots: 50 },
    { min: 70, max: Infinity, slots: 70 }
];

const RISK_CONFIG = {
    dailyLossLimit: -100,      // 일일 손실 한도 ($)
    cumulativeLossLimit: -3000, // 누적 손실 한도 ($) - HTML 규칙과 일치
    crnyBurnOnLiquidation: 1,  // 청산 시 소각 CRNY 개수
    tradeFeeRoundTrip: 2.00,   // 왕복 수수료 ($)
    mnqTickValue: 0.50,        // MNQ 1틱 가치 ($)
    mnqPointValue: 2,          // MNQ 1포인트 가치 ($)
    nqPointValue: 20           // NQ 1포인트 가치 ($)
};

// 슬롯 계산: CRNY 보유량 → 활성 슬롯 수
function calculateSlots(crnyBalance) {
    const balance = Math.floor(crnyBalance); // 정수 기준
    if (balance <= 0) return 0;
    
    for (const tier of SLOT_TABLE) {
        if (balance >= tier.min && balance <= tier.max) {
            return tier.slots;
        }
    }
    return 0;
}

// 슬롯 상태 UI 업데이트
function updateSlotStatusUI() {
    const crnyBalance = userWallet ? (userWallet.balances?.crny || 0) : 0;
    const slots = calculateSlots(crnyBalance);
    
    // 슬롯 패널 업데이트
    const crnyEl = document.getElementById('slot-crny-count');
    const slotsEl = document.getElementById('slot-active-count');
    const contractsEl = document.getElementById('slot-contract-count');
    const messageEl = document.getElementById('slot-status-message');
    const badgeEl = document.getElementById('slot-status-badge');
    const displayEl = document.getElementById('slot-contracts-display');
    
    if (crnyEl) crnyEl.textContent = Math.floor(crnyBalance);
    if (slotsEl) slotsEl.textContent = slots;
    if (contractsEl) contractsEl.textContent = slots;
    
    // hidden input 업데이트 (기존 호환)
    const tradeContracts = document.getElementById('trade-contracts');
    if (tradeContracts) tradeContracts.value = Math.max(slots, 1);
    
    // 슬롯 계약 수 표시
    if (displayEl) {
        displayEl.textContent = slots > 0 ? `${slots} 계약` : '0 계약';
        displayEl.style.color = slots > 0 ? '#0066cc' : '#cc0000';
    }
    
    // 상태 메시지/배지
    if (slots === 0) {
        if (messageEl) messageEl.textContent = '🔴 CRNY를 보유해야 거래할 수 있습니다';
        if (badgeEl) { badgeEl.textContent = '비활성'; badgeEl.style.background = '#ef5350'; }
    } else {
        if (messageEl) messageEl.textContent = `🟢 ${slots}슬롯 가동 중 / 보유 ${Math.floor(crnyBalance)} CRNY`;
        if (badgeEl) { badgeEl.textContent = '활성'; badgeEl.style.background = '#00c853'; }
    }
}

// ========== RISK MANAGEMENT ==========

// 일일 손실 리셋 체크 (자정 UTC 기준)
function checkDailyReset() {
    if (!myParticipation) return;
    
    const now = new Date();
    const todayUTC = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const lastReset = myParticipation.lastDailyReset || '';
    
    if (lastReset !== todayUTC) {
        // 새로운 날 → 일일 손실 리셋
        myParticipation.dailyPnL = 0;
        myParticipation.dailyLocked = false;
        myParticipation.lastDailyReset = todayUTC;
        
        // Firestore 업데이트
        if (myParticipation.challengeId && myParticipation.participantId) {
            db.collection('prop_challenges').doc(myParticipation.challengeId)
                .collection('participants').doc(myParticipation.participantId)
                .update({
                    dailyPnL: 0,
                    dailyLocked: false,
                    lastDailyReset: todayUTC
                }).catch(err => console.error('Daily reset error:', err));
        }
        
        console.log('🔄 일일 손실 리셋 (새로운 날)');
    }
}

// 리스크 게이지 UI 업데이트
function updateRiskGaugeUI() {
    if (!myParticipation) return;
    
    const dailyPnL = myParticipation.dailyPnL || 0;
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativePnL = current - initial;
    
    // 일일 손실 게이지 (참가자별 한도 사용)
    const actualDailyLimit = Math.abs(myParticipation.dailyLossLimit || RISK_CONFIG.dailyLossLimit);
    const actualCumulativeLimit = Math.abs(myParticipation.maxDrawdown || RISK_CONFIG.cumulativeLossLimit);
    
    const dailyPercent = Math.min(Math.abs(Math.min(dailyPnL, 0)) / actualDailyLimit * 100, 100);
    const dailyBar = document.getElementById('daily-loss-bar');
    const dailyText = document.getElementById('daily-loss-text');
    
    if (dailyBar) {
        dailyBar.style.width = dailyPercent + '%';
        dailyBar.style.background = dailyPercent >= 100 ? '#f44336' : dailyPercent >= 80 ? '#ff9800' : '#4caf50';
    }
    if (dailyText) {
        dailyText.textContent = `$${dailyPnL.toFixed(0)} / -$${actualDailyLimit}`;
        dailyText.style.color = dailyPnL < 0 ? '#f44336' : '#4caf50';
    }
    
    // 누적 손실 게이지 (참가자별 한도 사용)
    const cumulativePercent = Math.min(Math.abs(Math.min(cumulativePnL, 0)) / actualCumulativeLimit * 100, 100);
    const cumulativeBar = document.getElementById('cumulative-loss-bar');
    const cumulativeText = document.getElementById('cumulative-loss-text');
    
    if (cumulativeBar) {
        cumulativeBar.style.width = cumulativePercent + '%';
        cumulativeBar.style.background = cumulativePercent >= 100 ? '#f44336' : cumulativePercent >= 80 ? '#ff9800' : '#4caf50';
    }
    if (cumulativeText) {
        cumulativeText.textContent = `$${cumulativePnL.toFixed(0)} / -$${actualCumulativeLimit.toLocaleString()}`;
        cumulativeText.style.color = cumulativePnL < 0 ? '#f44336' : '#4caf50';
    }
    
    // 일일 한도 경고
    const warningEl = document.getElementById('daily-limit-warning');
    if (warningEl) {
        warningEl.style.display = (myParticipation.dailyLocked) ? 'block' : 'none';
    }
    
    // 버튼 활성/비활성
    updateTradeButtonState();
}

// 거래 버튼 상태 관리
function updateTradeButtonState() {
    const locked = myParticipation && myParticipation.dailyLocked;
    const noSlots = calculateSlots(userWallet?.balances?.crny || 0) === 0;
    const disabled = locked || noSlots;
    
    const btnBuy = document.getElementById('btn-buy');
    const btnSell = document.getElementById('btn-sell');
    const btnChartBuy = document.getElementById('btn-chart-buy');
    const btnChartSell = document.getElementById('btn-chart-sell');
    
    [btnBuy, btnSell, btnChartBuy, btnChartSell].forEach(btn => {
        if (!btn) return;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.4' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
    
    if (locked && btnBuy) {
        btnBuy.textContent = '⚠️ 거래 정지';
        btnSell.textContent = '⚠️ 거래 정지';
    } else if (btnBuy) {
        btnBuy.textContent = '📈 BUY';
        btnSell.textContent = '📉 SELL';
    }
    
    // CLOSE/FLATTEN 버튼은 포지션이 있을 때만 활성
    const hasPositions = myParticipation?.trades?.some(t => t.status === 'open');
    const btnClose = document.getElementById('btn-close-last');
    const btnFlatten = document.getElementById('btn-flatten');
    
    [btnClose, btnFlatten].forEach(btn => {
        if (!btn) return;
        btn.disabled = !hasPositions;
        btn.style.opacity = hasPositions ? '1' : '0.4';
        btn.style.cursor = hasPositions ? 'pointer' : 'not-allowed';
    });
}

// 일일 손실 체크 & 락 처리 (dailyPnL은 호출자가 이미 업데이트)
async function checkDailyLossLimit() {
    if (!myParticipation) return false;
    
    // Firestore에서 최신 한도/상태 동기화 (관리자 변경 반영)
    try {
        const freshDoc = await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId).get();
        if (freshDoc.exists) {
            const fresh = freshDoc.data();
            // 관리자가 변경 가능한 필드만 동기화
            if (fresh.dailyLossLimit !== undefined) {
                myParticipation.dailyLossLimit = Math.abs(fresh.dailyLossLimit);
                // 음수로 저장된 경우 자동 수정
                if (fresh.dailyLossLimit < 0) {
                    db.collection('prop_challenges').doc(myParticipation.challengeId)
                        .collection('participants').doc(myParticipation.participantId)
                        .update({ dailyLossLimit: Math.abs(fresh.dailyLossLimit) }).catch(() => {});
                    console.log(`⚠️ dailyLossLimit 음수 자동 수정: ${fresh.dailyLossLimit} → ${Math.abs(fresh.dailyLossLimit)}`);
                }
            }
            if (fresh.maxDrawdown !== undefined) {
                myParticipation.maxDrawdown = Math.abs(fresh.maxDrawdown);
                if (fresh.maxDrawdown < 0) {
                    db.collection('prop_challenges').doc(myParticipation.challengeId)
                        .collection('participants').doc(myParticipation.participantId)
                        .update({ maxDrawdown: Math.abs(fresh.maxDrawdown) }).catch(() => {});
                    console.log(`⚠️ maxDrawdown 음수 자동 수정: ${fresh.maxDrawdown} → ${Math.abs(fresh.maxDrawdown)}`);
                }
            }
            if (fresh.defaultSL !== undefined) myParticipation.defaultSL = fresh.defaultSL;
            if (fresh.defaultTP !== undefined) myParticipation.defaultTP = fresh.defaultTP;
            
            // 관리자가 잠금 해제 + PnL 초기화한 경우 동기화
            if (fresh.dailyLocked === false && myParticipation.dailyLocked === true) {
                myParticipation.dailyLocked = false;
                myParticipation.adminSuspended = false;
                // PnL도 서버 값으로 동기화 (관리자가 0으로 리셋했을 수 있음)
                if (fresh.dailyPnL !== undefined) {
                    myParticipation.dailyPnL = fresh.dailyPnL;
                }
                console.log('🔓 관리자 잠금 해제 감지 → 동기화 완료');
            }
            
            if (fresh.dailyLocked === true && !myParticipation.dailyLocked) {
                myParticipation.dailyLocked = true; // 관리자가 잠금
            }
            if (fresh.adminSuspended === true) {
                myParticipation.dailyLocked = true;
                myParticipation.adminSuspended = true;
            }
            // 관리자가 잠금 해제한 경우
            if (fresh.dailyLocked === false && fresh.adminSuspended === false) {
                myParticipation.dailyLocked = false;
                myParticipation.adminSuspended = false;
            }
        }
    } catch (e) { console.warn('동기화 실패:', e); }
    
    // 참가자별 일일 한도 사용 (없으면 전역 RISK_CONFIG 사용)
    // ⚠️ Math.abs 필수: 음수로 저장된 경우 이중부정 방지
    const limitValue = Math.abs(myParticipation.dailyLossLimit || RISK_CONFIG.dailyLossLimit);
    const dailyLimit = -limitValue;
    
    if (myParticipation.dailyPnL <= dailyLimit) {
        myParticipation.dailyLocked = true;
        
        // Firestore 업데이트
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                dailyPnL: myParticipation.dailyPnL,
                dailyLocked: true
            });
        
        updateRiskGaugeUI();
        alert(`🚨 일일 손실 한도 도달! (-$${limitValue})\n\n오늘의 거래가 종료됩니다.\n관리자가 해제하거나 내일 자정(UTC)에 자동 해제됩니다.`);
        return true; // locked
    }
    
    // Firestore에 dailyPnL만 업데이트
    await db.collection('prop_challenges').doc(myParticipation.challengeId)
        .collection('participants').doc(myParticipation.participantId)
        .update({ dailyPnL: myParticipation.dailyPnL });
    
    updateRiskGaugeUI();
    return false;
}

// 누적 청산 체크 & CRNY 소각
async function checkCumulativeLiquidation() {
    if (!myParticipation) return false;
    
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativeLoss = current - initial;
    
    if (cumulativeLoss <= -Math.abs(myParticipation.maxDrawdown || RISK_CONFIG.cumulativeLossLimit)) {
        // CRNY 소각 처리
        const wallet = allWallets.find(w => w.id === currentWalletId);
        if (!wallet) return false;
        
        const currentCrny = wallet.balances?.crny || 0;
        const burnAmount = RISK_CONFIG.crnyBurnOnLiquidation;
        
        if (currentCrny < burnAmount) {
            // CRNY가 없으면 거래 완전 차단
            alert('🚨 CRNY가 부족하여 더 이상 거래할 수 없습니다.\nCRNY를 추가로 획득해주세요.');
            return true;
        }
        
        // Firestore에서 CRNY 차감
        const newCrny = currentCrny - burnAmount;
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({ 'balances.crny': newCrny });
        
        wallet.balances.crny = newCrny;
        userWallet.balances.crny = newCrny;
        
        // 청산 기록 저장
        await db.collection('liquidation_log').add({
            userId: currentUser.uid,
            walletId: currentWalletId,
            challengeId: myParticipation.challengeId,
            participantId: myParticipation.participantId,
            crnyBurned: burnAmount,
            reason: 'cumulative_loss',
            lossAmount: cumulativeLoss,
            remainingCrny: newCrny,
            timestamp: new Date()
        });
        
        // 누적 손실 리셋 (계좌 다시 시작)
        myParticipation.currentBalance = initial;
        myParticipation.dailyPnL = 0;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                currentBalance: initial,
                dailyPnL: 0
            });
        
        updateSlotStatusUI();
        updateRiskGaugeUI();
        updateTradingUI();
        
        alert(
            `💀 누적 손실 -$${Math.abs(RISK_CONFIG.cumulativeLossLimit).toLocaleString()} 도달!\n\n` +
            `🔥 CRNY ${burnAmount}개 소각됨\n` +
            `👑 남은 CRNY: ${newCrny}개\n` +
            `📊 새 슬롯: ${calculateSlots(newCrny)}개\n\n` +
            `계좌가 초기화되었습니다.`
        );
        
        return true;
    }
    
    return false;
}

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-modal').style.display = 'none';
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-info').style.display = 'block';
        
        // 관리자 레벨 로드
        await loadUserLevel();
        
        // 관리자 메뉴 표시 (레벨 1 이상)
        if (currentUserLevel >= 1) {
            const adminNav = document.getElementById('admin-nav-item');
            if (adminNav) adminNav.style.display = 'block';
        }
        
        await loadUserWallet();
        await loadUserData();
    } else {
        document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('user-info').style.display = 'none';
        // 관리자 메뉴 숨기기
        const adminNav = document.getElementById('admin-nav-item');
        if (adminNav) adminNav.style.display = 'none';
    }
});

// Signup
