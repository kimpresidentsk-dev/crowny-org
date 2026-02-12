// ===== auth.js - 회원가입, 로그인, 구글, 이메일인증, 비밀번호 리셋 =====

// 비밀번호 강도 체크 (실시간)
document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('signup-password');
    if (pwInput) {
        pwInput.addEventListener('input', function() {
            const pw = this.value;
            const el = document.getElementById('password-strength');
            if (!el) return;
            if (pw.length === 0) { el.textContent = ''; return; }
            if (pw.length < 6) { el.textContent = '⚠️ 최소 6자 이상'; el.style.color = '#cc0000'; return; }
            let score = 0;
            if (pw.length >= 8) score++;
            if (/[A-Z]/.test(pw)) score++;
            if (/[0-9]/.test(pw)) score++;
            if (/[^A-Za-z0-9]/.test(pw)) score++;
            const labels = ['약함 🔴', '보통 🟡', '좋음 🟢', '강함 💪'];
            const colors = ['#cc0000', '#ff9800', '#4CAF50', '#0066cc'];
            el.textContent = labels[Math.min(score, 3)];
            el.style.color = colors[Math.min(score, 3)];
        });
    }
});

// 이메일 회원가입
async function signup() {
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력하세요');
        return;
    }
    
    if (password.length < 6) {
        alert('비밀번호는 최소 6자 이상이어야 합니다');
        return;
    }
    
    const nickname = prompt('닉네임을 입력하세요 (SNS에 표시됨):');
    if (!nickname || !nickname.trim()) {
        alert('닉네임은 필수입니다');
        return;
    }
    
    const referralCode = prompt('소개 코드가 있으면 입력하세요 (없으면 빈칸):') || '';
    
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // 이메일 인증 발송
        await result.user.sendEmailVerification();
        
        // Create wallet
        const wallet = web3.eth.accounts.create();
        
        // Save to Firestore
        await db.collection('users').doc(result.user.uid).set({
            email: email,
            nickname: nickname.trim(),
            walletAddress: wallet.address,
            privateKey: wallet.privateKey,
            adminLevel: -1,
            balances: { crny: 0, fnc: 0, crfn: 0 },
            offchainBalances: { crtd: 0, crac: 0, crgc: 0, creb: 0 },
            createdAt: new Date(),
            provider: 'email'
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
        
        // 소개 코드 적용
        if (referralCode.trim() && typeof applyReferralCode === 'function') {
            await applyReferralCode(result.user.uid, referralCode.trim());
        }
        
        alert(`✅ 가입 완료!\n닉네임: ${nickname}\n지갑 생성 완료!\n\n📧 이메일 인증 링크를 보냈습니다.\n${email}을 확인해주세요.`);
        
    } catch (error) {
        console.error(error);
        const msg = {
            'auth/email-already-in-use': '이미 사용 중인 이메일입니다',
            'auth/invalid-email': '유효하지 않은 이메일 형식입니다',
            'auth/weak-password': '비밀번호가 너무 약합니다 (최소 6자)'
        }[error.code] || error.message;
        alert('가입 실패: ' + msg);
    }
}

// 이메일 로그인
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력하세요');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        const msg = {
            'auth/user-not-found': '등록되지 않은 이메일입니다',
            'auth/wrong-password': '비밀번호가 틀립니다',
            'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다',
            'auth/too-many-requests': '너무 많은 시도. 잠시 후 다시 시도해주세요'
        }[error.code] || error.message;
        alert('로그인 실패: ' + msg);
    }
}

// Google 로그인
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const isNewUser = result.additionalUserInfo?.isNewUser;
        
        if (isNewUser) {
            // 신규 가입 → Firestore 프로필 + 지갑 생성
            const wallet = web3.eth.accounts.create();
            const nickname = user.displayName || user.email.split('@')[0];
            
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                nickname: nickname,
                walletAddress: wallet.address,
                privateKey: wallet.privateKey,
                adminLevel: -1,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                offchainBalances: { crtd: 0, crac: 0, crgc: 0, creb: 0 },
                photoURL: user.photoURL || '',
                createdAt: new Date(),
                provider: 'google'
            });
            
            await db.collection('users').doc(user.uid)
                .collection('wallets').add({
                    name: '크라우니 지갑 1',
                    walletAddress: wallet.address,
                    privateKey: wallet.privateKey,
                    isImported: false,
                    totalGasSubsidy: 0,
                    balances: { crny: 0, fnc: 0, crfn: 0 },
                    createdAt: new Date()
                });
            
            console.log('✅ Google 신규 가입:', user.email);
        } else {
            console.log('✅ Google 로그인:', user.email);
        }
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        if (error.code === 'auth/popup-blocked') {
            alert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
            return;
        }
        console.error('Google 로그인 실패:', error);
        alert('Google 로그인 실패: ' + error.message);
    }
}

// 비밀번호 재설정
async function resetPassword() {
    const email = document.getElementById('login-email').value.trim() || prompt('비밀번호를 재설정할 이메일:');
    if (!email) return;
    
    try {
        await auth.sendPasswordResetEmail(email);
        alert(`📧 비밀번호 재설정 링크를 보냈습니다.\n${email}을 확인해주세요.`);
    } catch (error) {
        const msg = {
            'auth/user-not-found': '등록되지 않은 이메일입니다',
            'auth/invalid-email': '유효하지 않은 이메일입니다'
        }[error.code] || error.message;
        alert('실패: ' + msg);
    }
}

// 이메일 인증 확인
async function checkEmailVerified() {
    const user = auth.currentUser;
    if (!user) return;
    
    await user.reload();
    if (user.emailVerified) {
        alert('✅ 이메일 인증 완료!');
        document.getElementById('verify-email-form').style.display = 'none';
        location.reload();
    } else {
        alert('아직 인증되지 않았습니다.\n이메일의 인증 링크를 클릭해주세요.');
    }
}

// 인증 메일 재발송
async function resendVerification() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        await user.sendEmailVerification();
        alert(`📧 인증 메일을 다시 보냈습니다.\n${user.email}을 확인해주세요.`);
    } catch (error) {
        alert('재발송 실패: ' + error.message);
    }
}

// Logout
function logout() {
    auth.signOut();
    location.reload();
}
