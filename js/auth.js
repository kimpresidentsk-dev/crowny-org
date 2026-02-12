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
        showToast('이메일과 비밀번호를 입력하세요', 'warning');
        return;
    }
    
    if (password.length < 6) {
        showToast('비밀번호는 최소 6자 이상이어야 합니다', 'warning');
        return;
    }
    
    // 기존 Google 계정 존재 여부 체크
    try {
        const methods = await auth.fetchSignInMethodsForEmail(email);
        if (methods.includes('google.com')) {
            showToast('이미 Google로 가입된 이메일입니다. Google 로그인을 이용해주세요.', 'warning');
            return;
        }
    } catch (e) {
        // fetchSignInMethods 실패 시 가입 계속 진행
        console.warn('fetchSignInMethodsForEmail error:', e);
    }
    
    const nickname = await showPromptModal('닉네임', '닉네임을 입력하세요 (SNS에 표시됨)', '');
    if (!nickname || !nickname.trim()) {
        showToast('닉네임은 필수입니다', 'warning');
        return;
    }
    
    const referralCode = await showPromptModal('소개 코드', '소개 코드가 있으면 입력하세요 (없으면 빈칸)', '') || '';
    
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
        
        showToast(`✅ 가입 완료! 닉네임: ${nickname} · 📧 ${email}에서 인증 링크를 확인해주세요.`, 'success');
        
    } catch (error) {
        console.error(error);
        const msg = {
            'auth/email-already-in-use': '이미 사용 중인 이메일입니다',
            'auth/invalid-email': '유효하지 않은 이메일 형식입니다',
            'auth/weak-password': '비밀번호가 너무 약합니다 (최소 6자)'
        }[error.code] || error.message;
        showToast('가입 실패: ' + msg, 'error');
    }
}

// 이메일 로그인
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showToast('이메일과 비밀번호를 입력하세요', 'warning');
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
        showToast('로그인 실패: ' + msg, 'error');
    }
}

// Google 로그인
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        
        // 먼저 팝업으로 Google 계정 선택 (아직 로그인 X)
        // credential만 얻기 위해 signInWithPopup 사용 후 충돌 체크
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const isNewUser = result.additionalUserInfo?.isNewUser;
        
        // 기존 이메일/비밀번호 계정 충돌 체크
        if (isNewUser || result.additionalUserInfo) {
            try {
                const methods = await auth.fetchSignInMethodsForEmail(user.email);
                // 기존 이메일/비밀번호 계정이 있고, Google 계정이 아닌 경우
                if (methods.includes('password') && !methods.includes('google.com')) {
                    // Google 로그인으로 만들어진 계정 삭제 (덮어쓰기 방지)
                    await user.delete();
                    showToast('이미 이메일로 가입된 계정입니다. 이메일/비밀번호로 로그인해주세요.', 'warning');
                    return;
                }
            } catch (e) {
                console.warn('fetchSignInMethodsForEmail error:', e);
            }
        }
        
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
            showToast('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', 'warning');
            return;
        }
        console.error('Google 로그인 실패:', error);
        showToast('Google 로그인 실패: ' + error.message, 'error');
    }
}

// 비밀번호 재설정
async function resetPassword() {
    const email = document.getElementById('login-email').value.trim() || await showPromptModal('비밀번호 재설정', '비밀번호를 재설정할 이메일', '');
    if (!email) return;
    
    try {
        await auth.sendPasswordResetEmail(email);
        showToast(`📧 비밀번호 재설정 링크를 보냈습니다. ${email}을 확인해주세요.`, 'success');
    } catch (error) {
        const msg = {
            'auth/user-not-found': '등록되지 않은 이메일입니다',
            'auth/invalid-email': '유효하지 않은 이메일입니다'
        }[error.code] || error.message;
        showToast('실패: ' + msg, 'error');
    }
}

// 이메일 인증 확인
async function checkEmailVerified() {
    const user = auth.currentUser;
    if (!user) return;
    
    await user.reload();
    if (user.emailVerified) {
        showToast('✅ 이메일 인증 완료!', 'success');
        document.getElementById('verify-email-form').style.display = 'none';
        location.reload();
    } else {
        showToast('아직 인증되지 않았습니다. 이메일의 인증 링크를 클릭해주세요.', 'warning');
    }
}

// 인증 메일 재발송
async function resendVerification() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        await user.sendEmailVerification();
        showToast(`📧 인증 메일을 다시 보냈습니다. ${user.email}을 확인해주세요.`, 'success');
    } catch (error) {
        showToast('재발송 실패: ' + error.message, 'error');
    }
}

// Google 계정 연동 (기존 이메일 계정에 Google 로그인 추가)
async function linkGoogleAccount() {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다', 'warning'); return; }
    
    // 이미 Google 연동 여부 체크
    const hasGoogle = user.providerData.some(p => p.providerId === 'google.com');
    if (hasGoogle) {
        showToast('이미 Google 계정이 연동되어 있습니다', 'info');
        return;
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await user.linkWithPopup(provider);
        
        // Firestore에 provider 업데이트
        await db.collection('users').doc(user.uid).update({
            provider: 'email+google',
            photoURL: user.photoURL || ''
        });
        
        showToast('✅ Google 계정 연동 완료! 이제 Google로도 로그인할 수 있습니다.', 'success');
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        if (error.code === 'auth/credential-already-in-use') {
            showToast('이 Google 계정은 이미 다른 계정에 연결되어 있습니다.', 'error');
            return;
        }
        console.error('Google 연동 실패:', error);
        showToast('Google 연동 실패: ' + error.message, 'error');
    }
}

// Logout
function logout() {
    if (typeof cleanupNotifications === 'function') cleanupNotifications();
    auth.signOut();
    location.reload();
}
