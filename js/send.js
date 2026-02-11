// ===== send.js - 토큰 전송 =====
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

