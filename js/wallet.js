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

