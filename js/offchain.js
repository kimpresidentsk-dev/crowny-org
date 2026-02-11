// ===== offchain.js - 오프체인 포인트, 브릿지, 스왑 =====
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
