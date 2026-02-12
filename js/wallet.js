// ===== wallet.js - 멀티월렛 + 온체인 ERC-20 =====
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
    await loadMaticBalance();
    updateBalances();
}

async function showAddWalletModal() {
    const choice = await showPromptModal('지갑 추가', '1. 새 크라우니 지갑 생성\n2. 외부 지갑 가져오기\n\n번호를 입력하세요:');
    
    if (choice === '1') {
        await createNewWallet();
    } else if (choice === '2') {
        await showImportWallet();
    }
}

async function showImportWallet() {
    const name = (await showPromptModal('지갑 가져오기', '지갑 이름:')) || '외부 지갑';
    const privateKey = await showPromptModal('개인키 입력', '개인키를 입력하세요:\n(0x로 시작하는 64자리)');
    if (!privateKey) return;
    
    try {
        const web3 = new Web3();
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        
        const confirmed = await showConfirmModal(
            '지갑 추가 확인',
            `이 지갑을 추가하시겠습니까?\n\n이름: ${name}\n주소: ${account.address}\n\n⚠️ 외부 지갑은 가스비가 자동 차감됩니다.`
        );
        
        if (confirmed) {
            await importExternalWallet(name, privateKey, account.address);
        }
    } catch (error) {
        showToast('잘못된 개인키입니다', 'error');
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
        
        showToast('외부 지갑 추가 완료!', 'success');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Import error:', error);
        showToast('지갑 추가 실패: ' + error.message, 'error');
    }
}

async function createNewWallet() {
    try {
        const name = (await showPromptModal('새 지갑 생성', '지갑 이름:')) || `크라우니 지갑 ${allWallets.length + 1}`;
        
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
        
        showToast('새 지갑 생성 완료!', 'success');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Create wallet error:', error);
        showToast('지갑 생성 실패: ' + error.message, 'error');
    }
}

async function deleteCurrentWallet() {
    if (allWallets.length === 1) {
        showToast('마지막 지갑은 삭제할 수 없습니다.', 'warning');
        return;
    }
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    const confirmed = await showConfirmModal(
        '지갑 삭제',
        `지갑을 삭제하시겠습니까?\n\n${wallet.name}\n${wallet.walletAddress}\n\n⚠️ 이 작업은 되돌릴 수 없습니다!`
    );
    
    if (!confirmed) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).delete();
        
        showToast('지갑 삭제 완료!', 'success');
        await loadUserWallet();
    } catch (error) {
        console.error('Delete error:', error);
        showToast('지갑 삭제 실패: ' + error.message, 'error');
    }
}

// Load Real Balances from Polygon (온체인 조회 → 별도 저장)
async function loadRealBalances() {
    if (!userWallet) return;
    
    try {
        const address = userWallet.walletAddress;
        console.log('Loading onchain balances for:', address);
        
        // 온체인 잔액 조회
        const onchain = await getAllOnchainBalances(address);
        
        // 온체인 잔액은 별도 필드에 저장 (브릿지 잔액 보존)
        userWallet.onchainBalances = { crny: onchain.crny, fnc: onchain.fnc, crfn: onchain.crfn };
        
        // Firestore의 플랫폼 잔액(balances)이 없으면 온체인 값으로 초기화
        if (!userWallet.balances || (userWallet.balances.crny === 0 && userWallet.balances.fnc === 0 && userWallet.balances.crfn === 0)) {
            userWallet.balances.crny = onchain.crny;
            userWallet.balances.fnc = onchain.fnc;
            userWallet.balances.crfn = onchain.crfn;
        }
        
        // onchainBalances만 Firestore에 별도 저장 (balances는 덮어쓰지 않음)
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({
                'onchainBalances.crny': onchain.crny,
                'onchainBalances.fnc': onchain.fnc,
                'onchainBalances.crfn': onchain.crfn
            });
        
        console.log('✅ Onchain:', onchain, '| Platform:', userWallet.balances);
    } catch (error) {
        console.error('❌ Balance load error:', error);
        // 에러 시 기존 Firestore 잔액 유지 (덮어쓰기 안 함)
        console.log('⚠️ 온체인 조회 실패 — 플랫폼 잔액 유지');
    }
}

// Copy Address
function copyAddress() {
    if (!userWallet) return;
    
    const address = userWallet.walletAddress;
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(() => {
            showToast('주소가 복사되었습니다', 'success');
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
        showToast('주소가 복사되었습니다', 'success');
    } catch (err) {
        showToast('복사 실패. 수동으로 복사해주세요', 'error');
    }
    
    document.body.removeChild(temp);
}

// Update Balances (7-token: 3 on-chain + 4 off-chain + MATIC)
function updateBalances() {
    if (!userWallet) return;
    
    // On-chain balances
    document.getElementById('crny-balance').textContent = userWallet.balances.crny.toFixed(2);
    document.getElementById('fnc-balance').textContent = userWallet.balances.fnc.toFixed(2);
    document.getElementById('crfn-balance').textContent = userWallet.balances.crfn.toFixed(2);
    
    // MATIC balance
    const maticEl = document.getElementById('matic-balance');
    if (maticEl) maticEl.textContent = (userWallet.maticBalance || 0).toFixed(4);
    
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
    
    // Total asset in CRNY equivalent (per-token rates)
    const totalOffchain = (offchain.crtd || 0) + (offchain.crac || 0) + (offchain.crgc || 0) + (offchain.creb || 0);
    const totalCrnyFromOffchain = 
        (offchain.crtd || 0) / getTokenRate('crtd') +
        (offchain.crac || 0) / getTokenRate('crac') +
        (offchain.crgc || 0) / getTokenRate('crgc') +
        (offchain.creb || 0) / getTokenRate('creb');
    const totalCrny = userWallet.balances.crny + userWallet.balances.fnc + userWallet.balances.crfn + totalCrnyFromOffchain;
    const totalEl = document.getElementById('total-asset-crny');
    if (totalEl) totalEl.textContent = totalCrny.toFixed(2);
    
    // Total offchain points
    const offPtsEl = document.getElementById('total-offchain-pts');
    if (offPtsEl) offPtsEl.textContent = `${totalOffchain.toLocaleString()} pt`;
    
    // Sync badge
    const badge = document.getElementById('wallet-sync-badge');
    if (badge) { badge.style.display = 'inline'; setTimeout(() => badge.style.display = 'none', 3000); }
}

// ========== MATIC (가스비) 기능 ==========

// MATIC 잔액 조회
async function loadMaticBalance() {
    if (!userWallet || !userWallet.walletAddress) return;
    try {
        const weiBalance = await web3.eth.getBalance(userWallet.walletAddress);
        userWallet.maticBalance = parseFloat(web3.utils.fromWei(weiBalance, 'ether'));
        const maticEl = document.getElementById('matic-balance');
        if (maticEl) maticEl.textContent = userWallet.maticBalance.toFixed(4);
        console.log('⟠ MATIC:', userWallet.maticBalance.toFixed(4));
    } catch (e) {
        console.warn('MATIC 잔액 조회 실패:', e.message);
        userWallet.maticBalance = 0;
    }
}

// MATIC 입금 안내 (주소 표시)
function showMaticDeposit() {
    if (!userWallet) { showToast('지갑을 먼저 연결하세요', 'warning'); return; }
    const addr = userWallet.walletAddress;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:white;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;text-align:center;">
            <h3 style="margin-bottom:1rem;">📥 MATIC 입금</h3>
            <p style="font-size:0.85rem;color:#666;margin-bottom:1rem;">아래 Polygon 주소로 MATIC을 보내주세요</p>
            <div style="background:#f5f5f5;padding:1rem;border-radius:10px;margin-bottom:1rem;word-break:break-all;font-family:monospace;font-size:0.82rem;font-weight:600;color:#1a1a2e;cursor:pointer;" onclick="navigator.clipboard&&navigator.clipboard.writeText('${addr}').then(()=>showToast('주소 복사됨','success'))">
                ${addr}
            </div>
            <p style="font-size:0.75rem;color:#c62828;margin-bottom:1rem;">⚠️ 반드시 <strong>Polygon 네트워크</strong>로 전송하세요!<br>다른 네트워크(ETH 등)로 보내면 복구 불가합니다.</p>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="navigator.clipboard&&navigator.clipboard.writeText('${addr}').then(()=>showToast('주소 복사됨','success'))" style="flex:1;padding:0.7rem;background:#1a1a2e;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">📋 주소 복사</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #ddd;border-radius:8px;cursor:pointer;background:white;">닫기</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// MATIC 송금
async function showMaticSend() {
    if (!userWallet) { showToast('지갑을 먼저 연결하세요', 'warning'); return; }
    
    const maticBal = userWallet.maticBalance || 0;
    if (maticBal <= 0) {
        showToast('MATIC 잔액이 없습니다. 먼저 입금해주세요.', 'warning');
        return;
    }
    
    const toAddress = await showPromptModal('MATIC 송금', `잔액: ${maticBal.toFixed(4)} MATIC\n\n받는 주소 (0x...):`);
    if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
        if (toAddress) showToast('유효하지 않은 주소입니다', 'error');
        return;
    }
    
    const amount = await showPromptModal('송금 금액', `${toAddress.slice(0,6)}...${toAddress.slice(-4)} 에게 보낼 MATIC:\n잔액: ${maticBal.toFixed(4)}`);
    if (!amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum >= maticBal) {
        showToast(`유효하지 않은 금액입니다 (잔액: ${maticBal.toFixed(4)} MATIC)`, 'error');
        return;
    }
    
    const confirmed = await showConfirmModal('MATIC 송금 확인', `받는 주소: ${toAddress}\n금액: ${amountNum} MATIC\n\n진행하시겠습니까?`);
    if (!confirmed) return;
    
    try {
        showLoading('MATIC 송금 중...');
        
        const amountWei = web3.utils.toWei(amountNum.toString(), 'ether');
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: userWallet.walletAddress,
            to: toAddress,
            value: amountWei,
            gas: 21000,
            gasPrice: gasPrice
        };
        
        const signedTx = await web3.eth.accounts.signTransaction(tx, userWallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        hideLoading();
        showToast(`MATIC ${amountNum} 송금 완료!`, 'success');
        
        // 잔액 갱신
        await loadMaticBalance();
        
    } catch (error) {
        hideLoading();
        console.error('MATIC 송금 실패:', error);
        showToast('MATIC 송금 실패: ' + error.message, 'error');
    }
}


// ========== 온체인 ERC-20 함수 (web3) ==========
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

// 전체 잔액 새로고침
async function refreshAllBalances() {
    if (!userWallet || !currentUser) { showToast('지갑을 먼저 연결하세요', 'warning'); return; }
    try {
        showLoading('잔액 새로고침 중...');
        await loadRealBalances();
        await loadOffchainBalances();
        await loadMaticBalance();
        updateBalances();
        hideLoading();
        showToast('잔액이 업데이트되었습니다', 'success');
    } catch (e) {
        hideLoading();
        showToast('새로고침 실패: ' + e.message, 'error');
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

