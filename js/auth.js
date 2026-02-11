// ===== auth.js - 회원가입, 로그인, 로그아웃 =====
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

