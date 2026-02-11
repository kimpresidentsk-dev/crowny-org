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
async function signup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력하세요');
        return;
    }
    
    const nickname = prompt('닉네임을 입력하세요 (SNS에 표시됨):');
    if (!nickname) {
        alert('닉네임은 필수입니다');
        return;
    }
    
    const referralCode = prompt('소개 코드가 있으면 입력하세요 (없으면 빈칸):') || '';
    
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // Create wallet
        const wallet = web3.eth.accounts.create();
        
        // Save to Firestore (legacy)
        await db.collection('users').doc(result.user.uid).set({
            email: email,
            nickname: nickname,
            walletAddress: wallet.address,
            privateKey: wallet.privateKey,
            adminLevel: -1,  // 일반회원
            balances: {
                crny: 0,
                fnc: 0,
                crfn: 0
            },
            createdAt: new Date()
        });
        
        // Create first wallet in subcollection
        await db.collection('users').doc(result.user.uid)
            .collection('wallets').add({
                name: '크라우니 지갑 1',
                walletAddress: wallet.address,
                privateKey: wallet.privateKey,
                isImported: false,
                totalGasSubsidy: 0,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
        
        alert(`✅ 가입 완료!\n닉네임: ${nickname}\n지갑 생성 완료!`);
        
        // 소개 코드 적용
        if (referralCode.trim()) {
            await applyReferralCode(result.user.uid, referralCode.trim());
        }
    } catch (error) {
        console.error(error);
        alert('가입 실패: ' + error.message);
    }
}

// Login
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert('로그인 실패: ' + error.message);
    }
}

// Logout
function logout() {
    auth.signOut();
    location.reload();
}

// ========== MULTI-WALLET SYSTEM ==========
let currentWalletId = null;
let allWallets = [];

// Load User Wallet
async function loadUserWallet() {
    if (!currentUser) return;
    
    // Load all wallets
    const walletsSnapshot = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').get();
    
    allWallets = [];
    walletsSnapshot.forEach(doc => {
        allWallets.push({ id: doc.id, ...doc.data() });
    });
    
    // If no wallets, create first one
    if (allWallets.length === 0) {
        await createFirstWallet();
        return;
    }
    
    // Load wallet selector
    const selector = document.getElementById('wallet-selector');
    selector.innerHTML = '';
    
    allWallets.forEach((wallet, index) => {
        const option = document.createElement('option');
        option.value = wallet.id;
        const type = wallet.isImported ? '📥' : '🏠';
        const name = wallet.name || `지갑 ${index + 1}`;
        const addr = wallet.walletAddress.slice(0, 6) + '...' + wallet.walletAddress.slice(-4);
        option.textContent = `${type} ${name} (${addr})`;
        selector.appendChild(option);
    });
    
    // Load first wallet or previously selected
    currentWalletId = allWallets[0].id;
    displayCurrentWallet();
}

async function createFirstWallet() {
    const web3 = new Web3();
    const newAccount = web3.eth.accounts.create();
    
    const walletRef = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').add({
            name: '크라우니 지갑 1',
            walletAddress: newAccount.address,
            privateKey: newAccount.privateKey,
            isImported: false,
            totalGasSubsidy: 0,
            createdAt: new Date()
        });
    
    currentWalletId = walletRef.id;
    await loadUserWallet();
}

async function switchWallet() {
    const selector = document.getElementById('wallet-selector');
    currentWalletId = selector.value;
    await displayCurrentWallet();
}

async function displayCurrentWallet() {
    const wallet = allWallets.find(w => w.id === currentWalletId);
    if (!wallet) return;
    
    userWallet = wallet;
    
    const addr = wallet.walletAddress;
    document.getElementById('wallet-address').textContent = 
        addr.slice(0, 6) + '...' + addr.slice(-4);
    document.getElementById('wallet-address-full').textContent = addr;
    
    // Massivescan link
    document.getElementById('polygonscan-link').href = 
        `https://polygonscan.com/address/${addr}`;
    
    // Wallet type
    const walletType = wallet.isImported ? '📥 외부 지갑' : '🏠 크라우니 지갑';
    document.getElementById('wallet-type').textContent = walletType;
    
    // Gas subsidy info (only for Crowny wallets)
    if (!wallet.isImported) {
        document.getElementById('gas-subsidy-info').style.display = 'block';
        const totalGas = wallet.totalGasSubsidy || 0;
        document.getElementById('total-gas-subsidy').textContent = totalGas.toFixed(4);
    } else {
        document.getElementById('gas-subsidy-info').style.display = 'none';
    }
    
    // Load balances
    if (!wallet.balances) {
        userWallet.balances = { crny: 0, fnc: 0, crfn: 0 };
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({ balances: { crny: 0, fnc: 0, crfn: 0 } });
    }
    
    // Init off-chain points
    if (!wallet.offchainBalances) {
        userWallet.offchainBalances = { crtd: 0, crac: 0, crgc: 0, creb: 0 };
    } else {
        userWallet.offchainBalances = wallet.offchainBalances;
    }
    
    await loadRealBalances();
    await loadOffchainBalances();
    updateBalances();
}

function showAddWalletModal() {
    const choice = prompt('지갑 추가:\n1. 새 크라우니 지갑 생성\n2. 외부 지갑 가져오기\n\n번호를 입력하세요:');
    
    if (choice === '1') {
        createNewWallet();
    } else if (choice === '2') {
        showImportWallet();
    }
}

function showImportWallet() {
    const name = prompt('지갑 이름:') || '외부 지갑';
    const privateKey = prompt('개인키를 입력하세요:\n(0x로 시작하는 64자리)');
    if (!privateKey) return;
    
    try {
        const web3 = new Web3();
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        
        const confirm = window.confirm(
            `이 지갑을 추가하시겠습니까?\n\n` +
            `이름: ${name}\n` +
            `주소: ${account.address}\n\n` +
            `⚠️ 외부 지갑은 가스비가 자동 차감됩니다.`
        );
        
        if (confirm) {
            importExternalWallet(name, privateKey, account.address);
        }
    } catch (error) {
        alert('잘못된 개인키입니다');
    }
}

async function importExternalWallet(name, privateKey, address) {
    try {
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add({
                name: name,
                walletAddress: address,
                privateKey: privateKey,
                isImported: true,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                importedAt: new Date()
            });
        
        alert('✅ 외부 지갑 추가 완료!');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Import error:', error);
        alert('지갑 추가 실패: ' + error.message);
    }
}

async function createNewWallet() {
    try {
        const name = prompt('지갑 이름:') || `크라우니 지갑 ${allWallets.length + 1}`;
        
        const web3 = new Web3();
        const newAccount = web3.eth.accounts.create();
        
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add({
                name: name,
                walletAddress: newAccount.address,
                privateKey: newAccount.privateKey,
                isImported: false,
                totalGasSubsidy: 0,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
        
        alert('✅ 새 지갑 생성 완료!');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Create wallet error:', error);
        alert('지갑 생성 실패: ' + error.message);
    }
}

async function deleteCurrentWallet() {
    if (allWallets.length === 1) {
        alert('마지막 지갑은 삭제할 수 없습니다.');
        return;
    }
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    const confirm = window.confirm(
        `지갑을 삭제하시겠습니까?\n\n` +
        `${wallet.name}\n` +
        `${wallet.walletAddress}\n\n` +
        `⚠️ 이 작업은 되돌릴 수 없습니다!`
    );
    
    if (!confirm) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).delete();
        
        alert('✅ 지갑 삭제 완료!');
        await loadUserWallet();
    } catch (error) {
        console.error('Delete error:', error);
        alert('지갑 삭제 실패: ' + error.message);
    }
}

// Load Real Balances from Massive
async function loadRealBalances() {
    if (!userWallet) return;
    
    try {
        const address = userWallet.walletAddress;
        
        console.log('Loading balances for:', address);
        
        // 공통 함수로 온체인 잔액 조회
        const balances = await getAllOnchainBalances(address);
        userWallet.balances.crny = balances.crny;
        userWallet.balances.fnc = balances.fnc;
        userWallet.balances.crfn = balances.crfn;
        
        console.log('CRNY:', balances.crny, 'FNC:', balances.fnc, 'CRFN:', balances.crfn);
        
        // Update Firestore wallet subcollection
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({
                'balances.crny': userWallet.balances.crny,
                'balances.fnc': userWallet.balances.fnc,
                'balances.crfn': userWallet.balances.crfn
            });
        
        console.log('✅ Real balances loaded:', userWallet.balances);
    } catch (error) {
        console.error('❌ Balance load error:', error);
        alert('잔액 조회 실패: ' + error.message);
    }
}

// Copy Address
function copyAddress() {
    if (!userWallet) return;
    
    const address = userWallet.walletAddress;
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(() => {
            alert('✅ 주소가 복사되었습니다!');
        }).catch(err => {
            // Fallback
            fallbackCopy(address);
        });
    } else {
        // Fallback
        fallbackCopy(address);
    }
}

function fallbackCopy(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-999999px';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        alert('✅ 주소가 복사되었습니다!');
    } catch (err) {
        alert('복사 실패. 수동으로 복사해주세요:\n' + text);
    }
    
    document.body.removeChild(temp);
}

// Update Balances (7-token: 3 on-chain + 4 off-chain)
function updateBalances() {
    if (!userWallet) return;
    
    // On-chain balances
    document.getElementById('crny-balance').textContent = userWallet.balances.crny.toFixed(2);
    document.getElementById('fnc-balance').textContent = userWallet.balances.fnc.toFixed(2);
    document.getElementById('crfn-balance').textContent = userWallet.balances.crfn.toFixed(2);
    
    // Off-chain balances
    const offchain = userWallet.offchainBalances || { crtd: 0, crac: 0, crgc: 0, creb: 0 };
    const crtdEl = document.getElementById('crtd-balance');
    const cracEl = document.getElementById('crac-balance');
    const crgcEl = document.getElementById('crgc-balance');
    const crebEl = document.getElementById('creb-balance');
    if (crtdEl) crtdEl.textContent = (offchain.crtd || 0).toLocaleString();
    if (cracEl) cracEl.textContent = (offchain.crac || 0).toLocaleString();
    if (crgcEl) crgcEl.textContent = (offchain.crgc || 0).toLocaleString();
    if (crebEl) crebEl.textContent = (offchain.creb || 0).toLocaleString();
    
    // Total asset in CRNY equivalent
    const rate = window.OFFCHAIN_RATE || 100;
    const totalOffchain = (offchain.crtd || 0) + (offchain.crac || 0) + (offchain.crgc || 0) + (offchain.creb || 0);
    const totalCrny = userWallet.balances.crny + userWallet.balances.fnc + userWallet.balances.crfn + (totalOffchain / rate);
    const totalEl = document.getElementById('total-asset-crny');
    if (totalEl) totalEl.textContent = totalCrny.toFixed(2);
    
    // Total offchain points
    const offPtsEl = document.getElementById('total-offchain-pts');
    if (offPtsEl) offPtsEl.textContent = `${totalOffchain.toLocaleString()} pt`;
}

// ========== OFF-CHAIN (4대 유틸리티 포인트) ==========
const OFFCHAIN_TOKENS_LIST = ['crtd', 'crac', 'crgc', 'creb'];
const OFFCHAIN_TOKEN_NAMES = {
    crtd: 'CRTD (트레이딩 달러)',
    crac: 'CRAC (아트 크레딧)',
    crgc: 'CRGC (굿즈 & 기빙)',
    creb: 'CREB (에코 바이오)'
};

function isOffchainToken(tokenKey) {
    return OFFCHAIN_TOKENS_LIST.includes((tokenKey || '').toLowerCase());
}

// Firestore에서 오프체인 잔액 로드
async function loadOffchainBalances() {
    if (!userWallet || !currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();
        const offchain = data.offchainBalances || { crtd: 0, crac: 0, crgc: 0, creb: 0 };
        userWallet.offchainBalances = {
            crtd: offchain.crtd || 0, crac: offchain.crac || 0,
            crgc: offchain.crgc || 0, creb: offchain.creb || 0
        };
        console.log('✅ Off-chain balances:', userWallet.offchainBalances);
    } catch (error) {
        console.error('❌ Off-chain balance error:', error);
        userWallet.offchainBalances = { crtd: 0, crac: 0, crgc: 0, creb: 0 };
    }
}

// 오프체인 전송 모달
function showOffchainSendModal() {
    if (!userWallet) { alert('지갑을 먼저 연결하세요'); return; }
    const offchain = userWallet.offchainBalances || {};

    // 이미 선택된 오프체인 토큰이면 바로 사용
    let tokenKey = (selectedToken && isOffchainToken(selectedToken)) ? selectedToken : null;

    if (!tokenKey) {
        const info = OFFCHAIN_TOKENS_LIST.map((t, i) =>
            `${i+1}. ${OFFCHAIN_TOKEN_NAMES[t]} — ${(offchain[t]||0).toLocaleString()} pt`
        ).join('\n');
        const choice = prompt(`⚡ 오프체인 포인트 전송\n\n${info}\n\n번호:`);
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (idx < 0 || idx >= OFFCHAIN_TOKENS_LIST.length) { alert('잘못된 선택'); return; }
        tokenKey = OFFCHAIN_TOKENS_LIST[idx];
    }

    const tokenName = tokenKey.toUpperCase();
    const balance = offchain[tokenKey] || 0;
    const email = prompt(`받는 사람 이메일:`);
    if (!email) return;
    const amount = prompt(`${email}에게 전송할 ${tokenName} 수량:\n잔액: ${balance.toLocaleString()} pt`);
    if (!amount) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        alert(`잘못된 수량\n잔액: ${balance.toLocaleString()} ${tokenName}`); return;
    }
    sendOffchainPoints(email, amountNum, tokenKey);
}

// Zero-Gas 즉시 전송
async function sendOffchainPoints(recipientEmail, amount, tokenKey) {
    if (!currentUser || !userWallet) return;
    const tokenName = tokenKey.toUpperCase();
    try {
        const users = await db.collection('users').where('email', '==', recipientEmail).get();
        if (users.empty) { alert('❌ 사용자를 찾을 수 없습니다'); return; }
        const recipientDoc = users.docs[0];
        const recipientData = recipientDoc.data();
        const recipientOff = recipientData.offchainBalances || {};

        const senderBal = userWallet.offchainBalances[tokenKey] || 0;
        if (amount > senderBal) { alert(`❌ 잔액 부족 (${senderBal} ${tokenName})`); return; }

        // 발신자 차감
        await db.collection('users').doc(currentUser.uid).update({
            [`offchainBalances.${tokenKey}`]: senderBal - amount
        });
        userWallet.offchainBalances[tokenKey] = senderBal - amount;

        // 수신자 적립
        await db.collection('users').doc(recipientDoc.id).update({
            [`offchainBalances.${tokenKey}`]: (recipientOff[tokenKey] || 0) + amount
        });

        // 트랜잭션 로그
        await db.collection('offchain_transactions').add({
            from: currentUser.uid, fromEmail: currentUser.email,
            to: recipientDoc.id, toEmail: recipientEmail,
            token: tokenKey, amount, type: 'transfer',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), status: 'completed'
        });

        updateBalances();
        alert(`✅ ${amount.toLocaleString()} ${tokenName} 전송 완료!\n→ ${recipientEmail}\n⚡ 가스비 0원 (오프체인)`);
    } catch (error) {
        console.error('❌ Off-chain transfer error:', error);
        alert('전송 실패: ' + error.message);
    }
}

// 브릿지 프리뷰
function updateBridgePreview() {
    const fromSelect = document.getElementById('bridge-from');
    const amountInput = document.getElementById('bridge-amount');
    const previewEl = document.getElementById('bridge-preview');
    const toSelect = document.getElementById('bridge-to');
    if (!fromSelect || !amountInput || !previewEl) return;

    const from = fromSelect.value;
    const amount = parseFloat(amountInput.value) || 0;
    const rate = window.OFFCHAIN_RATE || 100;

    if (toSelect) {
        toSelect.innerHTML = from === 'crny'
            ? '<option value="crtd">CRTD</option><option value="crac">CRAC</option><option value="crgc">CRGC</option><option value="creb">CREB</option>'
            : '<option value="crny">CRNY</option>';
    }
    if (amount <= 0) { previewEl.textContent = ''; return; }

    if (from === 'crny') {
        previewEl.textContent = `${amount} CRNY → ${(amount * rate).toLocaleString()} ${(toSelect?.value || 'CRTD').toUpperCase()} 포인트`;
    } else {
        const result = amount / rate;
        previewEl.textContent = `${amount.toLocaleString()} ${from.toUpperCase()} → ${result.toFixed(2)} CRNY` + (amount < rate ? ` (최소 ${rate} pt)` : '');
    }
}

// 브릿지 실행 (온체인 ↔ 오프체인)
async function executeBridge() {
    if (!userWallet || !currentUser) { alert('지갑을 먼저 연결하세요'); return; }
    const from = document.getElementById('bridge-from').value;
    const to = document.getElementById('bridge-to')?.value || (from === 'crny' ? 'crtd' : 'crny');
    const amount = parseFloat(document.getElementById('bridge-amount').value) || 0;
    const rate = window.OFFCHAIN_RATE || 100;
    if (amount <= 0) { alert('수량을 입력하세요'); return; }

    try {
        if (from === 'crny') {
            if (amount > (userWallet.balances.crny || 0)) { alert('CRNY 잔액 부족'); return; }
            const pts = amount * rate;
            if (!confirm(`🔄 ${amount} CRNY → ${pts.toLocaleString()} ${to.toUpperCase()}\n실행?`)) return;

            const newCrny = userWallet.balances.crny - amount;
            await db.collection('users').doc(currentUser.uid)
                .collection('wallets').doc(currentWalletId)
                .update({ 'balances.crny': newCrny });
            userWallet.balances.crny = newCrny;

            const curPts = userWallet.offchainBalances[to] || 0;
            await db.collection('users').doc(currentUser.uid)
                .update({ [`offchainBalances.${to}`]: curPts + pts });
            userWallet.offchainBalances[to] = curPts + pts;

            await db.collection('bridge_transactions').add({
                userId: currentUser.uid, email: currentUser.email,
                direction: 'onchain_to_offchain', fromToken: 'crny', fromAmount: amount,
                toToken: to, toAmount: pts, rate,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`✅ ${amount} CRNY → ${pts.toLocaleString()} ${to.toUpperCase()}`);
        } else {
            const bal = userWallet.offchainBalances[from] || 0;
            if (amount > bal) { alert(`${from.toUpperCase()} 잔액 부족 (${bal})`); return; }
            if (amount < rate) { alert(`최소 ${rate} pt 필요`); return; }
            const crnyOut = Math.floor(amount / rate);
            const ptsUsed = crnyOut * rate;
            if (!confirm(`🔄 ${ptsUsed.toLocaleString()} ${from.toUpperCase()} → ${crnyOut} CRNY\n실행?`)) return;

            await db.collection('users').doc(currentUser.uid)
                .update({ [`offchainBalances.${from}`]: bal - ptsUsed });
            userWallet.offchainBalances[from] = bal - ptsUsed;

            const newCrny = (userWallet.balances.crny || 0) + crnyOut;
            await db.collection('users').doc(currentUser.uid)
                .collection('wallets').doc(currentWalletId)
                .update({ 'balances.crny': newCrny });
            userWallet.balances.crny = newCrny;

            await db.collection('bridge_transactions').add({
                userId: currentUser.uid, email: currentUser.email,
                direction: 'offchain_to_onchain', fromToken: from, fromAmount: ptsUsed,
                toToken: 'crny', toAmount: crnyOut, rate,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`✅ ${ptsUsed.toLocaleString()} ${from.toUpperCase()} → ${crnyOut} CRNY`);
        }
        updateBalances();
        document.getElementById('bridge-amount').value = '';
        document.getElementById('bridge-preview').textContent = '';
    } catch (error) {
        console.error('❌ Bridge error:', error);
        alert('브릿지 실패: ' + error.message);
    }
}

// 서비스별 포인트 적립 API
async function earnOffchainPoints(tokenKey, amount, reason) {
    if (!currentUser || !userWallet) return false;
    try {
        const cur = userWallet.offchainBalances[tokenKey] || 0;
        await db.collection('users').doc(currentUser.uid)
            .update({ [`offchainBalances.${tokenKey}`]: cur + amount });
        userWallet.offchainBalances[tokenKey] = cur + amount;

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, email: currentUser.email,
            token: tokenKey, amount, type: 'earn', reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
        console.log(`✅ +${amount} ${tokenKey.toUpperCase()}: ${reason}`);
        return true;
    } catch (e) { console.error('Earn error:', e); return false; }
}

// 서비스별 포인트 차감 API
async function spendOffchainPoints(tokenKey, amount, reason) {
    if (!currentUser || !userWallet) return false;
    const bal = userWallet.offchainBalances[tokenKey] || 0;
    if (amount > bal) { alert(`${tokenKey.toUpperCase()} 잔액 부족 (${bal} pt)`); return false; }
    try {
        await db.collection('users').doc(currentUser.uid)
            .update({ [`offchainBalances.${tokenKey}`]: bal - amount });
        userWallet.offchainBalances[tokenKey] = bal - amount;

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, email: currentUser.email,
            token: tokenKey, amount: -amount, type: 'spend', reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
        return true;
    } catch (e) { console.error('Spend error:', e); return false; }
}

// CRGC 결제 시 기부풀 자동 적립
async function autoGivingPoolContribution(paymentAmount) {
    if (!currentUser) return;
    const givingAmount = Math.ceil(paymentAmount * 0.05);
    try {
        const poolRef = db.collection('giving_pool').doc('global');
        const poolDoc = await poolRef.get();
        if (poolDoc.exists) {
            await poolRef.update({
                totalAmount: firebase.firestore.FieldValue.increment(givingAmount),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await poolRef.set({ totalAmount: givingAmount,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        await db.collection('giving_pool_logs').add({
            userId: currentUser.uid, email: currentUser.email,
            paymentAmount, givingAmount, rate: 0.05,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`🎁 Giving pool: +${givingAmount} CRGC`);
    } catch (e) { console.error('Giving pool error:', e); }
}

// 환전 (온·오프 통합)
async function swapTokens() {
    if (!currentUser || !userWallet) return;
    const from = document.getElementById('swap-from').value;
    const to = document.getElementById('swap-to').value;
    const amount = parseFloat(document.getElementById('swap-amount').value);
    if (!amount || amount <= 0) { alert('수량을 입력하세요'); return; }
    if (from === to) { alert('같은 토큰은 환전할 수 없습니다'); return; }

    const fromIsOff = isOffchainToken(from);
    const toIsOff = isOffchainToken(to);

    // 온↔오프는 브릿지로 안내
    if (fromIsOff !== toIsOff) {
        alert('온체인 ↔ 오프체인 교환은 "브릿지" 기능을 이용해주세요!');
        return;
    }

    try {
        const walletRef = db.collection('users').doc(currentUser.uid).collection('wallets').doc(currentWalletId);

        if (fromIsOff) {
            // 오프체인 ↔ 오프체인 (1:1)
            const offBal = userWallet.offchainBalances || {};
            if ((offBal[from] || 0) < amount) { alert(`${from.toUpperCase()} 잔액 부족`); return; }
            await db.collection('users').doc(currentUser.uid).update({
                [`offchainBalances.${from}`]: (offBal[from] || 0) - amount,
                [`offchainBalances.${to}`]: (offBal[to] || 0) + amount
            });
            userWallet.offchainBalances[from] = (offBal[from] || 0) - amount;
            userWallet.offchainBalances[to] = (offBal[to] || 0) + amount;
            alert(`✅ ${amount} ${from.toUpperCase()} → ${amount} ${to.toUpperCase()} (1:1)`);
        } else {
            // 온체인 ↔ 온체인 (1:1, CRFN→FNC는 7:1)
            let fromBal = userWallet.balances[from] || 0;
            if (fromBal < amount) { alert(`${from.toUpperCase()} 잔액 부족`); return; }

            let rate = 1;
            let actualOut = amount;
            if (from === 'crfn' && to === 'fnc') { rate = 7; actualOut = Math.floor(amount / 7); }

            await walletRef.update({
                [`balances.${from}`]: fromBal - (rate > 1 ? actualOut * rate : amount),
                [`balances.${to}`]: (userWallet.balances[to] || 0) + actualOut
            });
            userWallet.balances[from] = fromBal - (rate > 1 ? actualOut * rate : amount);
            userWallet.balances[to] = (userWallet.balances[to] || 0) + actualOut;

            if (rate > 1) alert(`✅ ${actualOut * rate} CRFN → ${actualOut} FNC (7:1 스왓)`);
            else alert(`✅ ${amount} ${from.toUpperCase()} → ${amount} ${to.toUpperCase()}`);
        }

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, type: fromIsOff ? 'swap_offchain' : 'swap_onchain',
            fromToken: from, toToken: to, amount,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
    } catch (e) { alert('환전 실패: ' + e.message); }
}

// Load User Data (Messages, Posts)
async function loadUserData() {
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
}

// 소개자 정보 로드
async function loadReferralInfo() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const data = userDoc.data();
        
        // 소개 코드
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) codeEl.textContent = data.referralCode || '미생성';
        
        // 초대 수
        const countEl = document.getElementById('my-referral-count');
        if (countEl) countEl.textContent = `${data.referralCount || 0}명`;
        
        // 수익
        const earnings = data.referralEarnings || {};
        const earnCrny = document.getElementById('referral-earn-crny');
        const earnFnc = document.getElementById('referral-earn-fnc');
        const earnCrfn = document.getElementById('referral-earn-crfn');
        if (earnCrny) earnCrny.textContent = earnings.crny || 0;
        if (earnFnc) earnFnc.textContent = earnings.fnc || 0;
        if (earnCrfn) earnCrfn.textContent = earnings.crfn || 0;
    } catch (error) {
        console.error('소개자 정보 로드 실패:', error);
    }
}

// 소개 코드 복사
async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    
    if (!code || code === '미생성') {
        alert('먼저 소개 코드를 생성하세요');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(code);
        alert(`📋 소개 코드 복사됨: ${code}`);
    } catch (e) {
        prompt('소개 코드를 복사하세요:', code);
    }
}

// ========== MESSENGER ==========
let currentChat = null;
let currentChatOtherId = null;

function showChats() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
}

function showContacts() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'block';
    loadContacts();
}

async function showAddContactModal() {
    const email = prompt('추가할 연락처 이메일:');
    if (!email) return;
    
    const name = prompt('표시 이름 (선택):') || email;
    
    // Check if user exists
    const users = await db.collection('users').where('email', '==', email).get();
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const userId = users.docs[0].id;
    
    // Add to contacts
    await db.collection('users').doc(currentUser.uid)
        .collection('contacts').doc(userId).set({
            email: email,
            name: name,
            addedAt: new Date()
        });
    
    alert('✅ 연락처에 추가되었습니다');
    loadContacts();
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    contactList.innerHTML = '<p style="padding:1rem; text-align:center;">📋 로딩 중...</p>';
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    contactList.innerHTML = '';
    
    if (contacts.empty) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">👥</p>
                <p style="font-size:1.1rem; margin-bottom:0.5rem;">연락처가 없습니다</p>
                <p style="font-size:0.85rem; margin-bottom:1.5rem;">첫 연락처를 추가해보세요!</p>
                <button onclick="showAddContact()" class="btn-primary">➕ 연락처 추가</button>
            </div>
        `;
        return;
    }
    
    for (const doc of contacts.docs) {
        const contact = doc.data();
        
        // Get wallet address
        const users = await db.collection('users').where('email', '==', contact.email).get();
        let walletAddr = '';
        if (!users.empty) {
            const userData = users.docs[0].data();
            if (userData.walletAddress) {
                const addr = userData.walletAddress;
                walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
            }
        }
        
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="contact-info">
                <strong style="font-size:0.95rem;">${contact.name}</strong>
                <p style="font-size:0.75rem; margin:0.2rem 0;">${contact.email}</p>
                ${walletAddr ? `<p style="font-size:0.7rem; color:var(--accent); margin:0;">💳 ${walletAddr}</p>` : ''}
            </div>
            <button onclick='startChatWithContact("${contact.email}")' class="btn-chat">채팅</button>
        `;
        contactList.appendChild(contactItem);
    }
}

async function startChatWithContact(email) {
    try {
        await startNewChat(email);
        
        // Switch to chats tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('chats-view').style.display = 'block';
        document.getElementById('contacts-view').style.display = 'none';
        
        // Show messenger page
        showPage('messenger');
    } catch (error) {
        console.error('Chat start error:', error);
        alert('채팅 시작 실패');
    }
}

function showNewChatModal() {
    const email = prompt('채팅할 사용자 이메일:');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        console.log('Starting chat with:', otherEmail);
        
        if (otherEmail === currentUser.email) {
            alert('자기 자신과는 채팅할 수 없습니다');
            return;
        }
        
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        console.log('Found users:', users.size);
        
        if (users.empty) {
            alert('사용자를 찾을 수 없습니다');
            return;
        }
        
        const otherUser = users.docs[0];
        const otherId = otherUser.id;
        console.log('Other user ID:', otherId);
        
        // Check if chat exists
        const existingChat = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .get();
        
        console.log('Existing chats:', existingChat.size);
        
        let chatId = null;
        
        for (const doc of existingChat.docs) {
            const chat = doc.data();
            if (chat.participants.includes(otherId)) {
                chatId = doc.id;
                console.log('Found existing chat:', chatId);
                break;
            }
        }
        
        // Create new chat if not exists
        if (!chatId) {
            console.log('Creating new chat...');
            const newChat = await db.collection('chats').add({
                participants: [currentUser.uid, otherId],
                otherEmail: otherEmail,
                myEmail: currentUser.email,
                lastMessage: '',
                lastMessageTime: new Date(),
                createdAt: new Date()
            });
            chatId = newChat.id;
            console.log('Created chat:', chatId);
        }
        
        await loadMessages();
        await openChat(chatId, otherId);
        console.log('Chat opened successfully');
    } catch (error) {
        console.error('Start chat error:', error);
        alert('채팅 시작 실패: ' + error.message);
    }
}

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    const chats = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    if (chats.empty) {
        chatList.innerHTML = '<p style="padding:1rem; color:var(--accent);">채팅을 시작하세요</p>';
        return;
    }
    
    // Sort manually
    const chatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis() || 0;
        const bTime = b.data().lastMessageTime?.toMillis() || 0;
        return bTime - aTime;
    });
    
    for (const doc of chatDocs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        
        const otherUserDoc = await db.collection('users').doc(otherId).get();
        const otherEmail = otherUserDoc.data().email;
        
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="chat-preview">
                <strong>${otherEmail}</strong>
                <p>${chat.lastMessage || '메시지 없음'}</p>
            </div>
        `;
        chatList.appendChild(chatItem);
    }
}

async function openChat(chatId, otherId) {
    currentChat = chatId;
    currentChatOtherId = otherId;
    
    const otherUser = await db.collection('users').doc(otherId).get();
    const otherEmail = otherUser.data().email;
    document.getElementById('chat-username').textContent = otherEmail;
    
    // Show chat window
    document.querySelector('.chat-window').style.display = 'flex';
    
    // Real-time listener
    db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            
            if (snapshot.empty) {
                messagesDiv.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">메시지를 보내보세요!</p>';
            }
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                
                const msgEl = document.createElement('div');
                msgEl.style.cssText = `
                    background: ${isMine ? 'var(--text)' : 'var(--bg)'};
                    color: ${isMine ? 'white' : 'var(--text)'};
                    padding: 0.8rem;
                    border-radius: 12px;
                    margin-bottom: 0.5rem;
                    max-width: 70%;
                    margin-left: ${isMine ? 'auto' : '0'};
                    word-break: break-word;
                `;
                
                let content = msg.text;
                if (msg.tokenAmount) {
                    content = `💰 ${msg.tokenAmount} ${msg.tokenType} 전송\n${msg.text || ''}`;
                }
                
                msgEl.textContent = content;
                messagesDiv.appendChild(msgEl);
            });
            
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    
    console.log('Chat opened:', chatId, 'with', otherEmail);
}

async function sendMessage() {
    if (!currentChat) {
        alert('채팅을 선택하세요');
        return;
    }
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('chats').doc(currentChat)
        .collection('messages').add({
            senderId: currentUser.uid,
            text: text,
            timestamp: new Date()
        });
    
    await db.collection('chats').doc(currentChat).update({
        lastMessage: text,
        lastMessageTime: new Date()
    });
    
    input.value = '';
}

async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) {
        alert('채팅을 선택하세요');
        return;
    }
    
    const amount = prompt('전송할 CRNY 수량:');
    if (!amount) return;
    
    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || amountNum > userWallet.balances.crny) {
        alert(`잔액이 부족하거나 잘못된 수량입니다\n잔액: ${userWallet.balances.crny} CRNY`);
        return;
    }
    
    const message = prompt('메시지 (선택):') || '';
    
    // Update balances
    await db.collection('users').doc(currentUser.uid).update({
        'balances.crny': userWallet.balances.crny - amountNum
    });
    
    const otherUser = await db.collection('users').doc(currentChatOtherId).get();
    await db.collection('users').doc(currentChatOtherId).update({
        'balances.crny': otherUser.data().balances.crny + amountNum
    });
    
    // Send message with token
    await db.collection('chats').doc(currentChat)
        .collection('messages').add({
            senderId: currentUser.uid,
            text: message,
            tokenAmount: amountNum,
            tokenType: 'CRNY',
            timestamp: new Date()
        });
    
    await db.collection('chats').doc(currentChat).update({
        lastMessage: `💰 ${amountNum} CRNY 전송`,
        lastMessageTime: new Date()
    });
    
    // Transaction record
    await db.collection('transactions').add({
        from: currentUser.uid,
        to: currentChatOtherId,
        amount: amountNum,
        token: 'CRNY',
        message: message,
        timestamp: new Date()
    });
    
    alert(`✅ ${amountNum} CRNY 전송 완료!`);
    loadUserWallet();
}

// ========== SOCIAL FEED ==========
async function loadSocialFeed() {
    const feed = document.getElementById('social-feed');
    feed.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--accent);">📸 게시물 로딩 중...</p>';
    
    try {
        const posts = await db.collection('posts')
            .limit(50)
            .get();
        
        // Sort manually
        const sortedPosts = posts.docs.sort((a, b) => {
            const aTime = a.data().timestamp?.toMillis() || 0;
            const bTime = b.data().timestamp?.toMillis() || 0;
            return bTime - aTime;
        });
        
        feed.innerHTML = '';
        
        if (sortedPosts.length === 0) {
            feed.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                    <p style="font-size:1.2rem; margin-bottom:0.5rem;">아직 게시물이 없습니다</p>
                    <p style="font-size:0.9rem;">첫 게시물을 작성해보세요!</p>
                </div>
            `;
            return;
        }
        
        for (const doc of sortedPosts) {
            const post = doc.data();
            
            // Get user info
            const userDoc = await db.collection('users').doc(post.userId).get();
            const userData = userDoc.exists ? userDoc.data() : { email: '알 수 없음' };
            const userName = userData.nickname || userData.displayName || userData.email;
            
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            
            // Likes display
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const likeButton = likedByMe ? '❤️' : '🤍';
            
            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">👤</div>
                    <div class="post-info">
                        <strong>${userName}</strong>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <div class="post-content">
                    <p>${post.text}</p>
                    ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:8px; margin-top:0.5rem;">` : ''}
                </div>
                <div class="post-actions">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})">${likeButton} ${likeCount}</button>
                    <button onclick="showLikedUsers('${doc.id}')">👥 좋아요</button>
                    <button onclick="toggleComments('${doc.id}')">💬 댓글 ${(post.commentCount || 0)}</button>
                </div>
                <div id="comments-${doc.id}" style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border);">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="댓글 입력..." style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
                        <button onclick="addComment('${doc.id}')" class="btn-primary" style="padding:0.5rem 1rem;">작성</button>
                    </div>
                </div>
            `;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
                <p style="color:red; margin-bottom:0.5rem;">로딩 실패</p>
                <p style="font-size:0.85rem; color:var(--accent);">${error.message}</p>
                <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">다시 시도</button>
            </div>
        `;
    }
}

async function toggleLike(postId, isLiked) {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const data = post.data();
    
    let likedBy = data.likedBy || [];
    let likes = data.likes || 0;
    
    if (isLiked) {
        likedBy = likedBy.filter(uid => uid !== currentUser.uid);
        likes = Math.max(0, likes - 1);
    } else {
        likedBy.push(currentUser.uid);
        likes += 1;
    }
    
    await postRef.update({ likedBy, likes });
    loadSocialFeed();
}

async function showLikedUsers(postId) {
    const post = await db.collection('posts').doc(postId).get();
    const data = post.data();
    const likedBy = data.likedBy || [];
    
    if (likedBy.length === 0) {
        alert('아직 좋아요가 없습니다');
        return;
    }
    
    let message = '좋아요 한 사람:\n\n';
    for (const uid of likedBy) {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        message += `👤 ${userName}\n`;
    }
    
    alert(message);
}

async function toggleComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);
    
    if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsDiv.style.display = 'none';
    }
}

async function loadComments(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    commentList.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩 중...</p>';
    
    const comments = await db.collection('posts').doc(postId)
        .collection('comments')
        .orderBy('timestamp', 'asc')
        .get();
    
    commentList.innerHTML = '';
    
    if (comments.empty) {
        commentList.innerHTML = '<p style="text-align:center; color:var(--accent); font-size:0.85rem;">첫 댓글을 남겨보세요!</p>';
        return;
    }
    
    for (const doc of comments.docs) {
        const comment = doc.data();
        const userDoc = await db.collection('users').doc(comment.userId).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        
        const commentEl = document.createElement('div');
        commentEl.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        commentEl.innerHTML = `
            <strong style="font-size:0.85rem;">${userName}</strong>
            <p style="margin:0.3rem 0 0 0; font-size:0.9rem;">${comment.text}</p>
            <span style="font-size:0.75rem; color:var(--accent);">${getTimeAgo(comment.timestamp.toDate())}</span>
        `;
        commentList.appendChild(commentEl);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('posts').doc(postId).collection('comments').add({
        userId: currentUser.uid,
        text: text,
        timestamp: new Date()
    });
    
    // Update comment count
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    await postRef.update({
        commentCount: (post.data().commentCount || 0) + 1
    });
    
    input.value = '';
    await loadComments(postId);
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
}

async function createPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const text = textarea.value.trim();
    
    if (!text && !fileInput.files[0]) {
        alert('내용 또는 이미지를 입력하세요');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload image if exists
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            imageUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        
        await db.collection('posts').add({
            userId: currentUser.uid,
            text: text,
            imageUrl: imageUrl,
            likes: 0,
            likedBy: [],
            commentCount: 0,
            timestamp: new Date()
        });
        
        textarea.value = '';
        fileInput.value = '';
        await loadSocialFeed();
        alert('✅ 게시 완료!');
    } catch (error) {
        console.error('Post error:', error);
        alert('게시 실패');
    }
}

async function likePost(postId, currentLikes) {
    try {
        await db.collection('posts').doc(postId).update({
            likes: currentLikes + 1
        });
        
        await loadSocialFeed();
    } catch (error) {
        console.error('Like error:', error);
    }
}

// ========== SEND TOKENS ==========
let selectedToken = null;

function selectToken(tokenType) {
    selectedToken = tokenType;
    
    // Remove all selected classes
    document.querySelectorAll('.token-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class (safe check for element existence)
    const card = document.getElementById(`token-card-${tokenType}`);
    if (card) card.classList.add('selected');
    
    console.log('Selected token:', tokenType.toUpperCase());
}

async function showSendModal() {
    if (!selectedToken) {
        alert('전송할 토큰을 먼저 선택하세요');
        return;
    }
    
    // Off-chain tokens → 오프체인 전송 플로우
    if (isOffchainToken(selectedToken)) {
        showOffchainSendModal();
        return;
    }
    
    const tokenType = selectedToken.toUpperCase();
    const balance = userWallet.balances[selectedToken];
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    if (contacts.empty) {
        const email = prompt('받는 사람 이메일:');
        if (!email) return;
        
        const amount = prompt(`${email}에게 전송할 ${tokenType} 수량:\n(잔액: ${balance})`);
        if (!amount) return;
        
        await sendTokensByEmail(email, parseFloat(amount), tokenType);
    } else {
        // Get wallet addresses for contacts
        let contactList = `${tokenType} 전송 - 받는 사람 선택:\n\n`;
        const contactsArray = [];
        
        for (const doc of contacts.docs) {
            const contact = doc.data();
            
            // Get user's wallet address
            const users = await db.collection('users').where('email', '==', contact.email).get();
            let walletAddr = '';
            if (!users.empty) {
                const userData = users.docs[0].data();
                if (userData.walletAddress) {
                    const addr = userData.walletAddress;
                    walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                }
            }
            
            contactsArray.push({...contact, walletAddr});
            contactList += `${contactsArray.length}. ${contact.name}\n`;
            contactList += `   ${contact.email}\n`;
            if (walletAddr) {
                contactList += `   지갑: ${walletAddr}\n`;
            }
            contactList += `\n`;
        }
        
        contactList += `0. 직접 입력\n\n번호:`;
        
        const choice = prompt(contactList);
        if (!choice) return;
        
        const choiceNum = parseInt(choice);
        let recipientEmail;
        
        if (choiceNum === 0) {
            recipientEmail = prompt('받는 사람 이메일:');
        } else if (choiceNum > 0 && choiceNum <= contactsArray.length) {
            recipientEmail = contactsArray[choiceNum - 1].email;
        } else {
            alert('잘못된 선택입니다');
            return;
        }
        
        if (!recipientEmail) return;
        
        const amount = prompt(`${recipientEmail}에게 전송할 ${tokenType} 수량:\n(잔액: ${balance})`);
        if (!amount) return;
        
        await sendTokensByEmail(recipientEmail, parseFloat(amount), tokenType);
    }
}

async function sendTokensByEmail(recipientEmail, amount, tokenType = 'CRNY') {
    if (!userWallet) return;
    
    const tokenKey = tokenType.toLowerCase();
    const balance = userWallet.balances[tokenKey];
    
    if (amount <= 0 || amount > balance) {
        alert(`잔액이 부족하거나 잘못된 수량입니다\n잔액: ${balance} ${tokenType}`);
        return;
    }
    
    const users = await db.collection('users').where('email', '==', recipientEmail).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const recipientDoc = users.docs[0];
    const recipient = recipientDoc.data();
    
    try {
        // Check if Crowny wallet (gas subsidy) or external wallet
        if (userWallet.isImported) {
            alert('⚠️ 외부 지갑은 가스비가 차감됩니다.\n지갑에 MATIC이 충분한지 확인하세요.');
            // TODO: Implement actual blockchain transfer with user's gas
            alert('외부 지갑 전송은 곧 지원됩니다.');
            return;
        }
        
        // Crowny wallet - Admin gas subsidy
        const gasEstimate = 0.001; // Estimated MATIC for transfer
        
        alert(`⏳ 전송 요청 중...\n가스비 ${gasEstimate} MATIC은 관리자가 대납합니다.`);
        
        // Request admin-sponsored transfer
        await db.collection('transfer_requests').add({
            from: currentUser.uid,
            fromEmail: currentUser.email,
            fromAddress: userWallet.walletAddress,
            to: recipientDoc.id,
            toEmail: recipientEmail,
            toAddress: recipient.walletAddress,
            amount: amount,
            token: tokenType,
            estimatedGas: gasEstimate,
            status: 'pending',
            requestedAt: new Date()
        });
        
        alert(`✅ 전송 요청 완료!\n\n관리자가 처리 후:\n- ${amount} ${tokenType} 전송\n- 가스비 ${gasEstimate} MATIC 대납 기록`);
        
        console.log('Transfer requested:', {
            from: currentUser.email,
            to: recipientEmail,
            amount: amount,
            token: tokenType,
            gas: gasEstimate
        });
        
    } catch (error) {
        console.error('❌ Transfer request error:', error);
        alert('전송 요청 실패: ' + error.message);
    }
}

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
let web3;
try {
    web3 = new Web3('https://polygon-rpc.com');
} catch(e) {
    web3 = new Web3('https://rpc-mainnet.matic.quiknode.pro');
}

// ========== 온체인 ERC-20 함수 ==========

// 특정 지갑의 ERC-20 잔액 조회
async function getOnchainBalance(walletAddress, tokenKey) {
    try {
        const token = POLYGON_TOKENS[tokenKey.toLowerCase()];
        if (!token) return 0;
        
        const contract = new web3.eth.Contract(ERC20_ABI, token.address);
        const rawBalance = await contract.methods.balanceOf(walletAddress).call();
        const balance = parseFloat(web3.utils.fromWei(rawBalance, 'ether'));
        return balance;
    } catch (error) {
        console.error(`온체인 잔액 조회 실패 (${tokenKey}):`, error);
        return 0;
    }
}

// 3개 토큰 전체 잔액 조회
async function getAllOnchainBalances(walletAddress) {
    const [crny, fnc, crfn] = await Promise.all([
        getOnchainBalance(walletAddress, 'crny'),
        getOnchainBalance(walletAddress, 'fnc'),
        getOnchainBalance(walletAddress, 'crfn')
    ]);
    return { crny, fnc, crfn };
}

// ERC-20 토큰 전송 (private key 필요)
async function sendOnchainToken(fromPrivateKey, toAddress, tokenKey, amount) {
    const token = POLYGON_TOKENS[tokenKey.toLowerCase()];
    if (!token) throw new Error('알 수 없는 토큰: ' + tokenKey);
    
    const contract = new web3.eth.Contract(ERC20_ABI, token.address);
    const amountWei = web3.utils.toWei(amount.toString(), 'ether');
    
    // 보내는 지갑 주소 추출
    const account = web3.eth.accounts.privateKeyToAccount(fromPrivateKey);
    const fromAddress = account.address;
    
    // 트랜잭션 데이터
    const txData = contract.methods.transfer(toAddress, amountWei).encodeABI();
    
    // 가스 추정
    const gasPrice = await web3.eth.getGasPrice();
    let gasEstimate;
    try {
        gasEstimate = await contract.methods.transfer(toAddress, amountWei).estimateGas({ from: fromAddress });
    } catch (e) {
        gasEstimate = 100000; // 기본값
    }
    
    const tx = {
        from: fromAddress,
        to: token.address,
        data: txData,
        gas: Math.floor(gasEstimate * 1.2), // 20% 여유
        gasPrice: gasPrice
    };
    
    // 서명 & 전송
    const signedTx = await web3.eth.accounts.signTransaction(tx, fromPrivateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    
    console.log(`✅ 온체인 전송 완료: ${amount} ${token.symbol} → ${toAddress}`);
    console.log(`   TX: https://polygonscan.com/tx/${receipt.transactionHash}`);
    
    return receipt;
}

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
            const challenge = doc.data();
            const card = document.createElement('div');
            card.style.cssText = 'background:white; padding:1.5rem; border-radius:12px; margin-bottom:1rem; border:2px solid var(--border);';
            card.innerHTML = `
                <h3 style="margin-bottom:0.5rem;">${challenge.name}</h3>
                <p style="color:var(--accent); margin-bottom:1rem;">${challenge.description}</p>
                
                <div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:1rem;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                        <div>
                            <strong>💰 계좌:</strong> $${(challenge.initialBalance || 100000).toLocaleString()}
                        </div>
                        <div>
                            <strong>📊 최대 계약:</strong> ${challenge.maxContracts || 7}개
                        </div>
                        <div>
                            <strong>📈 최대 포지션:</strong> ${challenge.maxPositions || 20}개
                        </div>
                        <div>
                            <strong>🚨 청산:</strong> -$${(challenge.maxDrawdown || 3000).toLocaleString()}
                        </div>
                        <div>
                            <strong>⏰ 정산:</strong> ${challenge.settlement || 'EOD'}
                        </div>
                        <div>
                            <strong>💎 상금:</strong> ${challenge.rewardToken || 'CRFN'} (매일)
                        </div>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; font-size:0.9rem;">
                    <div style="background:#e3f2fd; padding:0.8rem; border-radius:6px; text-align:center;">
                        <div style="font-size:0.8rem; color:var(--accent);">참가비</div>
                        <strong style="font-size:1.2rem; color:#0066cc;">${challenge.entryFee} CRNY</strong>
                    </div>
                    <div style="background:#f3e5f5; padding:0.8rem; border-radius:6px; text-align:center;">
                        <div style="font-size:0.8rem; color:var(--accent);">참가자</div>
                        <strong style="font-size:1.2rem; color:#9c27b0;">${challenge.participants || 0}명</strong>
                    </div>
                </div>
                
                <button onclick="joinChallenge('${doc.id}')" class="btn-primary" style="width:100%; padding:1rem; font-size:1.1rem;">
                    🚀 챌린지 참가
                </button>
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
    
    // 입력 폼을 HTML로 표시
    const formHTML = `
        <div id="create-challenge-form" style="background:white; padding:1.5rem; border-radius:12px; margin-top:1rem; border:2px solid var(--accent);">
            <h3 style="margin-bottom:1rem;">🆕 새 챌린지 생성</h3>
            
            <div style="display:grid; gap:0.8rem;">
                <div>
                    <label style="font-size:0.85rem; font-weight:600;">챌린지 이름</label>
                    <input type="text" id="ch-name" value="교육게임 버전 1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">💰 초기 계좌 ($)</label>
                        <input type="number" id="ch-balance" value="100000" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">🎫 참가비 (CRNY)</label>
                        <input type="number" id="ch-fee" value="1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
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
                        <input type="number" id="ch-daily-limit" value="100" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                        <span style="font-size:0.7rem; color:var(--accent);">이 금액 손실 시 당일 거래 중단</span>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">💀 누적 청산 한도 ($)</label>
                        <input type="number" id="ch-max-drawdown" value="2000" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                        <span style="font-size:0.7rem; color:var(--accent);">이 금액 손실 시 강제 청산 + CRNY 소각</span>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">📈 최대 동시 포지션</label>
                        <input type="number" id="ch-max-positions" value="5" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏳ 기간 (일)</label>
                        <input type="number" id="ch-duration" value="30" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏰ 정산</label>
                        <select id="ch-settlement" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="EOD">EOD (End of Day)</option>
                            <option value="WEEKLY">주간</option>
                            <option value="MONTHLY">월간</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">💎 상금 토큰</label>
                        <select id="ch-reward" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="CRFN">CRFN</option>
                            <option value="CRNY">CRNY</option>
                            <option value="FNC">FNC</option>
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
    
    // 기존 폼 제거 후 추가
    const existing = document.getElementById('create-challenge-form');
    if (existing) existing.remove();
    
    const container = document.getElementById('trading-challenges');
    if (container) {
        container.insertAdjacentHTML('afterend', formHTML);
    }
}

async function submitCreateChallenge() {
    if (!isAdmin()) return;
    
    const name = document.getElementById('ch-name').value;
    if (!name) { alert('챌린지 이름을 입력하세요'); return; }
    
    try {
        const challengeData = {
            name: name,
            description: name,
            entryFee: parseFloat(document.getElementById('ch-fee').value) || 1,
            initialBalance: parseFloat(document.getElementById('ch-balance').value) || 100000,
            allowedProduct: document.getElementById('ch-product').value || 'MNQ',
            maxContracts: parseInt(document.getElementById('ch-max-contracts').value) || 1,
            dailyLossLimit: parseFloat(document.getElementById('ch-daily-limit').value) || 100,
            maxDrawdown: parseFloat(document.getElementById('ch-max-drawdown').value) || 2000,
            maxPositions: parseInt(document.getElementById('ch-max-positions').value) || 5,
            duration: parseInt(document.getElementById('ch-duration').value) || 30,
            settlement: document.getElementById('ch-settlement').value || 'EOD',
            rewardToken: document.getElementById('ch-reward').value || 'CRFN',
            participants: 0,
            totalPool: 0,
            status: 'active',
            createdBy: currentUser.email,
            createdAt: new Date()
        };
        
        await db.collection('prop_challenges').add(challengeData);
        
        alert(`✅ 챌린지 생성 완료!\n\n${name}\n계좌: $${challengeData.initialBalance.toLocaleString()}\n상품: ${challengeData.allowedProduct}\n일일 한도: -$${challengeData.dailyLossLimit}\n청산: -$${challengeData.maxDrawdown}`);
        
        document.getElementById('create-challenge-form')?.remove();
        loadPropTrading();
    } catch (error) {
        alert('생성 실패: ' + error.message);
    }
}

async function joinChallenge(challengeId) {
    const challenge = await db.collection('prop_challenges').doc(challengeId).get();
    const data = challenge.data();
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    
    if (wallet.balances.crny < data.entryFee) {
        alert(`CRNY 잔액이 부족합니다\n필요: ${data.entryFee} CRNY\n보유: ${wallet.balances.crny} CRNY`);
        return;
    }
    
    const productText = data.allowedProduct === 'MNQ' ? 'MNQ (마이크로) 전용' :
                        data.allowedProduct === 'NQ' ? 'NQ (미니) 전용' : 'MNQ + NQ';
    
    const confirm = window.confirm(
        `🎯 프랍 트레이딩 챌린지 참가\n\n` +
        `${data.name}\n\n` +
        `💰 가상 계좌: $${(data.initialBalance || 100000).toLocaleString()}\n` +
        `📊 상품: ${productText}\n` +
        `📦 최대 계약: ${data.maxContracts || 1}개\n` +
        `📈 최대 포지션: ${data.maxPositions || 5}개\n` +
        `🔴 일일 한도: -$${data.dailyLossLimit || 100}\n` +
        `💀 청산 기준: -$${(data.maxDrawdown || 2000).toLocaleString()}\n` +
        `⏰ 정산: ${data.settlement || 'EOD'}\n` +
        `💎 상금: ${data.rewardToken || 'CRFN'}\n\n` +
        `참가비: ${data.entryFee} CRNY\n\n` +
        `✅ 참가비는 관리자 지갑으로 이동합니다`
    );
    
    if (!confirm) return;
    
    try {
        // Admin 전용 지갑 가져오기 또는 생성
        let adminWalletRef = await db.collection('system_wallets').doc('admin').get();
        
        if (!adminWalletRef.exists) {
            await db.collection('system_wallets').doc('admin').set({
                name: '관리자 전용 지갑',
                type: 'admin',
                ownerEmail: ADMIN_EMAIL,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
            adminWalletRef = await db.collection('system_wallets').doc('admin').get();
        }
        
        const adminWallet = adminWalletRef.data();
        
        // 사용자 CRNY 차감
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({
                'balances.crny': wallet.balances.crny - data.entryFee
            });
        
        // Admin 지갑에 CRNY 추가
        await db.collection('system_wallets').doc('admin').update({
            'balances.crny': (adminWallet.balances?.crny || 0) + data.entryFee
        });
        
        // 참가자 추가 (챌린지 조건 포함)
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').add({
                userId: currentUser.uid,
                email: currentUser.email,
                walletId: currentWalletId,
                joinedAt: new Date(),
                initialBalance: data.initialBalance || 100000,
                currentBalance: data.initialBalance || 100000,
                allowedProduct: data.allowedProduct || 'MNQ',
                maxContracts: data.maxContracts || 1,
                maxPositions: data.maxPositions || 5,
                dailyLossLimit: data.dailyLossLimit || 100,
                maxDrawdown: data.maxDrawdown || 2000,
                profitPercent: 0,
                dailyPnL: 0,
                totalPnL: 0,
                trades: [],
                status: 'active',
                lastEOD: new Date()
            });
        
        await db.collection('prop_challenges').doc(challengeId).update({
            participants: (data.participants || 0) + 1,
            totalPool: (data.totalPool || 0) + data.entryFee
        });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid,
            fromEmail: currentUser.email,
            to: 'system:admin',
            amount: data.entryFee,
            token: 'CRNY',
            type: 'challenge_entry',
            challengeId: challengeId,
            timestamp: new Date()
        });
        
        alert(`✅ 챌린지 참가 완료!\n\n💰 ${data.entryFee} CRNY → 관리자 지갑\n💵 가상 계좌 $${(data.initialBalance || 100000).toLocaleString()} 지급\n📊 트레이딩 시작!`);
        
        // 소개자 수수료 배분 (10%)
        await distributeReferralReward(currentUser.uid, data.entryFee, 'CRNY');
        
        loadUserWallet();
        loadPropTrading();
        loadTradingDashboard();
    } catch (error) {
        console.error('Join error:', error);
        alert('참가 실패: ' + error.message);
    }
}

// ========== ART - 디지털 아트 거래소 ==========

const ART_CATEGORIES = {
    painting: '🖌️ 회화',
    digital: '💻 디지털 아트',
    photo: '📷 사진',
    sculpture: '🗿 조각/설치',
    illustration: '✏️ 일러스트',
    calligraphy: '🖋️ 서예/캘리',
    mixed: '🎭 혼합 매체',
    ai: '🤖 AI 아트',
    other: '🎨 기타'
};

function toggleArtSaleOptions() {
    const type = document.getElementById('art-sale-type').value;
    document.getElementById('art-price-section').style.display = type === 'fixed' ? 'block' : 'none';
    document.getElementById('art-auction-section').style.display = type === 'auction' ? 'block' : 'none';
}

// 작품 등록
async function uploadArtwork() {
    if (!currentUser) { alert('로그인이 필요합니다'); return; }
    
    const title = document.getElementById('art-title').value.trim();
    const description = document.getElementById('art-description').value.trim();
    const category = document.getElementById('art-category').value;
    const saleType = document.getElementById('art-sale-type').value;
    const imageFile = document.getElementById('art-image').files[0];
    
    if (!title) { alert('작품 제목을 입력하세요'); return; }
    if (!imageFile) { alert('작품 이미지를 선택하세요'); return; }
    
    try {
        // 이미지를 Base64로 변환 (Firebase Storage 없이)
        const imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });
        
        // 이미지 리사이즈 (최대 800px)
        const resized = await resizeImage(imageData, 800);
        
        const artwork = {
            title: title,
            description: description,
            category: category,
            saleType: saleType,
            imageData: resized,
            artistId: currentUser.uid,
            artistEmail: currentUser.email,
            artistNickname: '',
            likes: 0,
            views: 0,
            status: 'active',
            createdAt: new Date()
        };
        
        // 아티스트 닉네임
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) artwork.artistNickname = userDoc.data().nickname || '';
        
        // 판매 유형별
        if (saleType === 'fixed') {
            artwork.price = parseFloat(document.getElementById('art-price').value) || 0;
            artwork.priceToken = document.getElementById('art-price-token').value;
        } else if (saleType === 'auction') {
            artwork.startPrice = parseFloat(document.getElementById('art-start-price').value) || 1;
            artwork.currentBid = 0;
            artwork.highestBidder = null;
            artwork.priceToken = 'CRNY';
            const hours = parseInt(document.getElementById('art-auction-hours').value) || 24;
            artwork.auctionEnd = new Date(Date.now() + hours * 60 * 60 * 1000);
        }
        
        await db.collection('artworks').add(artwork);
        
        alert(`🎨 "${title}" 등록 완료!`);
        
        // 폼 초기화
        document.getElementById('art-title').value = '';
        document.getElementById('art-description').value = '';
        document.getElementById('art-image').value = '';
        
        loadArtGallery();
    } catch (error) {
        alert('등록 실패: ' + error.message);
    }
}

// 이미지 리사이즈
function resizeImage(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = dataUrl;
    });
}

// 갤러리 로드
async function loadArtGallery() {
    const container = document.getElementById('art-gallery');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩 중...</p>';
    
    try {
        const filterCat = document.getElementById('art-filter-category')?.value || 'all';
        const filterSort = document.getElementById('art-filter-sort')?.value || 'newest';
        
        let query = db.collection('artworks').where('status', '==', 'active');
        
        if (filterCat !== 'all') {
            query = query.where('category', '==', filterCat);
        }
        
        // 정렬
        if (filterSort === 'newest') query = query.orderBy('createdAt', 'desc');
        else if (filterSort === 'popular') query = query.orderBy('likes', 'desc');
        else query = query.orderBy('createdAt', 'desc');
        
        const artworks = await query.limit(30).get();
        
        if (artworks.empty) {
            container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">아직 등록된 작품이 없습니다. 첫 작품을 등록해보세요!</p>';
            return;
        }
        
        let items = [];
        artworks.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        
        // 클라이언트 정렬
        if (filterSort === 'price-low') items.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (filterSort === 'price-high') items.sort((a, b) => (b.price || 0) - (a.price || 0));
        else if (filterSort === 'auction') items = items.filter(a => a.saleType === 'auction');
        
        container.innerHTML = items.map(art => renderArtCard(art)).join('');
    } catch (error) {
        container.innerHTML = `<p style="color:red; grid-column:1/-1;">로드 실패: ${error.message}</p>`;
    }
}

// 아트 카드 렌더링
function renderArtCard(art) {
    const catLabel = ART_CATEGORIES[art.category] || '🎨';
    let priceLabel = '';
    
    if (art.saleType === 'fixed') {
        priceLabel = `<span style="color:#0066cc; font-weight:700;">${art.price} ${art.priceToken}</span>`;
    } else if (art.saleType === 'auction') {
        const isEnded = art.auctionEnd && new Date(art.auctionEnd.seconds ? art.auctionEnd.seconds * 1000 : art.auctionEnd) < new Date();
        if (isEnded) {
            priceLabel = `<span style="color:#cc0000;">경매 종료</span>`;
        } else {
            priceLabel = `<span style="color:#ff9800;">🔨 ${art.currentBid || art.startPrice} CRNY</span>`;
        }
    } else {
        priceLabel = `<span style="color:var(--accent);">전시 중</span>`;
    }
    
    return `
        <div onclick="viewArtwork('${art.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08); transition:transform 0.2s;" onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''">
            <div style="width:100%; height:160px; overflow:hidden; background:#f0f0f0;">
                <img src="${art.imageData}" style="width:100%; height:100%; object-fit:cover;" alt="${art.title}">
            </div>
            <div style="padding:0.6rem;">
                <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${art.title}</div>
                <div style="font-size:0.7rem; color:var(--accent); margin:0.2rem 0;">${catLabel} · ${art.artistNickname || '익명'}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.3rem;">
                    ${priceLabel}
                    <span style="font-size:0.7rem; color:var(--accent);">❤️ ${art.likes || 0}</span>
                </div>
            </div>
        </div>
    `;
}

// 작품 상세보기
async function viewArtwork(artId) {
    try {
        const doc = await db.collection('artworks').doc(artId).get();
        if (!doc.exists) { alert('작품을 찾을 수 없습니다'); return; }
        
        const art = doc.data();
        
        // 조회수 증가
        await db.collection('artworks').doc(artId).update({ views: (art.views || 0) + 1 });
        
        const catLabel = ART_CATEGORIES[art.category] || '🎨';
        const isOwner = currentUser && art.artistId === currentUser.uid;
        
        let actionHtml = '';
        
        if (art.saleType === 'fixed' && !isOwner) {
            actionHtml = `<button onclick="buyArtwork('${artId}')" style="background:#0066cc; color:white; border:none; padding:0.8rem 2rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%;">💰 ${art.price} ${art.priceToken}로 구매</button>`;
        } else if (art.saleType === 'auction' && !isOwner) {
            const currentBid = art.currentBid || art.startPrice || 1;
            const minBid = currentBid + 1;
            actionHtml = `
                <div style="display:flex; gap:0.5rem;">
                    <input type="number" id="bid-amount-${artId}" value="${minBid}" min="${minBid}" style="flex:1; padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <button onclick="placeBid('${artId}')" style="background:#ff9800; color:white; border:none; padding:0.8rem 1.5rem; border-radius:8px; cursor:pointer; font-weight:700;">🔨 입찰</button>
                </div>
                <p style="font-size:0.75rem; color:var(--accent); margin-top:0.3rem;">현재 최고 입찰: ${currentBid} CRNY${art.highestBidderNickname ? ' (' + art.highestBidderNickname + ')' : ''}</p>
            `;
        } else if (isOwner) {
            actionHtml = `<button onclick="deleteArtwork('${artId}')" style="background:#cc0000; color:white; border:none; padding:0.6rem 1.5rem; border-radius:6px; cursor:pointer; font-size:0.85rem;">🗑️ 작품 삭제</button>`;
        }
        
        // 모달 표시
        const modal = document.createElement('div');
        modal.id = 'art-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; padding:1rem;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
                <img src="${art.imageData}" style="width:100%; border-radius:12px 12px 0 0; max-height:50vh; object-fit:contain; background:#f0f0f0;">
                <div style="padding:1.2rem;">
                    <h3 style="margin-bottom:0.5rem;">${art.title}</h3>
                    <div style="font-size:0.85rem; color:var(--accent); margin-bottom:0.8rem;">
                        ${catLabel} · 🎨 ${art.artistNickname || '익명'} · 👁️ ${(art.views || 0) + 1} · ❤️ ${art.likes || 0}
                    </div>
                    ${art.description ? `<p style="font-size:0.9rem; line-height:1.6; margin-bottom:1rem; color:#333;">${art.description}</p>` : ''}
                    <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                        <button onclick="likeArtwork('${artId}')" style="background:var(--bg); border:1px solid var(--border); padding:0.5rem 1rem; border-radius:6px; cursor:pointer;">❤️ 좋아요</button>
                    </div>
                    ${actionHtml}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        alert('작품 로드 실패: ' + error.message);
    }
}

// 좋아요
async function likeArtwork(artId) {
    try {
        const doc = await db.collection('artworks').doc(artId).get();
        await db.collection('artworks').doc(artId).update({ likes: (doc.data().likes || 0) + 1 });
        alert('❤️ 좋아요!');
    } catch (e) { console.error(e); }
}

// 고정가 구매
async function buyArtwork(artId) {
    if (!currentUser) return;
    
    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();
        
        if (art.status !== 'active') { alert('이미 판매된 작품입니다'); return; }
        
        const tokenKey = art.priceToken.toLowerCase();
        
        // 구매자 지갑 확인
        const wallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        
        if (wallets.empty) { alert('지갑이 없습니다'); return; }
        
        const walletDoc = wallets.docs[0];
        const balances = walletDoc.data().balances || {};
        
        if ((balances[tokenKey] || 0) < art.price) {
            alert(`${art.priceToken} 잔액이 부족합니다. 보유: ${balances[tokenKey] || 0}, 필요: ${art.price}`);
            return;
        }
        
        if (!window.confirm(`"${art.title}"\n\n${art.price} ${art.priceToken}로 구매하시겠습니까?`)) return;
        
        // 구매자 차감
        await walletDoc.ref.update({
            [`balances.${tokenKey}`]: balances[tokenKey] - art.price
        });
        
        // 판매자 입금
        const sellerWallets = await db.collection('users').doc(art.artistId)
            .collection('wallets').limit(1).get();
        
        if (!sellerWallets.empty) {
            const sellerWallet = sellerWallets.docs[0];
            const sellerBal = sellerWallet.data().balances || {};
            await sellerWallet.ref.update({
                [`balances.${tokenKey}`]: (sellerBal[tokenKey] || 0) + art.price
            });
        }
        
        // 작품 상태 변경
        await db.collection('artworks').doc(artId).update({
            status: 'sold',
            buyerId: currentUser.uid,
            buyerEmail: currentUser.email,
            soldAt: new Date()
        });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid,
            to: art.artistId,
            amount: art.price,
            token: art.priceToken,
            type: 'art_purchase',
            artworkId: artId,
            artworkTitle: art.title,
            timestamp: new Date()
        });
        
        // 소개자 수수료
        await distributeReferralReward(currentUser.uid, art.price, art.priceToken);
        
        alert(`🎉 "${art.title}" 구매 완료!`);
        
        // 모달 닫기
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        
        loadArtGallery();
        loadUserWallet();
    } catch (error) {
        alert('구매 실패: ' + error.message);
    }
}

// 경매 입찰
async function placeBid(artId) {
    if (!currentUser) return;
    
    const bidInput = document.getElementById(`bid-amount-${artId}`);
    const bidAmount = parseFloat(bidInput?.value);
    
    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();
        
        const minBid = (art.currentBid || art.startPrice || 1) + 1;
        if (bidAmount < minBid) { alert(`최소 입찰가: ${minBid} CRNY`); return; }
        
        // CRNY 잔액 확인
        const wallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        const balances = wallets.docs[0]?.data()?.balances || {};
        
        if ((balances.crny || 0) < bidAmount) {
            alert(`CRNY 잔액 부족. 보유: ${balances.crny || 0}`);
            return;
        }
        
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const nickname = userDoc.data()?.nickname || currentUser.email;
        
        await db.collection('artworks').doc(artId).update({
            currentBid: bidAmount,
            highestBidder: currentUser.uid,
            highestBidderEmail: currentUser.email,
            highestBidderNickname: nickname
        });
        
        // 입찰 기록
        await db.collection('artworks').doc(artId).collection('bids').add({
            bidderId: currentUser.uid,
            bidderEmail: currentUser.email,
            bidderNickname: nickname,
            amount: bidAmount,
            timestamp: new Date()
        });
        
        alert(`🔨 ${bidAmount} CRNY 입찰 완료!`);
        
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        
        loadArtGallery();
    } catch (error) {
        alert('입찰 실패: ' + error.message);
    }
}

// 작품 삭제
async function deleteArtwork(artId) {
    if (!window.confirm('작품을 삭제하시겠습니까?')) return;
    
    try {
        await db.collection('artworks').doc(artId).update({ status: 'deleted' });
        alert('🗑️ 삭제 완료');
        
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        
        loadArtGallery();
    } catch (error) {
        alert('삭제 실패: ' + error.message);
    }
}

// 내 작품 목록
async function loadMyArtworks() {
    if (!currentUser) return;
    const container = document.getElementById('my-art-collection');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        const arts = await db.collection('artworks')
            .where('artistId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(20).get();
        
        if (arts.empty) {
            container.innerHTML = '<p style="color:var(--accent);">등록한 작품이 없습니다</p>';
            return;
        }
        
        let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:0.5rem;">';
        arts.forEach(doc => {
            const art = { id: doc.id, ...doc.data() };
            const statusLabel = art.status === 'sold' ? '✅ 판매됨' : art.status === 'active' ? '🟢 판매 중' : '⬜ 삭제됨';
            html += `
                <div onclick="viewArtwork('${art.id}')" style="background:var(--bg); border-radius:8px; overflow:hidden; cursor:pointer;">
                    <img src="${art.imageData}" style="width:100%; height:100px; object-fit:cover;">
                    <div style="padding:0.4rem; font-size:0.75rem;">
                        <div style="font-weight:600;">${art.title}</div>
                        <div style="color:var(--accent);">${statusLabel}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
    }
}

// 구매한 작품 목록
async function loadMyPurchases() {
    if (!currentUser) return;
    const container = document.getElementById('my-art-collection');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        const arts = await db.collection('artworks')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('soldAt', 'desc').limit(20).get();
        
        if (arts.empty) {
            container.innerHTML = '<p style="color:var(--accent);">구매한 작품이 없습니다</p>';
            return;
        }
        
        let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:0.5rem;">';
        arts.forEach(doc => {
            const art = doc.data();
            html += `
                <div onclick="viewArtwork('${doc.id}')" style="background:var(--bg); border-radius:8px; overflow:hidden; cursor:pointer;">
                    <img src="${art.imageData}" style="width:100%; height:100px; object-fit:cover;">
                    <div style="padding:0.4rem; font-size:0.75rem;">
                        <div style="font-weight:600;">${art.title}</div>
                        <div style="color:var(--accent);">🎨 ${art.artistNickname || '익명'}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
    }
}

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

async function loadMallProducts() {
    const container = document.getElementById('mall-products');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const brandFilter = window._mallBrandFilter || null;
        let query = db.collection('products').where('status', '==', 'active');
        if (brandFilter) query = query.where('category', '==', brandFilter);
        const docs = await query.orderBy('createdAt', 'desc').limit(30).get();
        if (docs.empty) { container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 상품이 없습니다</p>'; return; }
        container.innerHTML = '';
        docs.forEach(d => {
            const p = d.data();
            container.innerHTML += `
                <div onclick="viewProduct('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    <div style="height:140px; overflow:hidden; background:#f0f0f0;"><img src="${p.imageData}" style="width:100%; height:100%; object-fit:cover;"></div>
                    <div style="padding:0.6rem;">
                        <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${MALL_CATEGORIES[p.category] || ''} · ${p.sellerNickname || '판매자'}</div>
                        <div style="font-weight:700; color:#0066cc; margin-top:0.3rem;">${p.price} ${p.priceToken}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">재고: ${p.stock - (p.sold||0)}개</div>
                    </div>
                </div>`;
        });
    } catch (e) { container.innerHTML = `<p style="color:red; grid-column:1/-1;">${e.message}</p>`; }
}

async function viewProduct(id) {
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) return;
    const p = doc.data(); const isOwner = currentUser?.uid === p.sellerId;
    const remaining = p.stock - (p.sold || 0);
    const modal = document.createElement('div');
    modal.id = 'product-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:white; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <img src="${p.imageData}" style="width:100%; border-radius:12px 12px 0 0; max-height:40vh; object-fit:contain; background:#f0f0f0;">
        <div style="padding:1.2rem;">
            <h3>${p.title}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.5rem 0;">${MALL_CATEGORIES[p.category]} · 판매자: ${p.sellerNickname || p.sellerEmail}</p>
            ${p.description ? `<p style="font-size:0.9rem; margin-bottom:1rem;">${p.description}</p>` : ''}
            <div style="font-size:1.2rem; font-weight:700; color:#0066cc; margin-bottom:0.5rem;">${p.price} ${p.priceToken}</div>
            <div style="font-size:0.85rem; color:var(--accent); margin-bottom:1rem;">재고: ${remaining}개</div>
            ${!isOwner && remaining > 0 ? `<button onclick="buyProduct('${id}')" style="background:#0066cc; color:white; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%;">🛒 구매하기</button>` : ''}
            ${remaining <= 0 ? '<p style="color:#cc0000; font-weight:700; text-align:center;">품절</p>' : ''}
        </div></div>`;
    document.body.appendChild(modal);
}

async function buyProduct(id) {
    if (!currentUser) return;
    try {
        const doc = await db.collection('products').doc(id).get();
        const p = doc.data();
        if ((p.stock - (p.sold||0)) <= 0) { alert('품절입니다'); return; }
        const tk = p.priceToken.toLowerCase();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal[tk]||0) < p.price) { alert(`${p.priceToken} 잔액 부족`); return; }
        if (!confirm(`"${p.title}"\n${p.price} ${p.priceToken}로 구매?`)) return;
        await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - p.price });
        const sellerW = await db.collection('users').doc(p.sellerId).collection('wallets').limit(1).get();
        if (!sellerW.empty) { const sb = sellerW.docs[0].data().balances||{}; await sellerW.docs[0].ref.update({ [`balances.${tk}`]: (sb[tk]||0) + p.price }); }
        await db.collection('products').doc(id).update({ sold: (p.sold||0) + 1 });
        await db.collection('orders').add({ productId:id, productTitle:p.title, buyerId:currentUser.uid, buyerEmail:currentUser.email, sellerId:p.sellerId, amount:p.price, token:p.priceToken, status:'paid', createdAt:new Date() });
        await distributeReferralReward(currentUser.uid, p.price, p.priceToken);
        alert(`🎉 "${p.title}" 구매 완료!`);
        document.getElementById('product-modal')?.remove();
        loadMallProducts(); loadUserWallet();
    } catch (e) { alert('구매 실패: ' + e.message); }
}

async function loadMyOrders() { const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try { const o = await db.collection('orders').where('buyerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
    if (o.empty) { c.innerHTML='<p style="color:var(--accent);">주문 내역 없음</p>'; return; }
    c.innerHTML=''; o.forEach(d => { const x=d.data(); c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;"><strong>${x.productTitle}</strong> — ${x.amount} ${x.token} <span style="color:var(--accent);">· ${x.status}</span></div>`; });
    } catch(e) { c.innerHTML=e.message; } }

async function loadMyProducts() { const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML='로딩...';
    try { const o = await db.collection('products').where('sellerId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get();
    if (o.empty) { c.innerHTML='<p style="color:var(--accent);">등록 상품 없음</p>'; return; }
    c.innerHTML=''; o.forEach(d => { const x=d.data(); c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;"><strong>${x.title}</strong> — ${x.price} ${x.priceToken} · 판매: ${x.sold||0}/${x.stock}</div>`; });
    } catch(e) { c.innerHTML=e.message; } }

// ========== FUNDRAISE - 모금/기부 ==========

async function createCampaign() {
    if (!currentUser) { alert('로그인 필요'); return; }
    const title = document.getElementById('fund-title').value.trim();
    const goal = parseFloat(document.getElementById('fund-goal').value);
    if (!title || !goal) { alert('제목과 목표 금액을 입력하세요'); return; }
    const imageFile = document.getElementById('fund-image').files[0];
    
    try {
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const days = parseInt(document.getElementById('fund-days').value) || 30;
        
        await db.collection('campaigns').add({
            title, description: document.getElementById('fund-desc').value.trim(),
            category: document.getElementById('fund-category').value,
            goal, raised: 0, token: document.getElementById('fund-token').value,
            backers: 0, imageData,
            creatorId: currentUser.uid, creatorEmail: currentUser.email,
            creatorNickname: userDoc.data()?.nickname || '',
            endDate: new Date(Date.now() + days * 86400000),
            status: 'active', createdAt: new Date()
        });
        
        alert(`💝 "${title}" 캠페인 시작!`);
        document.getElementById('fund-title').value = '';
        document.getElementById('fund-desc').value = '';
        loadCampaigns();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadCampaigns() {
    const c = document.getElementById('fund-campaigns');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('campaigns').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">캠페인이 없습니다. 첫 캠페인을 만들어보세요!</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => {
            const x = d.data();
            const pct = Math.min(100, Math.round((x.raised / x.goal) * 100));
            c.innerHTML += `
                <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:180px; object-fit:cover;">` : ''}
                    <div style="padding:1rem;">
                        <h4 style="margin-bottom:0.3rem;">${x.title}</h4>
                        <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.8rem;">${x.creatorNickname || x.creatorEmail} · ${x.backers}명 참여</p>
                        <div style="background:#e0e0e0; height:8px; border-radius:4px; margin-bottom:0.5rem;">
                            <div style="background:#4CAF50; height:100%; border-radius:4px; width:${pct}%;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                            <span style="font-weight:700;">${x.raised} / ${x.goal} ${x.token}</span>
                            <span style="color:var(--accent);">${pct}%</span>
                        </div>
                        <button onclick="donateCampaign('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.8rem; font-weight:700;">💝 기부하기</button>
                    </div>
                </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function donateCampaign(id) {
    const amount = parseFloat(prompt('기부 금액:'));
    if (!amount || amount <= 0) return;
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        const camp = doc.data();
        const tk = camp.token.toLowerCase();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal[tk]||0) < amount) { alert('잔액 부족'); return; }
        await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
        await db.collection('campaigns').doc(id).update({ raised: camp.raised + amount, backers: camp.backers + 1 });
        const creatorW = await db.collection('users').doc(camp.creatorId).collection('wallets').limit(1).get();
        if (!creatorW.empty) { const cb = creatorW.docs[0].data().balances||{}; await creatorW.docs[0].ref.update({ [`balances.${tk}`]: (cb[tk]||0) + amount }); }
        await db.collection('transactions').add({ from:currentUser.uid, to:camp.creatorId, amount, token:camp.token, type:'donation', campaignId:id, timestamp:new Date() });
        alert(`💝 ${amount} ${camp.token} 기부 완료!`);
        loadCampaigns(); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

// ========== ENERGY - 에너지 사업 ==========

async function loadEnergyProjects() {
    const c = document.getElementById('energy-projects');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('energy_projects').where('status','==','active').orderBy('createdAt','desc').limit(10).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">등록된 프로젝트가 없습니다. 관리자가 프로젝트를 등록할 수 있습니다.</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data(); const pct = Math.min(100, Math.round((x.invested / x.goal)*100));
            c.innerHTML += `<div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:0.8rem;">
                <h4>⚡ ${x.title}</h4><p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.location || ''} · ${x.capacity || ''}kW · 예상 수익률 ${x.returnRate || 0}%</p>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#ff9800; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${x.invested||0}/${x.goal} CRNY</span><span>${pct}%</span></div>
                <button onclick="investEnergy('${d.id}')" style="background:#ff9800; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">☀️ 투자하기</button>
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function investEnergy(id) {
    const amount = parseFloat(prompt('투자 금액 (CRNY):'));
    if (!amount || amount <= 0) return;
    try {
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal.crny||0) < amount) { alert('CRNY 잔액 부족'); return; }
        await wallets.docs[0].ref.update({ 'balances.crny': bal.crny - amount });
        const doc = await db.collection('energy_projects').doc(id).get();
        await db.collection('energy_projects').doc(id).update({ invested: (doc.data().invested||0) + amount, investors: (doc.data().investors||0) + 1 });
        await db.collection('energy_investments').add({ projectId:id, userId:currentUser.uid, amount, timestamp:new Date() });
        alert(`☀️ ${amount} CRNY 투자 완료!`); loadEnergyProjects(); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

// ========== BUSINESS - 크라우니 생태계 ==========

async function registerBusiness() {
    if (!currentUser) return;
    const name = document.getElementById('biz-name').value.trim();
    if (!name) { alert('사업체명을 입력하세요'); return; }
    try {
        const imageFile = document.getElementById('biz-image').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('businesses').add({
            name, description: document.getElementById('biz-desc').value.trim(),
            category: document.getElementById('biz-category').value,
            country: document.getElementById('biz-country').value.trim(),
            website: document.getElementById('biz-website').value.trim(),
            imageData, ownerId: currentUser.uid, ownerEmail: currentUser.email,
            ownerNickname: userDoc.data()?.nickname || '',
            rating: 0, reviews: 0, status: 'active', createdAt: new Date()
        });
        alert(`🏢 "${name}" 등록 완료!`);
        document.getElementById('biz-name').value = '';
        loadBusinessList();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadBusinessList() {
    const c = document.getElementById('business-list');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('businesses').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">등록된 사업체가 없습니다</p>'; return; }
        const BIZ_CATS = {retail:'🏪',food:'🍽️',service:'🔧',tech:'💻',education:'📖',health:'💊',logistics:'🚚',entertainment:'🎭',other:'🏢'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div style="background:white; padding:1rem; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08); display:flex; gap:1rem; align-items:center;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:70px; height:70px; border-radius:8px; object-fit:cover;">` : `<div style="width:70px; height:70px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${BIZ_CATS[x.category]||'🏢'}</div>`}
                <div style="flex:1;"><h4>${x.name}</h4><p style="font-size:0.8rem; color:var(--accent);">${BIZ_CATS[x.category]||''} · ${x.country||''} · ${x.ownerNickname||x.ownerEmail}</p>
                ${x.description ? `<p style="font-size:0.85rem; margin-top:0.3rem;">${x.description.slice(0,80)}${x.description.length>80?'...':''}</p>` : ''}
                ${x.website ? `<a href="${x.website}" target="_blank" style="font-size:0.8rem;">🔗 웹사이트</a>` : ''}</div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

// ========== ARTIST - 엔터테인먼트 ==========

async function registerArtist() {
    if (!currentUser) return;
    const name = document.getElementById('artist-name').value.trim();
    if (!name) { alert('아티스트명을 입력하세요'); return; }
    try {
        const imageFile = document.getElementById('artist-photo').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 400);
        await db.collection('artists').add({
            name, bio: document.getElementById('artist-bio').value.trim(),
            genre: document.getElementById('artist-genre').value,
            imageData, userId: currentUser.uid, email: currentUser.email,
            fans: 0, totalSupport: 0, status: 'active', createdAt: new Date()
        });
        alert(`🌟 "${name}" 등록 완료!`);
        document.getElementById('artist-name').value = '';
        loadArtistList();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadArtistList() {
    const c = document.getElementById('artist-list');
    if (!c) return; c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const docs = await db.collection('artists').where('status','==','active').orderBy('fans','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 아티스트가 없습니다</p>'; return; }
        const GENRES = {music:'🎵',dance:'💃',acting:'🎬',comedy:'😂',creator:'📹',model:'📷',dj:'🎧',other:'🌟'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div style="background:white; border-radius:10px; overflow:hidden; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:160px; overflow:hidden; background:linear-gradient(135deg,#9C27B0,#E91E63);">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:white;">${GENRES[x.genre]||'🌟'}</div>`}</div>
                <div style="padding:0.6rem;"><div style="font-weight:700;">${x.name}</div>
                <div style="font-size:0.75rem; color:var(--accent);">${GENRES[x.genre]||''} · 팬 ${x.fans}명</div>
                <button onclick="supportArtist('${d.id}')" style="background:#E91E63; color:white; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; margin-top:0.4rem; font-size:0.8rem;">💖 후원</button>
                </div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function supportArtist(id) {
    const amount = parseFloat(prompt('후원 금액 (CRNY):'));
    if (!amount || amount <= 0) return;
    try {
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal.crny||0) < amount) { alert('CRNY 잔액 부족'); return; }
        await wallets.docs[0].ref.update({ 'balances.crny': bal.crny - amount });
        const doc = await db.collection('artists').doc(id).get(); const artist = doc.data();
        const artistW = await db.collection('users').doc(artist.userId).collection('wallets').limit(1).get();
        if (!artistW.empty) { const ab = artistW.docs[0].data().balances||{}; await artistW.docs[0].ref.update({ 'balances.crny': (ab.crny||0) + amount }); }
        await db.collection('artists').doc(id).update({ totalSupport: (artist.totalSupport||0) + amount, fans: (artist.fans||0) + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:artist.userId, amount, token:'CRNY', type:'artist_support', artistId:id, timestamp:new Date() });
        alert(`💖 ${artist.name}에게 ${amount} CRNY 후원!`); loadArtistList(); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

// ========== BOOKS - 출판 ==========

async function registerBook() {
    if (!currentUser) return;
    const title = document.getElementById('book-title').value.trim();
    const price = parseFloat(document.getElementById('book-price').value);
    if (!title) { alert('책 제목을 입력하세요'); return; }
    try {
        const coverFile = document.getElementById('book-cover').files[0];
        let imageData = '';
        if (coverFile) imageData = await fileToBase64Resized(coverFile, 400);
        await db.collection('books').add({
            title, author: document.getElementById('book-author').value.trim(),
            description: document.getElementById('book-desc').value.trim(),
            genre: document.getElementById('book-genre').value,
            price: price || 0, priceToken: document.getElementById('book-token').value,
            imageData, publisherId: currentUser.uid, publisherEmail: currentUser.email,
            sold: 0, rating: 0, reviews: 0, status: 'active', createdAt: new Date()
        });
        alert(`📚 "${title}" 등록 완료!`);
        document.getElementById('book-title').value = '';
        loadBooksList();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadBooksList() {
    const c = document.getElementById('books-list');
    if (!c) return; c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">로딩...</p>';
    try {
        const docs = await db.collection('books').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">등록된 책이 없습니다</p>'; return; }
        const GENRES = {novel:'📕',essay:'📗',selfhelp:'📘',business:'📙',tech:'💻',poetry:'🖋️',children:'🧒',comic:'📒',other:'📚'};
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data();
            c.innerHTML += `<div onclick="buyBook('${d.id}')" style="background:white; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:180px; overflow:hidden; background:#f5f0e8;">
                ${x.imageData ? `<img src="${x.imageData}" style="width:100%; height:100%; object-fit:contain;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem;">${GENRES[x.genre]||'📚'}</div>`}</div>
                <div style="padding:0.5rem;"><div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.title}</div>
                <div style="font-size:0.7rem; color:var(--accent);">${x.author||'저자 미상'}</div>
                <div style="font-weight:700; color:#0066cc; font-size:0.85rem; margin-top:0.2rem;">${x.price>0 ? x.price+' '+x.priceToken : '무료'}</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function buyBook(id) {
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return; const b = doc.data();
    if (b.publisherId === currentUser?.uid) { alert('본인 책입니다'); return; }
    if (b.price <= 0) { alert(`📖 "${b.title}" — 무료 열람!`); return; }
    const tk = b.priceToken.toLowerCase();
    const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
    const bal = wallets.docs[0]?.data()?.balances || {};
    if ((bal[tk]||0) < b.price) { alert('잔액 부족'); return; }
    if (!confirm(`"${b.title}"\n${b.price} ${b.priceToken}로 구매?`)) return;
    try {
        await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - b.price });
        const pubW = await db.collection('users').doc(b.publisherId).collection('wallets').limit(1).get();
        if (!pubW.empty) { const pb = pubW.docs[0].data().balances||{}; await pubW.docs[0].ref.update({ [`balances.${tk}`]: (pb[tk]||0) + b.price }); }
        await db.collection('books').doc(id).update({ sold: (b.sold||0) + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:b.publisherId, amount:b.price, token:b.priceToken, type:'book_purchase', bookId:id, timestamp:new Date() });
        await distributeReferralReward(currentUser.uid, b.price, b.priceToken);
        alert(`📖 "${b.title}" 구매 완료!`); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

// ========== CREDIT - P2P 크레딧 ==========

function showCreditTab(tab) {
    document.querySelectorAll('.credit-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.credit-tab').forEach(t => {
        t.style.background = 'white'; t.style.color = 'var(--text)'; t.style.borderColor = 'var(--border)';
    });
    document.getElementById(`credit-${tab}`).style.display = 'block';
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; btn.style.borderColor = 'var(--primary)'; }
}

// 환전 (수수료 0%)
// swapTokens() → 위 오프체인 섹션으로 통합 이동됨

// 품앗이 요청 (무이자 P2P)
async function requestPumasi() {
    if (!currentUser) return;
    const amount = parseFloat(document.getElementById('pumasi-amount').value);
    const reason = document.getElementById('pumasi-reason').value.trim();
    const days = parseInt(document.getElementById('pumasi-days').value) || 30;
    if (!amount || !reason) { alert('금액과 사유를 입력하세요'); return; }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('pumasi_requests').add({
            requesterId: currentUser.uid, requesterEmail: currentUser.email,
            requesterNickname: userDoc.data()?.nickname || '',
            amount, reason, days, interest: 0,
            raised: 0, backers: 0,
            dueDate: new Date(Date.now() + days * 86400000),
            status: 'active', createdAt: new Date()
        });
        alert(`🤝 품앗이 ${amount} CRNY 요청 완료!\n공동체에 공유됩니다.`);
        loadPumasiList();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadPumasiList() {
    const c = document.getElementById('pumasi-list');
    if (!c) return; c.innerHTML = '로딩...';
    try {
        const docs = await db.collection('pumasi_requests').where('status','==','active').orderBy('createdAt','desc').limit(20).get();
        if (docs.empty) { c.innerHTML = '<p style="color:var(--accent);">요청이 없습니다</p>'; return; }
        c.innerHTML = '';
        docs.forEach(d => { const x = d.data(); const pct = Math.min(100, Math.round((x.raised/x.amount)*100));
            c.innerHTML += `<div style="background:white; padding:1rem; border-radius:8px; margin-bottom:0.5rem;">
                <div style="display:flex; justify-content:space-between;"><strong>${x.requesterNickname || x.requesterEmail}</strong><span style="color:#0066cc; font-weight:700;">${x.amount} CRNY</span></div>
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.reason}</p>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:#4CAF50; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${x.raised}/${x.amount} · ${x.backers}명</span><span style="color:#4CAF50;">이자 0%</span></div>
                ${x.requesterId !== currentUser?.uid ? `<button onclick="contributePumasi('${d.id}')" style="background:#4CAF50; color:white; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; width:100%; margin-top:0.5rem;">🤝 도와주기</button>` : ''}
            </div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function contributePumasi(id) {
    const amount = parseFloat(prompt('도와줄 금액 (CRNY):'));
    if (!amount || amount <= 0) return;
    try {
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal.crny||0) < amount) { alert('CRNY 잔액 부족'); return; }
        await wallets.docs[0].ref.update({ 'balances.crny': bal.crny - amount });
        const doc = await db.collection('pumasi_requests').doc(id).get(); const req = doc.data();
        // 요청자에게 지급
        const reqW = await db.collection('users').doc(req.requesterId).collection('wallets').limit(1).get();
        if (!reqW.empty) { const rb = reqW.docs[0].data().balances||{}; await reqW.docs[0].ref.update({ 'balances.crny': (rb.crny||0) + amount }); }
        await db.collection('pumasi_requests').doc(id).update({ raised: req.raised + amount, backers: req.backers + 1 });
        await db.collection('transactions').add({ from:currentUser.uid, to:req.requesterId, amount, token:'CRNY', type:'pumasi', pumasiId:id, timestamp:new Date() });
        alert(`🤝 ${amount} CRNY 도움 완료!`); loadPumasiList(); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

// 보험 신청
async function requestInsurance() {
    if (!currentUser) return;
    const type = document.getElementById('insurance-type').value;
    const amount = parseFloat(document.getElementById('insurance-amount').value);
    const reason = document.getElementById('insurance-reason').value.trim();
    if (!amount || !reason) { alert('금액과 사유를 입력하세요'); return; }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        await db.collection('insurance_requests').add({
            requesterId: currentUser.uid, requesterEmail: currentUser.email,
            requesterNickname: userDoc.data()?.nickname || '',
            type, amount, reason,
            status: 'pending', // 중간 관리자 승인 필요
            approvedBy: null, funded: 0,
            createdAt: new Date()
        });
        alert(`🛡️ 보험 신청 완료!\n중간 관리자의 검토 후 승인됩니다.`);
    } catch (e) { alert('실패: ' + e.message); }
}

// 기부
async function quickDonate() {
    if (!currentUser) return;
    const amount = parseFloat(document.getElementById('donate-amount').value);
    const token = document.getElementById('donate-token-type').value;
    const target = document.getElementById('donate-target').value;
    if (!amount || amount < 1) { alert('최소 1 이상 기부해주세요'); return; }
    
    try {
        const tk = token.toLowerCase();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        if ((bal[tk]||0) < amount) { alert(`${token} 잔액 부족`); return; }
        await wallets.docs[0].ref.update({ [`balances.${tk}`]: bal[tk] - amount });
        
        const donation = {
            donorId: currentUser.uid, donorEmail: currentUser.email,
            amount, token, targetType: target,
            timestamp: new Date()
        };
        
        if (target === 'designated') {
            const targetEmail = document.getElementById('donate-target-email').value.trim();
            if (targetEmail) {
                donation.targetEmail = targetEmail;
                const targetUsers = await db.collection('users').where('email','==',targetEmail).get();
                if (!targetUsers.empty) {
                    const tW = await db.collection('users').doc(targetUsers.docs[0].id).collection('wallets').limit(1).get();
                    if (!tW.empty) { const tb = tW.docs[0].data().balances||{}; await tW.docs[0].ref.update({ [`balances.${tk}`]: (tb[tk]||0) + amount }); }
                }
            }
        }
        
        await db.collection('donations').add(donation);
        alert(`💝 ${amount} ${token} 기부 완료!`); loadUserWallet();
    } catch (e) { alert('실패: ' + e.message); }
}

async function loadCreditInfo() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const data = userDoc.data();
        const wallets = await db.collection('users').doc(currentUser.uid).collection('wallets').limit(1).get();
        const bal = wallets.docs[0]?.data()?.balances || {};
        const crnyHeld = bal.crny || 0;
        const score = Math.min(850, 300 + crnyHeld * 10 + (data.referralCount || 0) * 20);
        
        const scoreEl = document.getElementById('credit-score');
        if (scoreEl) { scoreEl.textContent = score; scoreEl.style.color = score >= 700 ? '#4CAF50' : score >= 500 ? '#ff9800' : '#cc0000'; }
        
        const loans = await db.collection('pumasi_requests').where('requesterId','==',currentUser.uid).where('status','==','active').get();
        const loansEl = document.getElementById('active-loans');
        if (loansEl) loansEl.textContent = `${loans.size}건`;
        
        // 총 기부
        const donations = await db.collection('donations').where('donorId','==',currentUser.uid).get();
        let totalDonated = 0;
        donations.forEach(d => totalDonated += d.data().amount || 0);
        const donatedEl = document.getElementById('total-donated');
        if (donatedEl) donatedEl.textContent = totalDonated;
    } catch (e) { console.error(e); }
}

// 몰 브랜드 필터
function filterMallBrand(brand) {
    // product-category 셀렉트를 해당 브랜드로 설정하고 로드
    const sel = document.getElementById('product-category');
    if (sel) sel.value = brand;
    
    // mall-filter용 별도 처리
    window._mallBrandFilter = brand;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

// ========== REAL-TIME CRYPTO TRADING ==========
let currentPrice = 0;
let priceWs = null;
let myParticipation = null;

async function loadTradingDashboard() {
    console.log('🔍 loadTradingDashboard 시작, user:', currentUser?.uid);
    // Check if user has active participation
    try {
        const challenges = await db.collection('prop_challenges')
            .where('status', '==', 'active')
            .get();
        
        console.log('🔍 활성 챌린지:', challenges.size, '개');
        
        for (const challengeDoc of challenges.docs) {
            // 복합 인덱스 없이도 작동하도록 단일 필드 쿼리
            const participants = await challengeDoc.ref.collection('participants')
                .where('userId', '==', currentUser.uid)
                .get();
            
            console.log('🔍 챌린지', challengeDoc.id, '참가자:', participants.size, '명');
            
            // 클라이언트에서 status 필터
            const activeParticipant = participants.docs.find(d => d.data().status === 'active');
            
            if (activeParticipant) {
                myParticipation = { 
                    challengeId: challengeDoc.id,
                    participantId: activeParticipant.id,
                    ...activeParticipant.data() 
                };
                console.log('✅ myParticipation 설정됨:', myParticipation.participantId);
                break;
            }
        }
    } catch (error) {
        console.error('❌ loadTradingDashboard error:', error);
    }
    
    if (myParticipation) {
        document.getElementById('trading-dashboard').style.display = 'block';
        
        // 규칙 동적 표시
        const p = myParticipation;
        const productText = p.allowedProduct === 'MNQ' ? 'MNQ (마이크로)' :
                            p.allowedProduct === 'NQ' ? 'NQ (미니)' : 'MNQ + NQ';
        const rulesEl = document.getElementById('prop-rules-display');
        if (rulesEl) {
            rulesEl.innerHTML = `
                <p><strong>💰 계좌:</strong> $${(p.initialBalance || 100000).toLocaleString()} USD (가상)</p>
                <p><strong>📊 거래 가능:</strong> ${productText} 최대 ${p.maxContracts || 1}계약</p>
                <p><strong>📈 최대 포지션:</strong> ${p.maxPositions || 5}개 동시 운영</p>
                <p><strong>🔴 일일 한도:</strong> -$${p.dailyLossLimit || 100} 손실 시 당일 거래 중단</p>
                <p><strong>💀 청산:</strong> -$${(p.maxDrawdown || 2000).toLocaleString()} 손실 시 자동 청산</p>
                <p><strong>⏰ 정산:</strong> ${p.settlement || 'EOD'}</p>
                <p><strong>💎 상금:</strong> ${p.rewardToken || 'CRFN'} 토큰</p>
            `;
        }
        
        checkDailyReset();
        updateSlotStatusUI();
        updateRiskGaugeUI();
        updateTradingUI();
        
        // display:block 후 DOM이 레이아웃을 잡도록 딜레이
        setTimeout(() => {
            initTradingViewChart();
            connectPriceWebSocket();
        }, 100);
    } else {
        document.getElementById('trading-dashboard').style.display = 'none';
        // 규칙 기본 표시
        const rulesEl = document.getElementById('prop-rules-display');
        if (rulesEl) {
            rulesEl.innerHTML = '<p>아래 챌린지에 참가하면 규칙이 표시됩니다.</p>';
        }
    }
}

function updateTradingUI() {
    if (!myParticipation) return;
    
    const balance = myParticipation.currentBalance || 100000;
    const initial = myParticipation.initialBalance || 100000;
    const profit = ((balance - initial) / initial * 100).toFixed(2);
    const positions = myParticipation.trades?.filter(t => t.status === 'open').length || 0;
    
    document.getElementById('trading-balance').textContent = `$${balance.toLocaleString()}`;
    document.getElementById('trading-profit').textContent = `${profit >= 0 ? '+' : ''}${profit}%`;
    document.getElementById('trading-profit').style.color = profit >= 0 ? '#0066cc' : '#cc0000';
    document.getElementById('trading-positions').textContent = positions;
}

// ========================================
// 실시간 캔들차트 + 탭 시스템
// ========================================
const PRICE_SERVER = 'https://web-production-26db6.up.railway.app';
const POLL_INTERVAL = 1000;

const TIMEZONES = {
    'US': { label: '🇺🇸 뉴욕 (ET)', zone: 'America/New_York' },
    'KR': { label: '🇰🇷 서울 (KST)', zone: 'Asia/Seoul' },
    'JP': { label: '🇯🇵 도쿄 (JST)', zone: 'Asia/Tokyo' },
    'UK': { label: '🇬🇧 런던 (GMT)', zone: 'Europe/London' },
    'UTC': { label: '🌐 UTC', zone: 'UTC' }
};
let selectedTimezone = 'KR';

window.liveTicks = [];
window.liveChart = null;
window.liveCandleSeries = null;
window.liveEntryLine = null;

// ===== 차트 탭 시스템 =====
let chartTabs = [];
let activeTabId = 1;

function getDefaultTabs() {
    return [
        { id: 1, symbol: 'MNQ', chartType: 'time', interval: 60, tickCount: 100 },
        { id: 2, symbol: 'NQ', chartType: 'time', interval: 60, tickCount: 100 },
        { id: 3, symbol: 'MNQ', chartType: 'tick', interval: 60, tickCount: 100 },
    ];
}
function loadChartTabs() {
    try {
        const saved = localStorage.getItem('crowny_chart_tabs');
        chartTabs = saved ? JSON.parse(saved) : getDefaultTabs();
        if (!chartTabs.length) chartTabs = getDefaultTabs();
        activeTabId = parseInt(localStorage.getItem('crowny_active_tab')) || chartTabs[0]?.id || 1;
        if (!chartTabs.find(t => t.id === activeTabId)) activeTabId = chartTabs[0]?.id || 1;
    } catch (e) { chartTabs = getDefaultTabs(); activeTabId = 1; }
}
function saveChartTabs() {
    try {
        localStorage.setItem('crowny_chart_tabs', JSON.stringify(chartTabs));
        localStorage.setItem('crowny_active_tab', String(activeTabId));
    } catch (e) {}
}
function getActiveTab() { return chartTabs.find(t => t.id === activeTabId) || chartTabs[0]; }
function getActiveTabSymbol() { return (getActiveTab() || {}).symbol || 'MNQ'; }
function getCurrentInterval() { const t = getActiveTab(); return t?.chartType === 'time' ? (t.interval || 60) : 60; }

function renderChartTabs() {
    const bar = document.getElementById('chart-tab-bar');
    if (!bar) return;
    bar.innerHTML = '';
    chartTabs.forEach(tab => {
        const active = tab.id === activeTabId;
        const btn = document.createElement('button');
        btn.style.cssText = `background:${active?'#0066cc':'#16213e'}; color:${active?'#fff':'#888'}; border:1px solid ${active?'#0066cc':'#333'}; border-radius:4px; padding:5px 10px; font-size:0.72rem; cursor:pointer; white-space:nowrap; font-weight:${active?'700':'400'};`;
        const icon = tab.chartType === 'tick' ? '📊' : '⏱';
        const label = tab.chartType === 'tick' ? `${tab.tickCount}T` : `${(tab.interval||60)/60}분`;
        btn.textContent = `${tab.symbol} ${icon}${label}`;
        btn.onclick = () => switchChartTab(tab.id);
        btn.ondblclick = (e) => { e.stopPropagation(); if (chartTabs.length>1 && confirm(`"${btn.textContent}" 삭제?`)) removeChartTab(tab.id); };
        bar.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.style.cssText = 'background:#16213e; color:#00ff88; border:1px solid #333; border-radius:4px; padding:5px 8px; font-size:0.8rem; cursor:pointer;';
    addBtn.textContent = '+';
    addBtn.onclick = addChartTab;
    bar.appendChild(addBtn);
}

function switchChartTab(tabId) {
    activeTabId = tabId;
    const tab = getActiveTab();
    if (!tab) return;
    const symEl = document.getElementById('tab-symbol');
    const typeEl = document.getElementById('tab-chart-type');
    const intEl = document.getElementById('tab-interval');
    const tickEl = document.getElementById('tab-tick-count');
    if (symEl) symEl.value = tab.symbol;
    if (typeEl) typeEl.value = tab.chartType;
    if (intEl) { intEl.value = tab.interval || 60; intEl.style.display = tab.chartType==='time' ? '' : 'none'; }
    if (tickEl) { tickEl.value = tab.tickCount || 100; tickEl.style.display = tab.chartType==='tick' ? '' : 'none'; }
    // 하단 거래폼 동기화
    const fc = document.getElementById('futures-contract');
    if (fc) { fc.value = tab.symbol; if (typeof updateContractSpecs === 'function') updateContractSpecs(); }
    updateChartLabel();
    renderChartTabs();
    saveChartTabs();
    reloadChartData();
    drawPositionLinesLW();
}

function addChartTab() {
    if (chartTabs.length >= 8) { alert('최대 8개'); return; }
    const maxId = chartTabs.reduce((m, t) => Math.max(m, t.id), 0);
    const newTab = { id: maxId+1, symbol: 'MNQ', chartType: 'time', interval: 60, tickCount: 100 };
    chartTabs.push(newTab);
    switchChartTab(newTab.id);
}

function removeChartTab(tabId) {
    chartTabs = chartTabs.filter(t => t.id !== tabId);
    if (activeTabId === tabId) activeTabId = chartTabs[0]?.id || 1;
    renderChartTabs();
    switchChartTab(activeTabId);
}

function updateTabSetting(field) {
    const tab = getActiveTab();
    if (!tab) return;
    switch(field) {
        case 'symbol':
            tab.symbol = document.getElementById('tab-symbol').value;
            // 하단 거래폼도 동기화
            const fc = document.getElementById('futures-contract');
            if (fc) { fc.value = tab.symbol; if (typeof updateContractSpecs === 'function') updateContractSpecs(); }
            break;
        case 'chartType':
            tab.chartType = document.getElementById('tab-chart-type').value;
            document.getElementById('tab-interval').style.display = tab.chartType==='time' ? '' : 'none';
            document.getElementById('tab-tick-count').style.display = tab.chartType==='tick' ? '' : 'none';
            break;
        case 'interval': tab.interval = parseInt(document.getElementById('tab-interval').value)||60; break;
        case 'tickCount': tab.tickCount = parseInt(document.getElementById('tab-tick-count').value)||100; break;
    }
    updateChartLabel(); renderChartTabs(); saveChartTabs();
    if (field === 'symbol' || field === 'chartType') {
        reloadChartData();
    } else {
        updateLiveCandleChart();
    }
}

function updateChartLabel() {
    const tab = getActiveTab();
    if (!tab) return;
    const label = document.getElementById('chart-symbol-label');
    const mul = tab.symbol==='NQ' ? '$20' : '$2';
    if (label) {
        if (tab.chartType === 'time') {
            label.textContent = `${tab.symbol} ${(tab.interval||60)/60}분봉 (×${mul})`;
        } else {
            label.textContent = `${tab.symbol} ${tab.tickCount||100}틱차트 (×${mul})`;
        }
    }
}

// 틱 기반 캔들 (N틱마다 1봉, 거래량 포함)
function aggregateTicksToTickCandles(ticks, ticksPerCandle) {
    if (!ticks.length || ticksPerCandle < 1) return [];
    const candles = [];
    let cur = null, cnt = 0;
    for (const tick of ticks) {
        if (!cur || cnt >= ticksPerCandle) {
            if (cur) candles.push(cur);
            cur = { time: tick.time, open: tick.price, high: tick.price, low: tick.price, close: tick.price, _tickCount: 1, _volume: tick.volume || 1 };
            cnt = 1;
        } else {
            cur.high = Math.max(cur.high, tick.price);
            cur.low = Math.min(cur.low, tick.price);
            cur.close = tick.price;
            cur._tickCount++; cur._volume = (cur._volume||0) + (tick.volume||1); cur.time = tick.time; cnt++;
        }
    }
    if (cur) candles.push(cur);
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].time <= candles[i-1].time) candles[i].time = candles[i-1].time + 1;
    }
    return candles;
}

async function initTradingViewChart() {
    console.log('📊 initTradingViewChart 호출됨');
    const container = document.getElementById('live-candle-chart');
    if (!container) { console.error('❌ 차트 컨테이너 없음'); return; }
    
    // 탭 시스템 초기화
    loadChartTabs();
    renderChartTabs();
    // UI 동기화
    const tab = getActiveTab();
    if (tab) {
        const symEl = document.getElementById('tab-symbol');
        const typeEl = document.getElementById('tab-chart-type');
        const intEl = document.getElementById('tab-interval');
        const tickEl = document.getElementById('tab-tick-count');
        if (symEl) symEl.value = tab.symbol;
        if (typeEl) typeEl.value = tab.chartType;
        if (intEl) { intEl.value = tab.interval||60; intEl.style.display = tab.chartType==='time'?'':'none'; }
        if (tickEl) { tickEl.value = tab.tickCount||100; tickEl.style.display = tab.chartType==='tick'?'':'none'; }
        updateChartLabel();
    }
    
    container.innerHTML = '';
    
    try {
        const chartHeight = window.innerWidth < 768 ? 400 : 500;
        const tzOffset = getTimezoneOffsetSeconds(selectedTimezone);
        
        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: chartHeight,
            layout: { background: { color: '#0a0a0a' }, textColor: '#999', fontFamily: "'Consolas','Monaco',monospace", fontSize: 11 },
            grid: { vertLines: { color: '#1a1a2a', style: 1 }, horzLines: { color: '#1a1a2a', style: 1 } },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: '#ffffff44', width: 1, style: 2, labelBackgroundColor: '#333' },
                horzLine: { color: '#ffffff44', width: 1, style: 2, labelBackgroundColor: '#0066cc' },
            },
            rightPriceScale: { borderColor: '#333', scaleMargins: { top: 0.05, bottom: 0.15 }, autoScale: true },
            timeScale: {
                borderColor: '#333', timeVisible: true, secondsVisible: false,
                barSpacing: 6, minBarSpacing: 3, rightOffset: 5,
                tickMarkFormatter: (time) => {
                    const d = new Date((time + tzOffset) * 1000);
                    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                },
            },
            localization: {
                timeFormatter: (time) => {
                    const d = new Date((time + tzOffset) * 1000);
                    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                },
            },
        });
        
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a', priceFormat: { type: 'volume' },
            priceScaleId: 'volume', scaleMargins: { top: 0.85, bottom: 0 },
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, drawTicks: false, borderVisible: false });
        window.volumeSeries = volumeSeries;
        
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#0066cc', downColor: '#cc0000',
            borderUpColor: '#0066cc', borderDownColor: '#cc0000',
            wickUpColor: '#0066cc', wickDownColor: '#cc0000',
        });
        
        window.liveChart = chart;
        window.liveCandleSeries = candleSeries;
        window.candleSeries = candleSeries;
        window.lwChart = chart;
        
        // MA 라인
        window.ma1Series = chart.addLineSeries({ color: '#ffeb3b', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: true, title: 'MA5' });
        window.ma2Series = chart.addLineSeries({ color: '#00bcd4', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: true, title: 'MA20' });
        window.ma3Series = chart.addLineSeries({ color: '#e040fb', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: true, title: 'MA60' });
        
        window.addEventListener('resize', () => { chart.applyOptions({ width: container.clientWidth }); });
        
        console.log('📊 통합 차트 준비 완료');
        loadMASettings();
        setTimeout(() => applyMASettings(), 500);
        startClockTimer();
        startLiveDataFeed();
        
        return chart;
    } catch (error) {
        console.error('❌ 차트 로드 실패:', error);
        container.innerHTML = '<p style="text-align:center; padding:2rem; color:#ff4444;">차트 로드 실패</p>';
    }
}

// 타임존 오프셋 (초 단위)
function getTimezoneOffsetSeconds(tzKey) {
    const tz = TIMEZONES[tzKey]?.zone || 'Asia/Seoul';
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const diff = (new Date(tzStr) - new Date(utcStr)) / 1000;
    return diff;
}

// 타임존 변경
function changeTimezone(tzKey) {
    selectedTimezone = tzKey;
    // 차트 재생성
    if (window.liveChart) {
        initTradingViewChart();
    }
    updateLiveClockDisplay();
}

// 현재 시간 표시 업데이트
function updateLiveClockDisplay() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    const tz = TIMEZONES[selectedTimezone];
    const now = new Date();
    const timeStr = now.toLocaleString('ko-KR', { 
        timeZone: tz.zone,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    const dateStr = now.toLocaleString('ko-KR', {
        timeZone: tz.zone,
        month: '2-digit', day: '2-digit',
        weekday: 'short'
    });
    
    clockEl.innerHTML = `<span style="color:#00ff88; font-weight:700;">${timeStr}</span> <span style="color:#888; font-size:0.65rem;">${dateStr} ${tz.label}</span>`;
}

// 차트 자동 정렬 (최신 캔들로 스크롤)
function scrollToLatest() {
    if (window.liveChart) window.liveChart.timeScale().scrollToRealTime();
}

// 시간 타이머 시작
function startClockTimer() {
    if (window.clockInterval) clearInterval(window.clockInterval);
    updateLiveClockDisplay();
    window.clockInterval = setInterval(updateLiveClockDisplay, 1000);
}

// 실시간 데이터 수신
function startLiveDataFeed() {
    if (window.liveDataInterval) clearInterval(window.liveDataInterval);
    reloadChartData().then(() => {
        fetchLiveTick();
        window.liveDataInterval = setInterval(fetchLiveTick, POLL_INTERVAL);
        console.log('✅ 실시간 데이터 수신 시작');
    });
}

// ★ 심볼 전환 시 데이터 재로드
async function reloadChartData() {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.chartType === 'tick') {
        await loadTickData(tab.symbol);
    } else {
        await loadCandleHistory(tab.symbol);
    }
}

// 서버에서 1분 캔들 히스토리 로드 (심볼별)
async function loadCandleHistory(symbol) {
    try {
        symbol = symbol || getActiveTabSymbol();
        console.log(`📊 ${symbol} 캔들 히스토리 로딩...`);
        const res = await fetch(`${PRICE_SERVER}/api/market/candles?symbol=${symbol}&limit=1440`);
        const data = await res.json();
        
        if (data && data.candles && data.candles.length > 0) {
            window.liveTicks = [];
            for (const candle of data.candles) {
                const t = candle.time;
                const vol = candle.volume || candle.tick_count || 1;
                window.liveTicks.push({ time: t, price: candle.open, volume: Math.ceil(vol * 0.25) });
                if (candle.high !== candle.open) {
                    window.liveTicks.push({ time: t + 15, price: candle.high, volume: Math.ceil(vol * 0.25) });
                }
                if (candle.low !== candle.high) {
                    window.liveTicks.push({ time: t + 30, price: candle.low, volume: Math.ceil(vol * 0.25) });
                }
                window.liveTicks.push({ time: t + 59, price: candle.close, volume: Math.ceil(vol * 0.25) });
            }
            updateLiveCandleChart();
            scrollToLatest();
            console.log(`✅ ${symbol} ${data.count}개 캔들 로드`);
        }
    } catch (err) {
        console.warn('⚠️ 캔들 히스토리 로드 실패:', err.message);
    }
}

// ★ 서버에서 틱 데이터 로드 (틱차트용, 가격+거래량)
async function loadTickData(symbol) {
    try {
        symbol = symbol || getActiveTabSymbol();
        console.log(`📊 ${symbol} 틱 데이터 로딩...`);
        const res = await fetch(`${PRICE_SERVER}/api/market/ticks?symbol=${symbol}&limit=5000`);
        const data = await res.json();
        if (data && data.ticks && data.ticks.length > 0) {
            window.liveTicks = data.ticks.map(t => ({ time: t.time, price: t.price, volume: t.volume || 1 }));
            updateLiveCandleChart();
            scrollToLatest();
            console.log(`✅ ${symbol} ${data.count}개 틱 로드`);
        }
    } catch (err) {
        console.warn('⚠️ 틱 데이터 로드 실패:', err.message);
    }
}

async function fetchLiveTick() {
    try {
        const res = await fetch(`${PRICE_SERVER}/api/market/live`);
        const data = await res.json();
        
        if (!data || !data.price || data.price < 1000) return;
        
        const now = Math.floor(Date.now() / 1000);
        
        // 클라이언트 스파이크 필터
        if (window.liveTicks.length > 0) {
            const lastPrice = window.liveTicks[window.liveTicks.length - 1].price;
            const diff = Math.abs(data.price - lastPrice);
            if (diff > 30) {
                console.warn(`⚠️ 스파이크 필터: ${lastPrice} → ${data.price}`);
                return;
            }
        }
        
        // NQ/MNQ 개별 가격 저장
        if (data.nq_price) window._nqPrice = data.nq_price;
        if (data.mnq_price) window._mnqPrice = data.mnq_price;
        
        // 틱 저장 (볼륨 포함)
        window.liveTicks.push({
            time: now,
            price: data.price,
            bid: data.bid,
            ask: data.ask,
            volume: data.volume || 1,
        });
        
        if (window.liveTicks.length > 86400) window.liveTicks.shift();
        
        currentPrice = data.price;
        
        updateLivePriceDisplay(data);
        updateLiveCandleChart();
        updateNQPriceDisplay();
        updateOpenPositions();
        updateLivePnL();
        updateLiveStatus(true);
        
    } catch (err) {
        console.error('⚠️ 데이터 수신 실패:', err);
        updateLiveStatus(false);
    }
}

// 가격 표시 업데이트
function updateLivePriceDisplay(data) {
    const priceEl = document.getElementById('live-price');
    const bidEl = document.getElementById('live-bid');
    const askEl = document.getElementById('live-ask');
    const spreadEl = document.getElementById('live-spread');
    
    if (!priceEl) return;
    
    priceEl.textContent = data.price.toFixed(2);
    
    // 가격 색상 (이전 대비)
    if (window.liveTicks.length >= 2) {
        const prev = window.liveTicks[window.liveTicks.length - 2].price;
        priceEl.style.color = data.price > prev ? '#00ff88' : data.price < prev ? '#ff4444' : '#00ff88';
    }
    
    if (bidEl) bidEl.textContent = data.bid ? data.bid.toFixed(2) : '--';
    if (askEl) askEl.textContent = data.ask ? data.ask.toFixed(2) : '--';
    
    if (spreadEl && data.bid && data.ask) {
        spreadEl.textContent = (data.ask - data.bid).toFixed(2);
    }
}

// 탭 설정에 따라 캔들 생성 + 차트 업데이트
function updateLiveCandleChart() {
    if (!window.liveCandleSeries || window.liveTicks.length < 2) return;
    
    const tab = getActiveTab();
    let candles;
    
    if (tab && tab.chartType === 'tick') {
        // 틱차트: N틱마다 1봉
        candles = aggregateTicksToTickCandles(window.liveTicks, tab.tickCount || 100);
    } else {
        // 타임차트: N초마다 1봉
        const interval = (tab && tab.interval) ? tab.interval : 60;
        candles = aggregateTicksToCandles(window.liveTicks, interval);
    }
    
    if (candles.length > 0) {
        window.liveCandleSeries.setData(candles);
        
        const volData = candles.map(c => ({
            time: c.time,
            value: c._volume || c._tickCount || 1,
            color: c.close >= c.open ? '#0066cc33' : '#cc000033',
        }));
        if (window.volumeSeries) window.volumeSeries.setData(volData);
        
        updateMALines(candles);
    }
}

// MA 계산
function calculateMA(candles, period) {
    if (candles.length < period) return [];
    const result = [];
    for (let i = period - 1; i < candles.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += candles[i - j].close;
        }
        result.push({ time: candles[i].time, value: sum / period });
    }
    return result;
}

// MA 라인 업데이트 (통합 차트)
function updateMALines(candles) {
    const ma1P = parseInt(document.getElementById('nq-ma1-period')?.value) || 5;
    const ma2P = parseInt(document.getElementById('nq-ma2-period')?.value) || 20;
    const ma3P = parseInt(document.getElementById('nq-ma3-period')?.value) || 60;
    const ma1Show = document.getElementById('nq-ma1-show')?.checked !== false;
    const ma2Show = document.getElementById('nq-ma2-show')?.checked !== false;
    const ma3Show = document.getElementById('nq-ma3-show')?.checked !== false;
    
    if (window.ma1Series) window.ma1Series.setData(ma1Show ? calculateMA(candles, ma1P) : []);
    if (window.ma2Series) window.ma2Series.setData(ma2Show ? calculateMA(candles, ma2P) : []);
    if (window.ma3Series) window.ma3Series.setData(ma3Show ? calculateMA(candles, ma3P) : []);
}

// MA 정보 표시
function updateMAInfoDisplay() {
    // (no longer needed as separate display)
}

// MA 세팅 토글
function toggleMASettings() {
    const panel = document.getElementById('ma-settings');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// MA 세팅 적용 + localStorage 저장
function applyMASettings() {
    const ma1Color = document.getElementById('nq-ma1-color')?.value || '#ffeb3b';
    const ma2Color = document.getElementById('nq-ma2-color')?.value || '#00bcd4';
    const ma3Color = document.getElementById('nq-ma3-color')?.value || '#e040fb';
    const ma1Name = document.getElementById('nq-ma1-name')?.value || 'MA1';
    const ma2Name = document.getElementById('nq-ma2-name')?.value || 'MA2';
    const ma3Name = document.getElementById('nq-ma3-name')?.value || 'MA3';
    const ma1Period = document.getElementById('nq-ma1-period')?.value || '5';
    const ma2Period = document.getElementById('nq-ma2-period')?.value || '20';
    const ma3Period = document.getElementById('nq-ma3-period')?.value || '60';
    const ma1Show = document.getElementById('nq-ma1-show')?.checked !== false;
    const ma2Show = document.getElementById('nq-ma2-show')?.checked !== false;
    const ma3Show = document.getElementById('nq-ma3-show')?.checked !== false;
    const labelShow = document.getElementById('nq-ma-label-show')?.checked !== false;
    
    if (window.ma1Series) window.ma1Series.applyOptions({ color: ma1Color, title: labelShow ? ma1Name : '', lastValueVisible: labelShow });
    if (window.ma2Series) window.ma2Series.applyOptions({ color: ma2Color, title: labelShow ? ma2Name : '', lastValueVisible: labelShow });
    if (window.ma3Series) window.ma3Series.applyOptions({ color: ma3Color, title: labelShow ? ma3Name : '', lastValueVisible: labelShow });
    
    const settings = {
        nq: {
            ma1: { color: ma1Color, name: ma1Name, period: ma1Period, show: ma1Show },
            ma2: { color: ma2Color, name: ma2Name, period: ma2Period, show: ma2Show },
            ma3: { color: ma3Color, name: ma3Name, period: ma3Period, show: ma3Show },
            labelShow: labelShow
        }
    };
    try { localStorage.setItem('crowny_ma_settings', JSON.stringify(settings)); } catch(e) {}
    
    // 현재 탭 설정으로 MA 재계산
    updateLiveCandleChart();
    console.log('📈 MA 설정 적용 완료');
}

// localStorage에서 MA 설정 로드
function loadMASettings() {
    try {
        const raw = localStorage.getItem('crowny_ma_settings');
        if (!raw) return;
        const s = JSON.parse(raw);
        
        if (s.nq) {
            if (s.nq.ma1) {
                const el = document.getElementById('nq-ma1-color'); if (el) el.value = s.nq.ma1.color;
                const n = document.getElementById('nq-ma1-name'); if (n) n.value = s.nq.ma1.name;
                const p = document.getElementById('nq-ma1-period'); if (p) p.value = s.nq.ma1.period;
                const sh = document.getElementById('nq-ma1-show'); if (sh) sh.checked = s.nq.ma1.show;
            }
            if (s.nq.ma2) {
                const el = document.getElementById('nq-ma2-color'); if (el) el.value = s.nq.ma2.color;
                const n = document.getElementById('nq-ma2-name'); if (n) n.value = s.nq.ma2.name;
                const p = document.getElementById('nq-ma2-period'); if (p) p.value = s.nq.ma2.period;
                const sh = document.getElementById('nq-ma2-show'); if (sh) sh.checked = s.nq.ma2.show;
            }
            if (s.nq.ma3) {
                const el = document.getElementById('nq-ma3-color'); if (el) el.value = s.nq.ma3.color;
                const n = document.getElementById('nq-ma3-name'); if (n) n.value = s.nq.ma3.name;
                const p = document.getElementById('nq-ma3-period'); if (p) p.value = s.nq.ma3.period;
                const sh = document.getElementById('nq-ma3-show'); if (sh) sh.checked = s.nq.ma3.show;
            }
            const lb = document.getElementById('nq-ma-label-show'); if (lb) lb.checked = s.nq.labelShow;
        }
        console.log('📈 MA 설정 로드 완료');
    } catch(e) {}
}

// 틱 데이터를 캔들로 집계 (거래량 포함)
function aggregateTicksToCandles(ticks, intervalSec) {
    if (ticks.length === 0) return [];
    
    const candles = [];
    let currentCandle = null;
    
    for (const tick of ticks) {
        const candleTime = Math.floor(tick.time / intervalSec) * intervalSec;
        
        if (!currentCandle || currentCandle.time !== candleTime) {
            if (currentCandle) candles.push(currentCandle);
            currentCandle = {
                time: candleTime,
                open: tick.price, high: tick.price, low: tick.price, close: tick.price,
                _tickCount: 1,
                _volume: tick.volume || 1,
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, tick.price);
            currentCandle.low = Math.min(currentCandle.low, tick.price);
            currentCandle.close = tick.price;
            currentCandle._tickCount = (currentCandle._tickCount || 0) + 1;
            currentCandle._volume = (currentCandle._volume || 0) + (tick.volume || 1);
        }
    }
    if (currentCandle) candles.push(currentCandle);
    
    return candles;
}

// 연결 상태 표시
function updateLiveStatus(connected) {
    const dot = document.getElementById('live-status-dot');
    const text = document.getElementById('live-status-text');
    if (dot) dot.style.background = connected ? '#00ff88' : '#ff4444';
    if (text) text.textContent = connected ? `Databento Live · ${window.liveTicks.length}틱` : '연결 끊김';
}

// 실시간 손익 표시
function updateLivePnL() {
    const pnlBar = document.getElementById('live-pnl-bar');
    const pnlEl = document.getElementById('live-pnl');
    
    if (!pnlBar || !pnlEl) return;
    
    // 오픈 포지션 확인
    if (!myParticipation || !myParticipation.trades) {
        pnlBar.style.display = 'none';
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    if (openTrades.length === 0) {
        pnlBar.style.display = 'none';
        return;
    }
    
    pnlBar.style.display = 'block';
    
    let totalPnL = 0;
    for (const trade of openTrades) {
        const multiplier = trade.contract === 'MNQ' ? 2 : 20;
        const contracts = trade.contracts || 1;
        if (trade.side === 'BUY') {
            totalPnL += (currentPrice - trade.entryPrice) * multiplier * contracts;
        } else {
            totalPnL += (trade.entryPrice - currentPrice) * multiplier * contracts;
        }
    }
    
    pnlEl.textContent = `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`;
    pnlEl.style.color = totalPnL > 0 ? '#00ff88' : totalPnL < 0 ? '#ff4444' : '#888';
}

// 하위 호환성 유지
function startRealPriceUpdates() {
    // startLiveDataFeed에서 처리하므로 여기서는 아무것도 안 함
    console.log('ℹ️ 실시간 업데이트는 startLiveDataFeed에서 처리');
}

function fetchRealNQData() {
    return { candles: [], volume: [] };
}

function generateSampleData() {
    return { candles: [], volume: [] };
}

// 차트에 포지션 라인 그리기 (간소화 버전)
// 손절가 업데이트 (차트에서 드래그)
async function updateTradeStopLoss(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].stopLoss = newPrice;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        console.log(`✅ SL 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('SL 업데이트 실패:', error);
    }
}

// 익절가 업데이트 (차트에서 드래그)
async function updateTradeTakeProfit(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].takeProfit = newPrice;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        console.log(`✅ TP 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('TP 업데이트 실패:', error);
    }
}

function updatePriceFromChart(chart) {
    // TradingView 차트에서 현재 가격 가져오기
    chart.getSeries().then(series => {
        // 마지막 바 데이터 가져오기
        const lastBar = series.lastBar();
        if (lastBar) {
            currentPrice = lastBar.close;
            updateNQPriceDisplay();
        }
    }).catch(err => {
        console.log('차트 데이터 로드 중...');
        // Fallback: 모의 데이터
        updateNQPrice();
    });
}

function connectPriceWebSocket() {
    // NQ 선물 가격 - Yahoo Finance API 사용 (무료, 15분 지연)
    // 실시간은 유료이므로 모의 데이터 생성
    updateNQPrice();
    
    // 5초마다 가격 업데이트 (모의)
    if (window.nqPriceInterval) clearInterval(window.nqPriceInterval);
    
    window.nqPriceInterval = setInterval(updateNQPrice, 5000);
}

async function updateNQPrice() {
    try {
        // Railway 서버에서 Databento 실시간 NQ 가격 조회
        const PRICE_SERVER = 'https://web-production-26db6.up.railway.app';
        const response = await fetch(`${PRICE_SERVER}/api/market/live`);
        const data = await response.json();
        
        if (data && data.price) {
            currentPrice = data.price;
            console.log(`📊 NQ 가격: ${currentPrice.toFixed(2)} (${data.source}) bid:${data.bid} ask:${data.ask}`);
        } else {
            if (!currentPrice) {
                currentPrice = 25400;
            }
            console.log('⚠️ NQ 데이터 없음 (장 마감 가능성)');
        }
        
        updateNQPriceDisplay();
        
    } catch (error) {
        console.error('Price fetch error:', error);
        if (!currentPrice) currentPrice = 25400;
        updateNQPriceDisplay();
    }
}

function updateNQPriceDisplay() {
    const contract = document.getElementById('futures-contract')?.value || 'NQ';
    const multiplier = contract === 'NQ' ? 20 : 2;
    const tickSize = 0.25;
    const tickValue = multiplier * tickSize;
    
    const priceEl = document.getElementById('current-nq-price');
    const tickSizeEl = document.getElementById('tick-size');
    const pointValueEl = document.getElementById('point-value');
    const tickValueEl = document.getElementById('tick-value');
    
    if (priceEl) priceEl.textContent = currentPrice.toFixed(2);
    if (tickSizeEl) tickSizeEl.textContent = tickSize.toFixed(2);
    if (pointValueEl) pointValueEl.textContent = `$${multiplier}`;
    if (tickValueEl) tickValueEl.textContent = `$${tickValue.toFixed(2)}`;
    
    updateOpenPositions();
}

function updateContractSpecs() {
    // 하단 폼 상품 변경 → 탭 심볼 동기화
    const formContract = document.getElementById('futures-contract')?.value;
    if (formContract) {
        const tab = getActiveTab();
        if (tab && tab.symbol !== formContract) {
            tab.symbol = formContract;
            const tabSym = document.getElementById('tab-symbol');
            if (tabSym) tabSym.value = formContract;
            updateChartLabel();
            renderChartTabs();
            saveChartTabs();
            drawPositionLinesLW();
        }
    }
    updateNQPriceDisplay();
}

// (첫 번째 executeFuturesTrade 제거됨 - 아래 고급 버전이 최종)

// SL/TP 자동 청산 (confirm 없이)
async function autoClosePosition(tradeIndex, reason) {
    if (!myParticipation) return;
    
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const exitPrice = reason === 'SL' ? trade.stopLoss : 
                      reason === 'TRAIL-SL' ? trade.stopLoss :
                      reason === 'TP' ? trade.takeProfit : currentPrice;
    
    const priceDiff = trade.side === 'BUY' 
        ? (exitPrice - trade.entryPrice) 
        : (trade.entryPrice - exitPrice);
    
    const pnl = priceDiff * trade.multiplier * trade.contracts;
    const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
    const netPnl = pnl - fee;
    
    try {
        trade.status = 'closed';
        trade.exitPrice = exitPrice;
        trade.pnl = netPnl;
        trade.fee = fee;
        trade.closedAt = new Date();
        trade.closeReason = reason; // 'SL', 'TP', 'ADMIN'
        
        const newBalance = myParticipation.currentBalance + trade.margin + netPnl;
        myParticipation.currentBalance = newBalance;
        
        // 일일 PnL 누적
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + netPnl;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: myParticipation.trades,
                currentBalance: newBalance,
                dailyPnL: myParticipation.dailyPnL
            });
        
        const emoji = reason === 'TP' ? '🟢' : reason === 'TRAIL-SL' ? '🔄' : '🔴';
        console.log(`${emoji} 자동 청산 (${reason}): ${trade.contract} ${trade.side} @ ${exitPrice.toFixed(2)} → $${netPnl.toFixed(2)}`);
        
        // 알림
        const reasonText = reason === 'TRAIL-SL' ? '트레일링 스탑' : reason;
        alert(`${emoji} ${reasonText} 자동 청산!\n\n${trade.contract} ${trade.side} × ${trade.contracts}\n진입: ${trade.entryPrice.toFixed(2)}\n청산: ${exitPrice.toFixed(2)}\n순손익: $${netPnl.toFixed(2)}`);
        
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // 차트 라인 정리
        setTimeout(() => { drawPositionLinesLW(); }, 300);
        
        await checkDailyLossLimit();
        await checkCumulativeLiquidation();
        updateRiskGaugeUI();
        
    } catch (error) {
        console.error('자동 청산 실패:', error);
    }
}

async function closePosition(tradeIndex) {
    if (!myParticipation) return;
    
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const priceDiff = trade.side === 'BUY' 
        ? (currentPrice - trade.entryPrice) 
        : (trade.entryPrice - currentPrice);
    
    const pnl = priceDiff * trade.multiplier * trade.contracts;
    const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
    const netPnl = pnl - fee;
    
    try {
        trade.status = 'closed';
        trade.exitPrice = currentPrice;
        trade.pnl = netPnl;
        trade.fee = fee;
        trade.closedAt = new Date();
        
        // 증거금 반환 + 순손익 반영
        const newBalance = myParticipation.currentBalance + trade.margin + netPnl;
        myParticipation.currentBalance = newBalance;
        
        // 일일 PnL 누적
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + netPnl;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: myParticipation.trades,
                currentBalance: newBalance,
                dailyPnL: myParticipation.dailyPnL
            });
        
        console.log(`✅ 청산: ${trade.side} ${trade.contract} x${trade.contracts} | PnL: $${netPnl.toFixed(2)}`);
        
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // ===== RISK CHECK: 일일 손실 한도 =====
        await checkDailyLossLimit();
        
        // ===== RISK CHECK: 누적 청산 =====
        await checkCumulativeLiquidation();
        
        updateRiskGaugeUI();
        
        // 차트 라인 업데이트 + 자동 정렬
        setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 500);
    } catch (error) {
        alert('청산 실패: ' + error.message);
    }
}

function updateOpenPositions() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('open-positions');
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    // ===== 트레일링 스탑 처리 =====
    let trailingUpdated = false;
    for (let i = 0; i < myParticipation.trades.length; i++) {
        const trade = myParticipation.trades[i];
        if (trade.status !== 'open' || !currentPrice || !trade.trailingStop || !trade.trailingStop.enabled) continue;
        
        const ts = trade.trailingStop;
        
        if (trade.side === 'BUY') {
            // BUY: 가격이 올라가면 SL도 따라 올림
            const profit = currentPrice - trade.entryPrice;
            
            // 활성화 체크
            if (!ts.activated && profit >= ts.activation) {
                ts.activated = true;
                console.log(`🔄 트레일링 활성화 (BUY #${i}): 수익 ${profit.toFixed(2)}pt ≥ ${ts.activation}pt`);
            }
            
            if (ts.activated) {
                // 최고가 갱신
                if (currentPrice > (ts.highWaterMark || trade.entryPrice)) {
                    ts.highWaterMark = currentPrice;
                    const newSL = currentPrice - ts.distance;
                    // SL은 위로만 움직임 (더 유리한 방향)
                    if (!trade.stopLoss || newSL > trade.stopLoss) {
                        trade.stopLoss = Math.round(newSL * 4) / 4; // 0.25 단위로 반올림
                        trailingUpdated = true;
                        console.log(`📈 트레일링 SL 상향: ${trade.stopLoss.toFixed(2)} (최고: ${ts.highWaterMark.toFixed(2)})`);
                    }
                }
            }
        } else {
            // SELL: 가격이 내려가면 SL도 따라 내림
            const profit = trade.entryPrice - currentPrice;
            
            // 활성화 체크
            if (!ts.activated && profit >= ts.activation) {
                ts.activated = true;
                console.log(`🔄 트레일링 활성화 (SELL #${i}): 수익 ${profit.toFixed(2)}pt ≥ ${ts.activation}pt`);
            }
            
            if (ts.activated) {
                // 최저가 갱신
                if (currentPrice < (ts.highWaterMark || trade.entryPrice)) {
                    ts.highWaterMark = currentPrice;
                    const newSL = currentPrice + ts.distance;
                    // SL은 아래로만 움직임 (더 유리한 방향)
                    if (!trade.stopLoss || newSL < trade.stopLoss) {
                        trade.stopLoss = Math.round(newSL * 4) / 4;
                        trailingUpdated = true;
                        console.log(`📉 트레일링 SL 하향: ${trade.stopLoss.toFixed(2)} (최저: ${ts.highWaterMark.toFixed(2)})`);
                    }
                }
            }
        }
    }
    
    // 트레일링 SL 변경 시 Firestore 저장 + 차트 라인 갱신 (쓰로틀)
    if (trailingUpdated) {
        // Firestore 저장 (디바운스 500ms)
        if (window._trailingSaveTimer) clearTimeout(window._trailingSaveTimer);
        window._trailingSaveTimer = setTimeout(async () => {
            try {
                await db.collection('prop_challenges').doc(myParticipation.challengeId)
                    .collection('participants').doc(myParticipation.participantId)
                    .update({ trades: myParticipation.trades });
            } catch (e) { console.warn('트레일링 저장 실패:', e); }
        }, 500);
        
        // 차트 라인 즉시 갱신
        drawPositionLinesLW();
    }
    
    // ===== SL/TP 자동 트리거 =====
    for (let i = 0; i < myParticipation.trades.length; i++) {
        const trade = myParticipation.trades[i];
        if (trade.status !== 'open' || !currentPrice) continue;
        
        let shouldClose = false;
        let reason = '';
        
        if (trade.stopLoss) {
            const slHit = trade.side === 'BUY' 
                ? currentPrice <= trade.stopLoss 
                : currentPrice >= trade.stopLoss;
            if (slHit) {
                shouldClose = true;
                reason = trade.trailingStop?.activated ? 'TRAIL-SL' : 'SL';
            }
        }
        
        if (trade.takeProfit) {
            const tpHit = trade.side === 'BUY' 
                ? currentPrice >= trade.takeProfit 
                : currentPrice <= trade.takeProfit;
            if (tpHit) {
                shouldClose = true;
                reason = 'TP';
            }
        }
        
        if (shouldClose) {
            autoClosePosition(i, reason);
            return; // 재귀 방지: 한 번에 하나씩
        }
    }
    
    // 포지션 카운트 바 업데이트
    updatePositionCountBar();
    
    if (openTrades.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--accent); padding:1rem;">오픈 포지션 없음</p>';
        return;
    }
    
    container.innerHTML = '';
    
    openTrades.forEach((trade, index) => {
        const actualIndex = myParticipation.trades.indexOf(trade);
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        
        const pnl = priceDiff * trade.multiplier * trade.contracts;
        const pnlColor = pnl >= 0 ? '#0066cc' : '#cc0000';
        
        const div = document.createElement('div');
        div.style.cssText = 'padding:1rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem; border-left:4px solid ' + (trade.side === 'BUY' ? '#0066cc' : '#cc0000');
        
        // SL/TP 인라인 수정 UI
        const ts = trade.trailingStop;
        const trailBadge = (ts && ts.enabled) 
            ? `<span style="display:inline-block; background:${ts.activated ? '#ff9800' : '#666'}; color:white; font-size:0.6rem; padding:1px 4px; border-radius:3px; margin-left:4px;">${ts.activated ? '🔄 TRAIL' : '⏳ 대기'}</span>` 
            : '';
        
        let slTPHTML = `
            <div style="display:flex; gap:4px; margin-top:6px; font-size:0.8rem; flex-wrap:wrap; align-items:center;">
                <span style="color:#ff4444;">SL:</span>
                <button onclick="adjustSLTP(${actualIndex},'sl',-0.25)" style="background:#333; color:#ff4444; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">−</button>
                <span id="sl-val-${actualIndex}" style="color:#ff4444; font-weight:700; min-width:60px; text-align:center; cursor:pointer;" onclick="editSLTP(${actualIndex},'sl')">${trade.stopLoss ? trade.stopLoss.toFixed(2) : '없음'}</span>
                <button onclick="adjustSLTP(${actualIndex},'sl',+0.25)" style="background:#333; color:#ff4444; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">+</button>
                <span style="margin-left:6px; color:#00cc00;">TP:</span>
                <button onclick="adjustSLTP(${actualIndex},'tp',-0.25)" style="background:#333; color:#00cc00; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">−</button>
                <span id="tp-val-${actualIndex}" style="color:#00cc00; font-weight:700; min-width:60px; text-align:center; cursor:pointer;" onclick="editSLTP(${actualIndex},'tp')">${trade.takeProfit ? trade.takeProfit.toFixed(2) : '없음'}</span>
                <button onclick="adjustSLTP(${actualIndex},'tp',+0.25)" style="background:#333; color:#00cc00; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">+</button>
                ${trailBadge}
            </div>
        `;
        
        if (ts && ts.enabled && ts.activated) {
            const hwm = ts.highWaterMark || trade.entryPrice;
            slTPHTML += `<div style="font-size:0.7rem; color:#ff9800; margin-top:2px;">🔄 최${trade.side === 'BUY' ? '고' : '저'}가: ${hwm.toFixed(2)} | 거리: ${ts.distance}pt</div>`;
        }
        
        // 분할 청산 버튼 (2계약 이상)
        const partialCloseBtn = trade.contracts > 1 
            ? `<button onclick="partialClosePosition(${actualIndex})" style="background:#886600; color:white; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.65rem;">📊 분할</button>`
            : '';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                        <strong style="color:${trade.side === 'BUY' ? '#0066cc' : '#cc0000'}">${trade.side}</strong> 
                        <span>${trade.contract} × ${trade.contracts}</span>
                        <span style="font-size:0.75rem; color:var(--accent);">${trade.orderType}</span>
                    </div>
                    <div style="font-size:0.85rem;">
                        진입: ${trade.entryPrice.toFixed(2)} → 현재: ${currentPrice.toFixed(2)}
                    </div>
                    ${slTPHTML}
                    <div style="margin-top:0.5rem;">
                        <strong style="color:${pnlColor}; font-size:1.2rem;">
                            ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                        </strong>
                        <span style="font-size:0.8rem; color:var(--accent); margin-left:0.5rem;">
                            (${((pnl / trade.margin) * 100).toFixed(2)}%)
                        </span>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <button onclick="closePosition(${actualIndex})" style="background:#cc0000; color:white; border:none; padding:0.5rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.85rem; font-weight:bold;">
                        ✕ CLOSE
                    </button>
                    ${partialCloseBtn}
                    ${(ts && ts.enabled) ? `
                        <button onclick="toggleTrailingForTrade(${actualIndex})" style="background:${ts.activated ? '#ff9800' : '#666'}; color:white; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.6rem;">
                            ${ts.activated ? '🔄 ON' : '⏸ OFF'}
                        </button>
                    ` : `
                        <button onclick="enableTrailingForTrade(${actualIndex})" style="background:#444; color:#aaa; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.6rem;">
                            +트레일
                        </button>
                    `}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function modifyPosition(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const newSL = prompt(`손절가 수정:\n현재: ${trade.stopLoss ? trade.stopLoss.toFixed(2) : '없음'}`, trade.stopLoss || '');
    const newTP = prompt(`익절가 수정:\n현재: ${trade.takeProfit ? trade.takeProfit.toFixed(2) : '없음'}`, trade.takeProfit || '');
    
    try {
        trade.stopLoss = newSL ? parseFloat(newSL) : null;
        trade.takeProfit = newTP ? parseFloat(newTP) : null;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        updateOpenPositions();
        drawPositionLinesLW();
    } catch (error) {
        alert('수정 실패: ' + error.message);
    }
}

// ★ SL/TP 인라인 ±0.25 조정
async function adjustSLTP(tradeIndex, type, delta) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    if (type === 'sl') {
        trade.stopLoss = Math.round(((trade.stopLoss || trade.entryPrice) + delta) * 4) / 4;
    } else {
        trade.takeProfit = Math.round(((trade.takeProfit || trade.entryPrice) + delta) * 4) / 4;
    }
    
    const el = document.getElementById(`${type === 'sl' ? 'sl' : 'tp'}-val-${tradeIndex}`);
    if (el) el.textContent = (type === 'sl' ? trade.stopLoss : trade.takeProfit).toFixed(2);
    
    drawPositionLinesLW();
    
    if (window._sltpSaveTimer) clearTimeout(window._sltpSaveTimer);
    window._sltpSaveTimer = setTimeout(async () => {
        try {
            await db.collection('prop_challenges').doc(myParticipation.challengeId)
                .collection('participants').doc(myParticipation.participantId)
                .update({ trades: myParticipation.trades });
        } catch (e) { console.warn('SL/TP 저장 실패:', e); }
    }, 500);
}

// ★ SL/TP 직접 입력
async function editSLTP(tradeIndex, type) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const label = type === 'sl' ? '손절가' : '익절가';
    const current = type === 'sl' ? trade.stopLoss : trade.takeProfit;
    const input = prompt(`${label} 직접 입력:`, current ? current.toFixed(2) : '');
    if (!input) return;
    
    const val = parseFloat(input);
    if (isNaN(val) || val < 1000) { alert('유효하지 않은 가격'); return; }
    
    if (type === 'sl') trade.stopLoss = val;
    else trade.takeProfit = val;
    
    drawPositionLinesLW();
    
    try {
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
    } catch (e) { alert('저장 실패: ' + e.message); }
    updateOpenPositions();
}

// ★ 분할 청산
async function partialClosePosition(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open' || trade.contracts <= 1) return;
    
    const input = prompt(`분할 청산\n\n현재: ${trade.side} ${trade.contract} × ${trade.contracts}계약\n\n몇 계약 청산? (1 ~ ${trade.contracts - 1})`, '1');
    if (!input) return;
    
    const closeCount = parseInt(input);
    if (isNaN(closeCount) || closeCount < 1 || closeCount >= trade.contracts) {
        alert(`1 ~ ${trade.contracts - 1} 사이 숫자를 입력하세요`);
        return;
    }
    
    const remainCount = trade.contracts - closeCount;
    const priceDiff = trade.side === 'BUY' ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice);
    const closePnl = priceDiff * trade.multiplier * closeCount;
    const closeFee = (trade.fee / trade.contracts) * closeCount;
    const netPnl = closePnl - closeFee;
    const closeMargin = (trade.margin / trade.contracts) * closeCount;
    
    try {
        trade.contracts = remainCount;
        trade.margin = trade.margin - closeMargin;
        trade.fee = trade.fee - closeFee;
        
        const closedTrade = {
            ...JSON.parse(JSON.stringify(trade)),
            contracts: closeCount, margin: closeMargin, fee: closeFee,
            exitPrice: currentPrice, pnl: netPnl, status: 'closed',
            closedAt: new Date(), closeReason: `분할청산 (${closeCount}/${closeCount + remainCount})`,
        };
        
        myParticipation.trades.push(closedTrade);
        myParticipation.currentBalance += closeMargin + netPnl;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades, currentBalance: myParticipation.currentBalance });
        
        console.log(`📊 분할 청산: ${closeCount}계약 청산, ${remainCount}계약 유지`);
        updateTradingUI(); updateOpenPositions(); updateRiskGaugeUI(); drawPositionLinesLW();
    } catch (error) {
        alert('분할 청산 실패: ' + error.message);
    }
}

// 기존 포지션에 트레일링 스탑 활성화/비활성화
async function toggleTrailingForTrade(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open' || !trade.trailingStop) return;
    
    trade.trailingStop.enabled = !trade.trailingStop.enabled;
    if (!trade.trailingStop.enabled) {
        trade.trailingStop.activated = false;
    }
    
    try {
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        const status = trade.trailingStop.enabled ? '활성화' : '비활성화';
        console.log(`🔄 트레일링 ${status}: Trade #${tradeIndex}`);
        updateOpenPositions();
    } catch (e) {
        console.error('트레일링 토글 실패:', e);
    }
}

// 트레일링 없는 포지션에 트레일링 추가
async function enableTrailingForTrade(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const distance = prompt('트레일링 거리 (포인트):', '30');
    if (!distance) return;
    
    const activation = prompt('활성화 수익 (포인트, 0=즉시):', '10');
    
    const distVal = parseFloat(distance) || 30;
    const actVal = parseFloat(activation) || 0;
    
    trade.trailingStop = {
        enabled: true,
        distance: distVal,
        activation: actVal,
        highWaterMark: trade.side === 'BUY' ? Math.max(currentPrice, trade.entryPrice) : Math.min(currentPrice, trade.entryPrice),
        activated: actVal === 0
    };
    
    // SL이 없으면 자동 설정
    if (!trade.stopLoss) {
        if (trade.side === 'BUY') {
            trade.stopLoss = Math.round((currentPrice - distVal) * 4) / 4;
        } else {
            trade.stopLoss = Math.round((currentPrice + distVal) * 4) / 4;
        }
    }
    
    try {
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        alert(`✅ 트레일링 스탑 추가!\n거리: ${distVal}pt\nSL: ${trade.stopLoss.toFixed(2)}`);
        updateOpenPositions();
        drawPositionLinesLW();
    } catch (e) {
        alert('설정 실패: ' + e.message);
    }
}

async function loadTradeHistory() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('trade-history');
    container.innerHTML = '';
    
    const closedTrades = myParticipation.trades.filter(t => t.status === 'closed');
    
    if (closedTrades.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--accent); padding:1rem;">거래 내역 없음</p>';
        return;
    }
    
    closedTrades.slice().reverse().forEach((trade) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        
        const sideColor = trade.side === 'BUY' ? '#0066cc' : '#cc0000';
        const pnlColor = trade.pnl >= 0 ? '#0066cc' : '#cc0000';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div>
                    <strong style="color:${sideColor}">${trade.side}</strong> ${trade.contract} × ${trade.contracts}
                    <br>
                    <span style="font-size:0.85rem; color:var(--accent);">
                        ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice.toFixed(2)}
                    </span>
                </div>
                <div style="text-align:right;">
                    <strong style="color:${pnlColor}; font-size:1.1rem;">
                        ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
                    </strong>
                    <br>
                    <span style="font-size:0.75rem; color:var(--accent);">
                        ${new Date(trade.closedAt.seconds * 1000).toLocaleString()}
                    </span>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Remove crypto pair change listener
document.addEventListener('DOMContentLoaded', () => {
    // NQ futures - no pair selection needed
});

// ========== NINJATRADER-STYLE FEATURES ==========

function toggleOrderInputs() {
    const orderType = document.getElementById('order-type').value;
    const priceInputs = document.getElementById('price-inputs');
    const limitDiv = document.getElementById('limit-price-div');
    const stopDiv = document.getElementById('stop-price-div');
    
    if (orderType === 'MARKET') {
        priceInputs.style.display = 'none';
    } else if (orderType === 'LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'none';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'none';
        stopDiv.style.display = 'block';
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP_LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'block';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    }
}

function toggleSLTP() {
    const useSLTP = document.getElementById('use-sl-tp').checked;
    const inputs = document.getElementById('sl-tp-inputs');
    inputs.style.display = useSLTP ? 'block' : 'none';
}

// 트레일링 스탑 옵션 토글
function toggleTrailingOptions() {
    const use = document.getElementById('use-trailing-stop').checked;
    const opts = document.getElementById('trailing-options');
    if (opts) opts.style.display = use ? 'block' : 'none';
}

// CLOSE 버튼 — 가장 최근 오픈 포지션 청산
async function closeLastPosition() {
    if (window._closeLoading) return;
    window._closeLoading = true;
    setTimeout(() => { window._closeLoading = false; }, 1000);
    if (!myParticipation || !myParticipation.trades) {
        alert('오픈 포지션이 없습니다');
        return;
    }
    
    // 가장 최근 open 포지션 찾기
    let lastIndex = -1;
    for (let i = myParticipation.trades.length - 1; i >= 0; i--) {
        if (myParticipation.trades[i].status === 'open') {
            lastIndex = i;
            break;
        }
    }
    
    if (lastIndex === -1) {
        alert('오픈 포지션이 없습니다');
        return;
    }
    
    const trade = myParticipation.trades[lastIndex];
    const priceDiff = trade.side === 'BUY' 
        ? (currentPrice - trade.entryPrice) 
        : (trade.entryPrice - currentPrice);
    const pnl = priceDiff * trade.multiplier * trade.contracts;
    
    if (!confirm(`마지막 포지션 청산\n\n${trade.side} ${trade.contract} ×${trade.contracts}\n진입: ${trade.entryPrice.toFixed(2)} → 현재: ${currentPrice.toFixed(2)}\n예상 손익: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n\n청산하시겠습니까?`)) return;
    
    await closePosition(lastIndex);
}

// FLATTEN 버튼 — 전체 포지션 즉시 청산
async function flattenAllPositions() {
    if (!myParticipation || !myParticipation.trades) {
        alert('오픈 포지션이 없습니다');
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    if (openTrades.length === 0) {
        alert('오픈 포지션이 없습니다');
        return;
    }
    
    let totalPnL = 0;
    for (const trade of openTrades) {
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        totalPnL += priceDiff * trade.multiplier * trade.contracts;
    }
    
    if (!confirm(`🚨 FLATTEN — 전체 포지션 즉시 청산\n\n오픈: ${openTrades.length}개\n예상 총 손익: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}\n\n모두 청산하시겠습니까?`)) return;
    
    await closeAllPositions();
}

// 포지션 카운트 바 업데이트
function updatePositionCountBar() {
    const bar = document.getElementById('position-count-bar');
    const text = document.getElementById('position-count-text');
    if (!bar || !text) return;
    
    if (!myParticipation || !myParticipation.trades) {
        bar.style.display = 'none';
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    bar.style.display = 'block';
    
    let totalPnL = 0;
    let buyCount = 0, sellCount = 0;
    for (const trade of openTrades) {
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        totalPnL += priceDiff * trade.multiplier * trade.contracts;
        if (trade.side === 'BUY') buyCount++; else sellCount++;
    }
    
    const pnlColor = totalPnL >= 0 ? '#0066cc' : '#cc0000';
    text.innerHTML = `🟢 ${openTrades.length}개 포지션 (B:${buyCount} S:${sellCount}) | <strong style="color:${pnlColor}">${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}</strong>`;
}

async function closeAllPositions(contractFilter) {
    if (window._flattenLoading) return;
    window._flattenLoading = true;
    setTimeout(() => { window._flattenLoading = false; }, 1000);
    
    if (!myParticipation || !myParticipation.trades) return;
    
    // contract 필터: 특정 상품만 또는 전체
    const openTrades = myParticipation.trades.filter(t => 
        t.status === 'open' && (!contractFilter || t.contract === contractFilter)
    );
    
    if (openTrades.length === 0) {
        alert(`${contractFilter || '전체'} 오픈 포지션이 없습니다`);
        return;
    }
    
    try {
        let totalPnL = 0;
        let totalNetPnL = 0;
        
        for (let i = 0; i < myParticipation.trades.length; i++) {
            const trade = myParticipation.trades[i];
            if (trade.status === 'open' && (!contractFilter || trade.contract === contractFilter)) {
                const priceDiff = trade.side === 'BUY' 
                    ? (currentPrice - trade.entryPrice) 
                    : (trade.entryPrice - currentPrice);
                
                const pnl = priceDiff * trade.multiplier * trade.contracts;
                const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
                const netPnl = pnl - fee;
                
                trade.status = 'closed';
                trade.exitPrice = currentPrice;
                trade.pnl = netPnl;
                trade.fee = fee;
                trade.closedAt = new Date();
                
                totalPnL += netPnl + trade.margin;
                totalNetPnL += netPnl;
            }
        }
        
        myParticipation.currentBalance += totalPnL;
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + totalNetPnL;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: myParticipation.trades,
                currentBalance: myParticipation.currentBalance,
                dailyPnL: myParticipation.dailyPnL
            });
        
        alert(`✅ ${contractFilter || '전체'} 포지션 청산!\n손익: $${totalNetPnL.toFixed(2)}`);
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // 차트 라인 정리
        setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 300);
        
        // ===== RISK CHECK =====
        await checkDailyLossLimit();
        await checkCumulativeLiquidation();
        updateRiskGaugeUI();
    } catch (error) {
        alert('청산 실패: ' + error.message);
    }
}

// Modify executeFuturesTrade to support advanced order types + SLOT SYSTEM + RISK CHECK
async function executeFuturesTrade(side) {
    // 더블클릭 방지 (1초)
    if (window._tradeLoading) return;
    window._tradeLoading = true;
    setTimeout(() => { window._tradeLoading = false; }, 1000);
    
    if (!myParticipation) {
        alert('챌린지에 먼저 참가하세요');
        return;
    }
    
    // ===== RISK CHECK: 일일 한도 =====
    if (myParticipation.dailyLocked) {
        const reason = myParticipation.adminSuspended 
            ? `⛔ 관리자에 의해 거래가 중단되었습니다.\n사유: ${myParticipation.suspendReason || '미공개'}`
            : '⚠️ 오늘의 거래가 종료되었습니다.\n내일 다시 도전하세요!';
        alert(reason);
        return;
    }
    
    // ===== SLOT SYSTEM: CRNY 기반 계약 수 자동 계산 =====
    const crnyBalance = userWallet?.balances?.crny || 0;
    const slots = calculateSlots(crnyBalance);
    
    if (slots === 0) {
        alert('🔴 CRNY를 보유해야 거래할 수 있습니다.\n\nWALLET에서 CRNY 잔액을 확인해주세요.');
        return;
    }
    
    const contract = document.getElementById('futures-contract').value;
    
    // ===== 상품 제한 체크 =====
    const allowedProduct = myParticipation.allowedProduct || 'BOTH';
    if (allowedProduct !== 'BOTH' && contract !== allowedProduct) {
        alert(`⚠️ 이 챌린지에서는 ${allowedProduct}만 거래 가능합니다.`);
        return;
    }
    
    // ===== 계약 수: 슬롯 vs 챌린지 한도 중 작은 값 =====
    const maxContracts = myParticipation.maxContracts || 7;
    const contracts = Math.min(slots, maxContracts);
    
    const orderType = document.getElementById('order-type').value;
    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = contract === 'NQ' ? 15000 : 1500;
    const requiredMargin = margin * contracts;
    
    // ===== 최대 동시 포지션 체크 =====
    const maxPositions = myParticipation.maxPositions || 5;
    const openCount = (myParticipation.trades || []).filter(t => t.status === 'open').length;
    if (openCount >= maxPositions) {
        alert(`⚠️ 최대 동시 포지션 ${maxPositions}개 도달!\n기존 포지션을 청산한 후 진입하세요.`);
        return;
    }
    
    if (requiredMargin > myParticipation.currentBalance) {
        alert(`증거금이 부족합니다\n필요: $${requiredMargin.toLocaleString()}\n보유: $${myParticipation.currentBalance.toLocaleString()}`);
        return;
    }
    
    // 거래 제한 체크
    if (!checkTradingLimits(contracts)) return;
    
    let entryPrice = currentPrice;
    let orderTypeText = '시장가';
    
    // Get prices based on order type
    if (orderType === 'LIMIT') {
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `지정가 ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP') {
        entryPrice = parseFloat(document.getElementById('stop-price').value);
        orderTypeText = `손절 ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP_LIMIT') {
        const stopPrice = parseFloat(document.getElementById('stop-price').value);
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `손절지정가 ${stopPrice.toFixed(2)}/${entryPrice.toFixed(2)}`;
    }
    
    // Get SL/TP settings
    const useSLTP = document.getElementById('use-sl-tp').checked;
    let stopLoss = null;
    let takeProfit = null;
    let trailingStop = null;
    
    if (useSLTP) {
        const slPoints = parseFloat(document.getElementById('stop-loss-points').value) || 0;
        const tpPoints = parseFloat(document.getElementById('take-profit-points').value) || 0;
        
        if (side === 'BUY') {
            stopLoss = entryPrice - slPoints;
            takeProfit = entryPrice + tpPoints;
        } else {
            stopLoss = entryPrice + slPoints;
            takeProfit = entryPrice - tpPoints;
        }
        
        // 트레일링 스탑 설정
        const useTrailing = document.getElementById('use-trailing-stop')?.checked;
        if (useTrailing) {
            const trailDist = parseFloat(document.getElementById('trailing-distance').value) || 30;
            const trailActivation = parseFloat(document.getElementById('trailing-activation').value) || 10;
            trailingStop = {
                enabled: true,
                distance: trailDist,          // SL이 현재가로부터 유지할 거리
                activation: trailActivation,   // 이만큼 수익 나야 트레일링 시작
                highWaterMark: entryPrice,      // BUY: 최고가 추적 / SELL: 최저가 추적
                activated: false                // 활성화 여부
            };
        }
    }
    
    let confirmMsg = `${side} 포지션 진입\n\n` +
        `상품: ${contract}\n` +
        `👑 슬롯: ${slots}개 (CRNY ${Math.floor(crnyBalance)}개 기준)\n` +
        `계약: ${contracts}개\n` +
        `주문: ${orderTypeText}\n` +
        `증거금: $${requiredMargin.toLocaleString()}\n` +
        `포인트당: $${multiplier * contracts}`;
    
    if (useSLTP) {
        confirmMsg += `\n\n손절: ${stopLoss.toFixed(2)}\n익절: ${takeProfit.toFixed(2)}`;
        if (trailingStop) {
            confirmMsg += `\n🔄 트레일링: ${trailingStop.distance}pt (${trailingStop.activation}pt 수익 후 활성화)`;
        }
    }
    
    confirmMsg += `\n\n실행하시겠습니까?`;
    
    if (!window.confirm(confirmMsg)) return;
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            orderType: orderType,
            entryPrice: entryPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: requiredMargin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStop: trailingStop,
            crnyAtEntry: Math.floor(crnyBalance),
            slotsAtEntry: slots,
            fee: RISK_CONFIG.tradeFeeRoundTrip * contracts,
            timestamp: new Date(),
            status: orderType === 'MARKET' ? 'open' : 'pending',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - requiredMargin;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: trades,
                currentBalance: newBalance
            });
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        
        const statusText = orderType === 'MARKET' ? '체결' : '접수';
        alert(`✅ ${side} 주문 ${statusText}!\n${contract} ${contracts}계약 @ ${entryPrice.toFixed(2)}\n👑 슬롯: ${slots}개`);
        
        updateTradingUI();
        updateOpenPositions();
        updateRiskGaugeUI();
        loadTradeHistory();
        
        // 차트에 라인 그리기 + 자동 정렬
        setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 1000);
    } catch (error) {
        alert('거래 실패: ' + error.message);
    }
}

// Quick chart trade (SLOT-based market order with default SL/TP)
async function quickChartTrade(side, contractOverride) {
    // 더블클릭 방지 (1초)
    if (window._quickTradeLoading) return;
    window._quickTradeLoading = true;
    setTimeout(() => { window._quickTradeLoading = false; }, 1000);
    
    if (!myParticipation) {
        alert('챌린지에 먼저 참가하세요');
        return;
    }
    
    // ===== RISK CHECK =====
    if (myParticipation.dailyLocked) {
        const reason = myParticipation.adminSuspended 
            ? `⛔ 관리자에 의해 거래가 중단되었습니다.\n사유: ${myParticipation.suspendReason || '미공개'}`
            : '⚠️ 오늘의 거래가 종료되었습니다.\n내일 다시 도전하세요!';
        alert(reason);
        return;
    }
    
    // ===== SLOT SYSTEM =====
    const crnyBalance = userWallet?.balances?.crny || 0;
    const slots = calculateSlots(crnyBalance);
    
    if (slots === 0) {
        alert('🔴 CRNY를 보유해야 거래할 수 있습니다.');
        return;
    }
    
    // ★ 하단 폼의 상품 (탭과 동기화됨)
    const contract = document.getElementById('futures-contract')?.value || contractOverride || 'MNQ';
    
    // 상품 제한
    const allowedProduct = myParticipation.allowedProduct || 'BOTH';
    if (allowedProduct !== 'BOTH' && contract !== allowedProduct) {
        alert(`⚠️ 이 챌린지에서는 ${allowedProduct}만 거래 가능합니다.`);
        return;
    }
    
    // 계약 수: 슬롯 vs 챌린지 한도
    const maxContracts = myParticipation.maxContracts || 7;
    const contracts = Math.min(slots, maxContracts);
    
    // 포지션 수 체크
    const maxPositions = myParticipation.maxPositions || 5;
    const openCount = (myParticipation.trades || []).filter(t => t.status === 'open').length;
    if (openCount >= maxPositions) {
        alert(`⚠️ 최대 동시 포지션 ${maxPositions}개 도달!`);
        return;
    }
    
    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = (contract === 'NQ' ? 15000 : 1500) * contracts;
    
    if (margin > myParticipation.currentBalance) {
        alert(`증거금이 부족합니다\n필요: $${margin.toLocaleString()}\n보유: $${myParticipation.currentBalance.toLocaleString()}`);
        return;
    }
    
    // ★ SL/TP: 항상 폼에서 읽기 (기본: SL 50, TP 100)
    const slPoints = parseFloat(document.getElementById('stop-loss-points')?.value) || 50;
    const tpPoints = parseFloat(document.getElementById('take-profit-points')?.value) || 100;
    
    let stopLoss = null;
    let takeProfit = null;
    let trailingStop = null;
    
    if (slPoints > 0) {
        stopLoss = side === 'BUY' ? currentPrice - slPoints : currentPrice + slPoints;
    }
    if (tpPoints > 0) {
        takeProfit = side === 'BUY' ? currentPrice + tpPoints : currentPrice - tpPoints;
    }
    
    // 트레일링 스탑
    const useTrailing = document.getElementById('use-trailing-stop')?.checked;
    if (useTrailing && slPoints > 0) {
        trailingStop = {
            enabled: true, activated: false,
            activation: parseFloat(document.getElementById('trailing-activation')?.value) || 10,
            distance: parseFloat(document.getElementById('trailing-distance')?.value) || slPoints,
            highWaterMark: currentPrice,
        };
    }
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            orderType: 'MARKET',
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: margin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStop: trailingStop,
            crnyAtEntry: Math.floor(crnyBalance),
            slotsAtEntry: slots,
            fee: RISK_CONFIG.tradeFeeRoundTrip * contracts,
            timestamp: new Date(),
            status: 'open',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - margin;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: trades,
                currentBalance: newBalance
            });
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        
        console.log(`✅ 차트 ${side} 주문 체결! ${slots}슬롯, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}`);
        
        updateTradingUI();
        updateOpenPositions();
        updateRiskGaugeUI();
        
        // 차트에 라인 그리기 + 자동 정렬
        setTimeout(() => {
            drawPositionLinesLW();
            scrollToLatest();
        }, 500);
    } catch (error) {
        alert('거래 실패: ' + error.message);
    }
}

// Lightweight Charts용 포지션 라인 그리기 (NQ + MNQ 양쪽)
function drawPositionLinesLW() {
    // 항상 먼저 기존 라인 제거
    if (window.positionLines && window.candleSeries) {
        window.positionLines.forEach(line => {
            try { window.candleSeries.removePriceLine(line); } catch (e) {}
        });
    }
    window.positionLines = [];
    
    if (!window.candleSeries || !myParticipation || !myParticipation.trades) return;
    
    // 현재 탭의 심볼에 해당하는 포지션만 표시
    const tabSymbol = getActiveTabSymbol();
    const openTrades = myParticipation.trades.filter(t => t.status === 'open' && t.contract === tabSymbol);
    
    if (openTrades.length === 0) return;
    
    openTrades.forEach((trade) => {
        const entryLine = window.candleSeries.createPriceLine({
            price: trade.entryPrice,
            color: trade.side === 'BUY' ? '#0066cc' : '#cc0000',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${trade.side} ${trade.contract} ${trade.contracts}`,
        });
        window.positionLines.push(entryLine);
        
        if (trade.stopLoss) {
            const isTrailing = trade.trailingStop?.activated;
            const slLine = window.candleSeries.createPriceLine({
                price: trade.stopLoss,
                color: isTrailing ? '#ff9800' : '#ff0000',
                lineWidth: 2,
                lineStyle: isTrailing ? LightweightCharts.LineStyle.SparseDotted : LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: isTrailing ? '🔄 TRAIL' : 'SL',
            });
            window.positionLines.push(slLine);
        }
        
        if (trade.takeProfit) {
            const tpLine = window.candleSeries.createPriceLine({
                price: trade.takeProfit,
                color: '#00cc00',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'TP',
            });
            window.positionLines.push(tpLine);
        }
    });
    
    console.log(`📊 ${tabSymbol} ${openTrades.length}개 포지션 라인 표시`);
}

// 거래 제한 확인
function checkTradingLimits(contracts) {
    if (!myParticipation) return false;
    
    const maxContracts = myParticipation.maxContracts || 7;
    const maxPositions = myParticipation.maxPositions || 20;
    const maxDrawdown = myParticipation.maxDrawdown || 3000;
    
    // 계약 수 확인
    if (contracts > maxContracts) {
        alert(`❌ 최대 ${maxContracts}계약까지 가능합니다`);
        return false;
    }
    
    // 포지션 수 확인
    const openPositions = myParticipation.trades?.filter(t => t.status === 'open').length || 0;
    if (openPositions >= maxPositions) {
        alert(`❌ 최대 ${maxPositions}개 포지션까지 가능합니다\n현재: ${openPositions}개`);
        return false;
    }
    
    // Drawdown 확인
    const initialBalance = myParticipation.initialBalance || 100000;
    const currentBalance = myParticipation.currentBalance || 100000;
    const drawdown = initialBalance - currentBalance;
    
    if (drawdown >= maxDrawdown) {
        alert(`🚨 청산 기준 도달!\n최대 손실: -$${maxDrawdown}\n현재 손실: -$${drawdown.toFixed(2)}`);
        return false;
    }
    
    return true;
}

// EOD 정산
async function processEOD() {
    if (!myParticipation) return;
    
    const totalPnL = myParticipation.currentBalance - myParticipation.initialBalance;
    
    if (totalPnL > 0) {
        // 수익 발생 - CRFN으로 지급 가능
        console.log(`💰 EOD 수익: $${totalPnL.toFixed(2)}`);
        
        // TODO: CRFN 토큰 지급 로직
    }
    
    // lastEOD 업데이트
    await db.collection('prop_challenges').doc(myParticipation.challengeId)
        .collection('participants').doc(myParticipation.participantId)
        .update({
            lastEOD: new Date(),
            dailyPnL: totalPnL
        });
}

// ========== POLYGON.IO 실시간 CME 데이터 ==========

let polygonWS = null;

// Massive WebSocket 연결
function connectMassiveRealtime() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        console.log('⚠️ Massive 비활성화 - Yahoo Finance 사용');
        return;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    if (apiKey === 'YOUR_POLYGON_API_KEY') {
        console.error('❌ Massive API Key를 설정하세요!');
        return;
    }
    
    polygonWS = new WebSocket('wss://socket.polygon.io/futures');
    
    polygonWS.onopen = () => {
        console.log('📡 Massive 연결 중...');
        
        // 인증
        polygonWS.send(JSON.stringify({
            action: 'auth',
            params: apiKey
        }));
    };
    
    polygonWS.onmessage = (event) => {
        const messages = JSON.parse(event.data);
        
        messages.forEach(msg => {
            if (msg.ev === 'status' && msg.status === 'auth_success') {
                console.log('✅ Massive 인증 성공');
                
                // NQ 선물 구독
                polygonWS.send(JSON.stringify({
                    action: 'subscribe',
                    params: 'AM.C:NQ*' // NQ 전체 (1분, 5분 등)
                }));
                
                console.log('📊 NQ 선물 구독 완료');
            }
            
            if (msg.ev === 'AM') {
                // Aggregate Minute (1분봉)
                handleMassiveAggregate(msg);
            }
        });
    };
    
    polygonWS.onerror = (error) => {
        console.error('❌ Massive 연결 오류:', error);
    };
    
    polygonWS.onclose = () => {
        console.log('🔌 Massive 연결 종료');
        // 재연결
        setTimeout(() => connectMassiveRealtime(), 5000);
    };
}

// Massive 데이터 처리
function handleMassiveAggregate(data) {
    if (!window.candleSeries) return;
    
    const candle = {
        time: Math.floor(data.s / 1000), // 밀리초 → 초
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c
    };
    
    // 차트 업데이트
    window.candleSeries.update(candle);
    
    // 현재가 업데이트
    currentPrice = data.c;
    updateNQPriceDisplay();
    updateOpenPositions();
    
    console.log(`🔄 Massive 실시간: ${data.c.toFixed(2)}`);
}

// Massive REST API로 히스토리 데이터
async function fetchMassiveHistory() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        return null;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/C:NQ/range/5/minute/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results) {
            const candles = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                open: r.o,
                high: r.h,
                low: r.l,
                close: r.c
            }));
            
            const volume = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                value: r.v,
                color: r.c > r.o ? '#26a69a' : '#ef5350'
            }));
            
            console.log('✅ Massive 히스토리 데이터:', candles.length, '개');
            
            return { candles, volume };
        }
    } catch (error) {
        console.error('❌ Massive 히스토리 로드 실패:', error);
    }
    
    return null;
}
