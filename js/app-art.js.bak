// ============================================================
// CROWNY ART MODULE — js/app-art.js v1.1
// Thirdweb NFT (ERC-721 / ERC-1155) + Firebase Storage Hybrid
// ============================================================
//
// 로드 순서: config → ui → auth → wallet → offchain → social
//            → send → admin → marketplace → trading → ★ app-art
//
// 외부 의존성 (HANDOFF_TO_ART.md 참고):
//   currentUser, userWallet   ← config.js
//   db                        ← index.html (window.db)
//   loadUserWallet()          ← wallet.js
//   earnOffchainPoints()      ← offchain.js
//   distributeReferralReward()← social.js
//   window.tw5                ← index.html <script type="module">
//   firebase.storage()        ← Firebase Storage SDK
// ============================================================

const ART_VERSION = '1.1.0';

// ─── CONFIG ───
const ART_CONFIG = {
    thirdwebClientId: '26c044bdfa2f575538d00945419126bf',

    // Polygon Mainnet
    chainId: 137,
    chainSlug: 'polygon',

    // NFT 컬렉션 — Thirdweb 대시보드에서 배포 후 주소 입력
    contracts: {
        erc721: '',   // CROWNY ART (1/1 유니크)
        erc1155: ''   // CROWNY EDITIONS (에디션)
    },

    // Admin wallet (기존 CRNY Admin 동일)
    adminWallet: '0x24ed2F4babDceA75579CDD358c1b6Ea56D9Ac75E',

    defaultRoyaltyPercent: 10,
    maxImageSize: 1200,
    thumbnailSize: 400,
    storagePath: 'artworks',
    ipfsGateway: 'https://ipfs.io/ipfs/',
    donationMinCRFN: 10,
    platformFeePercent: 2.5
};

// ─── CATEGORIES (확장) ───
const ART_CATEGORIES = {
    painting:     '🖌️ 회화',
    digital:      '💻 디지털 아트',
    photo:        '📷 사진',
    sculpture:    '🗿 조각/설치',
    illustration: '✏️ 일러스트',
    calligraphy:  '🖋️ 서예/캘리',
    mixed:        '🎭 혼합 매체',
    ai:           '🤖 AI 아트',
    music:        '🎵 뮤직/사운드',
    video:        '🎬 비디오 아트',
    generative:   '🌀 제너러티브',
    kpop:         '💜 K-팝 굿즈',
    other:        '🎨 기타'
};

// ─── MODULE STATE ───
let artModuleReady = false;
let tw5SDK = null;
let erc721Contract = null;
let erc1155Contract = null;
let storageSDK = null;
let firebaseStorage = null;


// ============================================================
// 1. 초기화
// ============================================================

async function initArtModule() {
    console.log('🎨 [ART] Initializing v' + ART_VERSION);

    // Firebase Storage
    try {
        if (typeof firebase !== 'undefined' && firebase.storage) {
            firebaseStorage = firebase.storage();
            console.log('🎨 [ART] Firebase Storage ✅');
        } else {
            console.warn('🎨 [ART] Firebase Storage not loaded — Base64 fallback');
        }
    } catch (e) {
        console.warn('🎨 [ART] Firebase Storage init failed:', e.message);
    }

    // Thirdweb SDK (index.html module 블록에서 window.tw5 바인딩)
    try {
        if (window.tw5) {
            tw5SDK = window.tw5;

            if (ART_CONFIG.contracts.erc721) {
                erc721Contract = await tw5SDK.getContract(ART_CONFIG.contracts.erc721);
                console.log('🎨 [ART] ERC-721 ✅', ART_CONFIG.contracts.erc721);
            }
            if (ART_CONFIG.contracts.erc1155) {
                erc1155Contract = await tw5SDK.getContract(ART_CONFIG.contracts.erc1155);
                console.log('🎨 [ART] ERC-1155 ✅', ART_CONFIG.contracts.erc1155);
            }
            if (tw5SDK.storage) {
                storageSDK = tw5SDK.storage;
                console.log('🎨 [ART] IPFS Storage ✅');
            }
        } else {
            console.warn('🎨 [ART] Thirdweb SDK not ready — NFT features disabled');
        }
    } catch (e) {
        console.warn('🎨 [ART] Thirdweb init partial:', e.message);
    }

    artModuleReady = true;
    console.log('🎨 [ART] Module Ready ✅');
}

// app-art.js는 마지막에 로드 → DOMContentLoaded 후 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initArtModule, 1500));
} else {
    setTimeout(initArtModule, 1500);
}


// ============================================================
// 2. 이미지 업로드 — Firebase Storage + IPFS 하이브리드
// ============================================================

async function uploadToFirebaseStorage(file, artworkId) {
    if (!firebaseStorage) {
        // fallback: Base64
        const dataUrl = await _fileToDataUrl(file);
        const resized = await _resizeImageData(dataUrl, ART_CONFIG.maxImageSize);
        const thumb = await _resizeImageData(dataUrl, ART_CONFIG.thumbnailSize);
        return { firebaseUrl: resized, thumbnailUrl: thumb, isBase64: true };
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const path = `${ART_CONFIG.storagePath}/${artworkId || timestamp}`;

    // 원본 (리사이즈)
    const resizedBlob = await _resizeFileToBlob(file, ART_CONFIG.maxImageSize);
    const mainRef = firebaseStorage.ref(`${path}/main.${ext}`);
    await mainRef.put(resizedBlob, { contentType: file.type || 'image/jpeg' });
    const firebaseUrl = await mainRef.getDownloadURL();

    // 썸네일
    const thumbBlob = await _resizeFileToBlob(file, ART_CONFIG.thumbnailSize);
    const thumbRef = firebaseStorage.ref(`${path}/thumb.${ext}`);
    await thumbRef.put(thumbBlob, { contentType: file.type || 'image/jpeg' });
    const thumbnailUrl = await thumbRef.getDownloadURL();

    return { firebaseUrl, thumbnailUrl, isBase64: false };
}

async function uploadToIPFS(file) {
    if (!storageSDK) throw new Error('Thirdweb Storage 미초기화. NFT 민팅 불가.');
    const uri = await storageSDK.upload(file);
    console.log('🎨 [IPFS] Uploaded:', uri);
    return uri;
}

async function uploadMetadataToIPFS(metadata) {
    if (!storageSDK) throw new Error('Thirdweb Storage 미초기화');
    const uri = await storageSDK.upload(metadata);
    console.log('🎨 [IPFS] Metadata:', uri);
    return uri;
}

function ipfsToHttp(ipfsUri) {
    if (!ipfsUri) return '';
    if (ipfsUri.startsWith('http')) return ipfsUri;
    return ipfsUri.replace('ipfs://', ART_CONFIG.ipfsGateway);
}


// ============================================================
// 3. 이미지 유틸리티 (자체 포함 — marketplace.js와 독립)
// ============================================================

function _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function _resizeImageData(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = dataUrl;
    });
}

function _resizeFileToBlob(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                    else { w = Math.round(w * maxSize / h); h = maxSize; }
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


// ============================================================
// 4. 작품 등록
// ============================================================

function toggleArtSaleOptions() {
    const type = document.getElementById('art-sale-type')?.value;
    const priceEl = document.getElementById('art-price-section');
    const auctionEl = document.getElementById('art-auction-section');
    if (priceEl) priceEl.style.display = (type === 'fixed') ? 'block' : 'none';
    if (auctionEl) auctionEl.style.display = (type === 'auction') ? 'block' : 'none';
}

function toggleNFTOptions() {
    const mintNFT = document.getElementById('art-mint-nft')?.checked;
    const nftOpts = document.getElementById('art-nft-options');
    if (nftOpts) nftOpts.style.display = mintNFT ? 'block' : 'none';
}

async function uploadArtwork() {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }

    const title       = document.getElementById('art-title')?.value.trim();
    const description = document.getElementById('art-description')?.value.trim();
    const category    = document.getElementById('art-category')?.value;
    const saleType    = document.getElementById('art-sale-type')?.value;
    const imageFile   = document.getElementById('art-image')?.files?.[0];
    const mintNFT     = document.getElementById('art-mint-nft')?.checked || false;

    if (!title)     { showToast('작품 제목을 입력하세요', 'warning'); return; }
    if (!imageFile) { showToast('작품 이미지를 선택하세요', 'warning'); return; }

    const nftType       = document.getElementById('art-nft-type')?.value || 'erc721';
    const editionCount  = parseInt(document.getElementById('art-edition-count')?.value) || 1;
    const royaltyPercent = parseInt(document.getElementById('art-royalty')?.value) || ART_CONFIG.defaultRoyaltyPercent;

    const statusEl = document.getElementById('art-upload-status');
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    try {
        setStatus('⏳ 이미지 업로드 중...');
        const tempId = `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        // Firebase Storage 업로드
        const { firebaseUrl, thumbnailUrl, isBase64 } = await uploadToFirebaseStorage(imageFile, tempId);
        setStatus('✅ 이미지 업로드 완료');

        // 유저 정보 (config.js의 currentUser 사용)
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const artistNickname = userDoc.exists ? (userDoc.data().nickname || '') : '';
        const artistWallet   = userDoc.exists ? (userDoc.data().polygonAddress || '') : '';

        const artwork = {
            title, description, category, saleType,
            artistId: currentUser.uid,
            artistEmail: currentUser.email,
            artistNickname, artistWallet,
            likes: 0, views: 0, status: 'active',
            createdAt: new Date(),

            // 이미지 (Firebase URL 또는 Base64 fallback)
            imageUrl: firebaseUrl,
            thumbnailUrl: thumbnailUrl || firebaseUrl,
            isBase64: isBase64 || false,
            // 하위 호환: 기존 코드에서 imageData 참조
            imageData: isBase64 ? firebaseUrl : thumbnailUrl,

            // NFT 관련 (초기값)
            isNFT: false,
            nftTokenId: null, nftContract: null, nftType: null,
            ipfsImageUri: null, ipfsMetadataUri: null,
            editionCount: 1, editionsMinted: 0,
            royaltyPercent
        };

        // 판매 유형별
        if (saleType === 'fixed') {
            artwork.price = parseFloat(document.getElementById('art-price')?.value) || 0;
            artwork.priceToken = document.getElementById('art-price-token')?.value || 'CRNY';
        } else if (saleType === 'auction') {
            artwork.startPrice = parseFloat(document.getElementById('art-start-price')?.value) || 1;
            artwork.currentBid = 0;
            artwork.highestBidder = null;
            artwork.priceToken = 'CRNY';
            const hours = parseInt(document.getElementById('art-auction-hours')?.value) || 24;
            artwork.auctionEnd = new Date(Date.now() + hours * 3600000);
        }

        // Firestore 저장
        setStatus('💾 작품 정보 저장 중...');
        const artDocRef = await db.collection('artworks').add(artwork);
        const artworkId = artDocRef.id;

        // NFT 민팅 (선택 시)
        if (mintNFT) {
            setStatus('🔗 NFT 민팅 준비 중...');
            try {
                const nftResult = await mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent);
                await artDocRef.update({
                    isNFT: true,
                    nftTokenId: nftResult.tokenId,
                    nftContract: nftResult.contractAddress,
                    nftType,
                    ipfsImageUri: nftResult.ipfsImageUri,
                    ipfsMetadataUri: nftResult.ipfsMetadataUri,
                    editionCount: nftType === 'erc1155' ? editionCount : 1,
                    mintTxHash: nftResult.txHash || null
                });
                setStatus('🎉 NFT 민팅 완료!');
            } catch (nftErr) {
                console.error('🎨 [NFT] Mint failed:', nftErr);
                setStatus('⚠️ 작품 등록됨 (NFT 민팅 실패: ' + nftErr.message + ')');
            }
        }

        // 아티스트 프로필 업데이트
        await _updateArtistProfile(currentUser.uid, {
            totalWorks: firebase.firestore.FieldValue.increment(1),
            lastUpload: new Date()
        });

        showToast(`🎨 "${title}" 등록 완료!${mintNFT ? ' (NFT ✅)' : ''}`, 'success');
        _resetArtForm();
        loadArtGallery();

    } catch (error) {
        console.error('🎨 [Upload] Error:', error);
        setStatus('❌ 등록 실패: ' + error.message);
        showToast('등록 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 5. NFT 민팅 — Thirdweb SDK
// ============================================================

async function mintArtworkNFT(artworkId, artwork, imageFile, nftType, editionCount, royaltyPercent) {
    if (!tw5SDK) throw new Error('Thirdweb SDK 미초기화');

    const contract = nftType === 'erc721' ? erc721Contract : erc1155Contract;
    if (!contract) {
        throw new Error(`${nftType.toUpperCase()} 컨트랙트 미설정. ART_CONFIG.contracts 확인.`);
    }

    // MetaMask
    if (!window.ethereum) throw new Error('MetaMask가 필요합니다');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const walletAddress = accounts[0];

    // 이미지 → IPFS
    console.log('🎨 [NFT] Uploading image to IPFS...');
    const ipfsImageUri = await uploadToIPFS(imageFile);

    // 메타데이터
    const metadata = {
        name: artwork.title,
        description: artwork.description || '',
        image: ipfsImageUri,
        external_url: `https://crowny.org/art/${artworkId}`,
        attributes: [
            { trait_type: 'Category', value: ART_CATEGORIES[artwork.category] || artwork.category },
            { trait_type: 'Artist', value: artwork.artistNickname || artwork.artistEmail },
            { trait_type: 'Platform', value: 'CROWNY' },
            { trait_type: 'Created', value: new Date().toISOString().split('T')[0] }
        ],
        properties: {
            artworkId, artistId: artwork.artistId,
            royaltyPercent, category: artwork.category,
            platform: 'CROWNY', chainId: ART_CONFIG.chainId
        }
    };

    // 메타데이터 → IPFS
    console.log('🎨 [NFT] Uploading metadata to IPFS...');
    const ipfsMetadataUri = await uploadMetadataToIPFS(metadata);

    // 온체인 민팅
    console.log('🎨 [NFT] Minting on-chain...');
    let result;
    if (nftType === 'erc721') {
        result = await contract.erc721.mintTo(walletAddress, {
            name: artwork.title, description: artwork.description,
            image: ipfsImageUri, external_url: metadata.external_url,
            attributes: metadata.attributes
        });
    } else {
        result = await contract.erc1155.mintTo(walletAddress, {
            metadata: {
                name: artwork.title, description: artwork.description,
                image: ipfsImageUri, external_url: metadata.external_url,
                attributes: metadata.attributes
            },
            supply: editionCount
        });
    }

    const tokenId = result.id?.toString() || result.tokenId?.toString() || '0';
    const txHash = result.receipt?.transactionHash || null;
    const contractAddress = nftType === 'erc721' ? ART_CONFIG.contracts.erc721 : ART_CONFIG.contracts.erc1155;

    console.log(`🎨 [NFT] Minted! Token #${tokenId}, TX: ${txHash}`);

    // Firestore에 NFT 레코드 (별도 컬렉션)
    await db.collection('nft_records').add({
        artworkId, tokenId: parseInt(tokenId), contractAddress, nftType,
        ownerWallet: walletAddress, ownerUserId: currentUser.uid,
        minterUserId: currentUser.uid, minterWallet: walletAddress,
        ipfsImageUri, ipfsMetadataUri,
        editionCount: nftType === 'erc1155' ? editionCount : 1,
        royaltyPercent, txHash, chainId: ART_CONFIG.chainId,
        mintedAt: new Date(), status: 'minted'
    });

    return { tokenId: parseInt(tokenId), contractAddress, ipfsImageUri, ipfsMetadataUri, txHash };
}

/**
 * 기존 작품 → 사후 NFT 민팅
 */
async function mintExistingArtwork(artworkId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    try {
        const artDoc = await db.collection('artworks').doc(artworkId).get();
        if (!artDoc.exists) { showToast('작품을 찾을 수 없습니다', 'warning'); return; }

        const art = artDoc.data();
        if (art.artistId !== currentUser.uid) { showToast('본인 작품만 NFT로 민팅 가능', 'warning'); return; }
        if (art.isNFT) { showToast('이미 NFT로 민팅된 작품', 'info'); return; }

        const choice = await showPromptModal('NFT 타입', 'NFT 타입:\n1) ERC-721 (유니크 1/1)\n2) ERC-1155 (에디션)', '1');
        const type = choice === '2' ? 'erc1155' : 'erc721';
        let editionCount = 1;
        if (type === 'erc1155') {
            const edInput = await showPromptModal('에디션 수량', '에디션 수량을 입력하세요:', '10');
            editionCount = parseInt(edInput) || 10;
        }

        // 이미지 Blob 확보
        let imageBlob;
        if (art.imageUrl && !art.isBase64) {
            imageBlob = await (await fetch(art.imageUrl)).blob();
        } else if (art.imageData) {
            imageBlob = await (await fetch(art.imageData)).blob();
        } else {
            showToast('이미지를 찾을 수 없습니다', 'error'); return;
        }

        const imageFile = new File([imageBlob], `${artworkId}.jpg`, { type: 'image/jpeg' });
        showToast('MetaMask에서 트랜잭션을 승인해주세요.', 'info');

        const result = await mintArtworkNFT(
            artworkId, art, imageFile, type, editionCount,
            art.royaltyPercent || ART_CONFIG.defaultRoyaltyPercent
        );

        await db.collection('artworks').doc(artworkId).update({
            isNFT: true, nftTokenId: result.tokenId,
            nftContract: result.contractAddress, nftType: type,
            ipfsImageUri: result.ipfsImageUri, ipfsMetadataUri: result.ipfsMetadataUri,
            editionCount: type === 'erc1155' ? editionCount : 1,
            mintTxHash: result.txHash
        });

        showToast(`🎉 NFT 민팅 완료! Token #${result.tokenId}`, 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        viewArtwork(artworkId);

    } catch (error) {
        showToast('NFT 민팅 실패: ' + error.message, 'error');
        console.error('🎨 [NFT] Mint existing failed:', error);
    }
}


// ============================================================
// 6. 갤러리
// ============================================================

async function loadArtGallery() {
    const container = document.getElementById('art-gallery');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">🎨 로딩 중...</p>';

    try {
        const filterCat  = document.getElementById('art-filter-category')?.value || 'all';
        const filterSort = document.getElementById('art-filter-sort')?.value || 'newest';
        const filterNFT  = document.getElementById('art-filter-nft')?.value || 'all';

        let query = db.collection('artworks').where('status', '==', 'active');
        if (filterCat !== 'all') query = query.where('category', '==', filterCat);

        if (filterSort === 'popular') query = query.orderBy('likes', 'desc');
        else query = query.orderBy('createdAt', 'desc');

        let snapshot;
        try {
            snapshot = await query.limit(40).get();
        } catch (indexError) {
            console.warn('Composite index missing, falling back to simple query:', indexError.message);
            query = db.collection('artworks').where('status', '==', 'active').orderBy('createdAt', 'desc');
            snapshot = await query.limit(40).get();
        }

        if (snapshot.empty) {
            container.innerHTML = '<p style="text-align:center; color:var(--accent); grid-column:1/-1;">아직 등록된 작품이 없습니다. 첫 작품을 등록해보세요! 🎨</p>';
            return;
        }

        let items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

        // 클라이언트 필터
        if (filterNFT === 'nft')     items = items.filter(a => a.isNFT);
        if (filterNFT === 'non-nft') items = items.filter(a => !a.isNFT);

        if (filterSort === 'price-low')  items.sort((a, b) => (a.price || 0) - (b.price || 0));
        if (filterSort === 'price-high') items.sort((a, b) => (b.price || 0) - (a.price || 0));
        if (filterSort === 'auction')    items = items.filter(a => a.saleType === 'auction');

        container.innerHTML = items.map(art => _renderArtCard(art)).join('');
    } catch (error) {
        container.innerHTML = `<p style="color:red; grid-column:1/-1;">로드 실패: ${error.message}</p>`;
    }
}

function _renderArtCard(art) {
    const catLabel = ART_CATEGORIES[art.category] || '🎨';
    const imgSrc = art.thumbnailUrl || art.imageUrl || art.imageData || '';

    let nftBadge = '';
    if (art.isNFT) {
        const typeLabel = art.nftType === 'erc1155' ? `Ed.×${art.editionCount || '?'}` : '1/1';
        nftBadge = `<div style="position:absolute;top:6px;right:6px;background:rgba(138,43,226,0.9);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:700;backdrop-filter:blur(4px)">🔗 NFT · ${typeLabel}</div>`;
    }

    let priceLabel = '';
    if (art.saleType === 'fixed') {
        priceLabel = `<span style="color:#0066cc;font-weight:700">${art.price} ${art.priceToken}</span>`;
    } else if (art.saleType === 'auction') {
        const endMs = art.auctionEnd?.seconds ? art.auctionEnd.seconds * 1000 : art.auctionEnd;
        const ended = endMs && new Date(endMs) < new Date();
        priceLabel = ended
            ? '<span style="color:#cc0000">경매 종료</span>'
            : `<span style="color:#ff9800">🔨 ${art.currentBid || art.startPrice} CRNY</span>`;
    } else {
        priceLabel = '<span style="color:var(--accent)">전시 중</span>';
    }

    return `
        <div onclick="viewArtwork('${art.id}')" style="position:relative;background:#fff;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);transition:transform .2s" onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''">
            ${nftBadge}
            <div style="width:100%;height:170px;overflow:hidden;background:#f0f0f0">
                <img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover" alt="${art.title}" loading="lazy">
            </div>
            <div style="padding:.6rem">
                <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${art.title}</div>
                <div style="font-size:.7rem;color:var(--accent);margin:.2rem 0">${catLabel} · ${art.artistNickname || '익명'}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.3rem">
                    ${priceLabel}
                    <span style="font-size:.7rem;color:var(--accent)">❤️ ${art.likes || 0}</span>
                </div>
            </div>
        </div>`;
}


// ============================================================
// 7. 작품 상세보기
// ============================================================

async function viewArtwork(artId) {
    try {
        const doc = await db.collection('artworks').doc(artId).get();
        if (!doc.exists) { showToast('작품을 찾을 수 없습니다', 'warning'); return; }
        const art = doc.data();

        // 조회수 (fire-and-forget)
        db.collection('artworks').doc(artId).update({ views: (art.views || 0) + 1 }).catch(() => {});

        const catLabel = ART_CATEGORIES[art.category] || '🎨';
        const isOwner  = currentUser && art.artistId === currentUser.uid;
        const imgSrc   = art.imageUrl || art.imageData || '';

        // ── NFT 정보 패널 ──
        let nftInfoHtml = '';
        if (art.isNFT) {
            const typeLabel = art.nftType === 'erc1155' ? `ERC-1155 (Ed.×${art.editionCount})` : 'ERC-721 (1/1)';
            const cShort = art.nftContract ? `${art.nftContract.slice(0,6)}…${art.nftContract.slice(-4)}` : '—';
            const scanUrl = `https://polygonscan.com/token/${art.nftContract}?a=${art.nftTokenId}`;
            const ipfsUrl = art.ipfsImageUri ? ipfsToHttp(art.ipfsImageUri) : null;

            nftInfoHtml = `
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:.8rem;border-radius:8px;margin-bottom:1rem;color:#fff">
                    <div style="font-weight:700;margin-bottom:.4rem">🔗 NFT 인증</div>
                    <div style="font-size:.78rem;display:grid;gap:.2rem">
                        <div>타입: ${typeLabel}</div>
                        <div>Token ID: #${art.nftTokenId}</div>
                        <div>컨트랙트: <a href="${scanUrl}" target="_blank" style="color:#fff;text-decoration:underline">${cShort}</a></div>
                        <div>로열티: ${art.royaltyPercent || 10}%</div>
                        ${ipfsUrl ? `<div>IPFS: <a href="${ipfsUrl}" target="_blank" style="color:#fff;text-decoration:underline">원본 보기</a></div>` : ''}
                        ${art.mintTxHash ? `<div>TX: <a href="https://polygonscan.com/tx/${art.mintTxHash}" target="_blank" style="color:#fff;text-decoration:underline">${art.mintTxHash.slice(0,10)}…</a></div>` : ''}
                    </div>
                </div>`;
        }

        // ── 액션 버튼 ──
        let actionHtml = '';
        if (art.saleType === 'fixed' && !isOwner) {
            actionHtml = `<button onclick="buyArtwork('${artId}')" style="background:#0066cc;color:#fff;border:none;padding:.8rem 2rem;border-radius:8px;cursor:pointer;font-weight:700;width:100%">💰 ${art.price} ${art.priceToken}로 구매</button>`;
        } else if (art.saleType === 'auction' && !isOwner) {
            const curBid = art.currentBid || art.startPrice || 1;
            const minBid = curBid + 1;
            actionHtml = `
                <div style="display:flex;gap:.5rem">
                    <input type="number" id="bid-amount-${artId}" value="${minBid}" min="${minBid}" style="flex:1;padding:.7rem;border:1px solid var(--border);border-radius:6px">
                    <button onclick="placeBid('${artId}')" style="background:#ff9800;color:#fff;border:none;padding:.8rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:700">🔨 입찰</button>
                </div>
                <p style="font-size:.75rem;color:var(--accent);margin-top:.3rem">현재 최고: ${curBid} CRNY${art.highestBidderNickname ? ' (' + art.highestBidderNickname + ')' : ''}</p>`;
        }

        if (isOwner) {
            actionHtml = '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
            if (!art.isNFT) {
                actionHtml += `<button onclick="mintExistingArtwork('${artId}')" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem;flex:1">🔗 NFT 민팅</button>`;
            }
            actionHtml += `<button onclick="deleteArtwork('${artId}')" style="background:#cc0000;color:#fff;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem">🗑️ 삭제</button></div>`;
        }

        // ── 모달 ──
        const modal = document.createElement('div');
        modal.id = 'art-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.88);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;position:relative">
                <button onclick="document.getElementById('art-modal').remove()" style="position:absolute;top:10px;right:12px;background:rgba(0,0,0,.5);color:#fff;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;z-index:1">✕</button>
                <img src="${imgSrc}" style="width:100%;border-radius:12px 12px 0 0;max-height:50vh;object-fit:contain;background:#f0f0f0">
                <div style="padding:1.2rem">
                    <h3 style="margin-bottom:.5rem">${art.title}</h3>
                    <div style="font-size:.85rem;color:var(--accent);margin-bottom:.8rem">
                        ${catLabel} · 🎨 <span onclick="viewArtistProfile('${art.artistId}')" style="cursor:pointer;text-decoration:underline">${art.artistNickname || '익명'}</span> · 👁️ ${(art.views||0)+1} · ❤️ ${art.likes||0}
                    </div>
                    ${art.description ? `<p style="font-size:.9rem;line-height:1.6;margin-bottom:1rem;color:#333">${art.description}</p>` : ''}
                    ${nftInfoHtml}
                    <div style="display:flex;gap:.5rem;margin-bottom:1rem">
                        <button onclick="likeArtwork('${artId}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer">❤️ 좋아요</button>
                        <button onclick="shareArtwork('${artId}','${art.title.replace(/'/g, "\\'")}')" style="background:var(--bg);border:1px solid var(--border);padding:.5rem 1rem;border-radius:6px;cursor:pointer">🔗 공유</button>
                    </div>
                    ${actionHtml}
                </div>
            </div>`;

        document.body.appendChild(modal);
    } catch (error) {
        showToast('작품 로드 실패: ' + error.message, 'error');
    }
}


// ============================================================
// 8. 좋아요 / 공유 / 삭제
// ============================================================

async function likeArtwork(artId) {
    if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
    try {
        const likeRef = db.collection('artworks').doc(artId).collection('likes').doc(currentUser.uid);
        if ((await likeRef.get()).exists) { showToast('이미 좋아요 한 작품입니다', 'info'); return; }

        await likeRef.set({ userId: currentUser.uid, timestamp: new Date() });
        await db.collection('artworks').doc(artId).update({
            likes: firebase.firestore.FieldValue.increment(1)
        });
        showToast('❤️ 좋아요!', 'success');
    } catch (e) { console.error('🎨 [Like]', e); }
}

function shareArtwork(artId, title) {
    const url = `https://crowny.org/art/${artId}`;
    if (navigator.share) {
        navigator.share({ title: `CROWNY ART: ${title}`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('🔗 링크 복사됨!', 'success')).catch(() => {});
    }
}

async function deleteArtwork(artId) {
    const confirmed = await showConfirmModal('작품 삭제', '작품을 삭제하시겠습니까?\n(NFT는 온체인에 남아있습니다)');
    if (!confirmed) return;
    try {
        await db.collection('artworks').doc(artId).update({ status: 'deleted' });
        showToast('🗑️ 삭제 완료', 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
    } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
}


// ============================================================
// 9. 구매 / 경매 — 로열티 + 기부
// ============================================================

async function buyArtwork(artId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();
        if (art.status !== 'active') { showToast('이미 판매된 작품', 'warning'); return; }

        const tokenKey = art.priceToken.toLowerCase();
        const isOffchain = typeof isOffchainToken === 'function' && isOffchainToken(tokenKey);

        // 잔액 확인
        let walletDoc; // used for on-chain path
        if (isOffchain) {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const offBal = userDoc.data()?.offchainBalances?.[tokenKey] || 0;
            if (offBal < art.price) {
                showToast(`${art.priceToken} 잔액 부족. 보유: ${offBal}, 필요: ${art.price}`, 'warning');
                return;
            }
        } else {
            const wallets = await db.collection('users').doc(currentUser.uid)
                .collection('wallets').limit(1).get();
            if (wallets.empty) { showToast('지갑이 없습니다', 'warning'); return; }
            walletDoc = wallets.docs[0];
            const balances = walletDoc.data().balances || {};
            if ((balances[tokenKey] || 0) < art.price) {
                showToast(`${art.priceToken} 잔액 부족. 보유: ${balances[tokenKey]||0}, 필요: ${art.price}`, 'warning');
                return;
            }
        }

        const confirmBuy = await showConfirmModal('작품 구매', `"${art.title}"\n\n${art.price} ${art.priceToken}로 구매하시겠습니까?${art.isNFT ? '\n\n🔗 NFT 소유권이 이전됩니다' : ''}`);
        if (!confirmBuy) return;

        // 수수료
        const platformFee   = art.price * (ART_CONFIG.platformFeePercent / 100);
        const artistReceive = art.price - platformFee;

        if (isOffchain) {
            // 구매자 차감
            const spent = await spendOffchainPoints(tokenKey, art.price, `아트 구매: ${art.title}`);
            if (!spent) return;
            // 판매자 입금 (direct Firestore)
            const sellerDoc = await db.collection('users').doc(art.artistId).get();
            const sellerOff = sellerDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(art.artistId).update({
                [`offchainBalances.${tokenKey}`]: (sellerOff[tokenKey] || 0) + artistReceive
            });
        } else {
            // 구매자 차감
            const balances = walletDoc.data().balances || {};
            await walletDoc.ref.update({ [`balances.${tokenKey}`]: balances[tokenKey] - art.price });
            // 판매자 입금
            const sellerWallets = await db.collection('users').doc(art.artistId)
                .collection('wallets').limit(1).get();
            if (!sellerWallets.empty) {
                const sw = sellerWallets.docs[0];
                const sb = sw.data().balances || {};
                await sw.ref.update({ [`balances.${tokenKey}`]: (sb[tokenKey] || 0) + artistReceive });
            }
        }

        // 상태 변경
        await db.collection('artworks').doc(artId).update({
            status: 'sold', buyerId: currentUser.uid,
            buyerEmail: currentUser.email, soldAt: new Date(),
            soldPrice: art.price, soldToken: art.priceToken
        });

        // 거래 기록 (별도 컬렉션)
        await db.collection('art_transactions').add({
            artworkId: artId, artworkTitle: art.title,
            from: currentUser.uid, to: art.artistId,
            amount: art.price, artistReceive, platformFee,
            token: art.priceToken, isNFT: art.isNFT || false,
            nftTokenId: art.nftTokenId || null,
            type: 'art_purchase', timestamp: new Date()
        });

        // 기부 자동 (CRFN 10+)
        await _artDonationAuto(currentUser.uid, art.price, art.priceToken);

        // 소개자 수수료 (social.js)
        if (typeof distributeReferralReward === 'function') {
            await distributeReferralReward(currentUser.uid, art.price, art.priceToken);
        }

        // 아티스트 프로필
        await _updateArtistProfile(art.artistId, {
            totalSales: firebase.firestore.FieldValue.increment(1),
            totalRevenue: firebase.firestore.FieldValue.increment(artistReceive)
        });

        showToast(`🎉 "${art.title}" 구매 완료!${art.isNFT ? ' 🔗 NFT 소유권 이전됨' : ''}`, 'success');

        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
        // wallet.js의 함수
        if (typeof loadUserWallet === 'function') loadUserWallet();

    } catch (error) {
        showToast('구매 실패: ' + error.message, 'error');
    }
}

async function placeBid(artId) {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }

    const bidInput = document.getElementById(`bid-amount-${artId}`);
    const bidAmount = parseFloat(bidInput?.value);

    try {
        const artDoc = await db.collection('artworks').doc(artId).get();
        const art = artDoc.data();

        const minBid = (art.currentBid || art.startPrice || 1) + 1;
        if (bidAmount < minBid) { showToast(`최소 입찰가: ${minBid} CRNY`, 'warning'); return; }

        const wallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        const balances = wallets.docs[0]?.data()?.balances || {};
        if ((balances.crny || 0) < bidAmount) {
            showToast(`CRNY 잔액 부족. 보유: ${balances.crny || 0}`, 'warning'); return;
        }

        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const nickname = userDoc.data()?.nickname || currentUser.email;

        await db.collection('artworks').doc(artId).update({
            currentBid: bidAmount, highestBidder: currentUser.uid,
            highestBidderEmail: currentUser.email, highestBidderNickname: nickname
        });

        await db.collection('artworks').doc(artId).collection('bids').add({
            bidderId: currentUser.uid, bidderEmail: currentUser.email,
            bidderNickname: nickname, amount: bidAmount, timestamp: new Date()
        });

        showToast(`🔨 ${bidAmount} CRNY 입찰 완료!`, 'success');
        const modal = document.getElementById('art-modal');
        if (modal) modal.remove();
        loadArtGallery();
    } catch (error) { showToast('입찰 실패: ' + error.message, 'error'); }
}


// ============================================================
// 10. 자동 기부 (CRFN)
// ============================================================

async function _artDonationAuto(userId, amount, token) {
    try {
        const donationAmount = Math.max(ART_CONFIG.donationMinCRFN, amount * 0.02);
        const wallets = await db.collection('users').doc(userId)
            .collection('wallets').limit(1).get();
        if (wallets.empty) return;

        const walletDoc = wallets.docs[0];
        const crfnBal = walletDoc.data().balances?.crfn || 0;

        if (crfnBal >= donationAmount) {
            await walletDoc.ref.update({ 'balances.crfn': crfnBal - donationAmount });
            await db.collection('giving_pool_logs').add({
                userId, amount: donationAmount, token: 'CRFN',
                source: 'art_trade', note: `아트 거래 자동 기부 (${amount} ${token})`,
                timestamp: new Date()
            });
            console.log(`🎨 [Donation] ${donationAmount} CRFN auto-donated`);
        }
    } catch (e) {
        console.warn('🎨 [Donation] Failed:', e.message);
    }
}


// ============================================================
// 11. 내 컬렉션 (작품 / 구매 / NFT)
// ============================================================

async function loadMyArtworks() {
    if (!currentUser) return;
    const c = document.getElementById('my-art-collection');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--accent)">로딩 중...</p>';

    try {
        const arts = await db.collection('artworks')
            .where('artistId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc').limit(30).get();

        if (arts.empty) { c.innerHTML = '<p style="color:var(--accent)">등록한 작품이 없습니다</p>'; return; }

        let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem">';
        arts.forEach(doc => {
            const art = { id: doc.id, ...doc.data() };
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            const status = art.status === 'sold' ? '✅ 판매됨' : art.status === 'active' ? '🟢 판매 중' : '⬜ 삭제됨';
            html += `
                <div onclick="viewArtwork('${art.id}')" style="background:var(--bg);border-radius:8px;overflow:hidden;cursor:pointer;position:relative">
                    ${art.isNFT ? '<div style="position:absolute;top:4px;right:4px;background:rgba(138,43,226,.85);color:#fff;padding:1px 6px;border-radius:8px;font-size:.6rem">🔗 NFT</div>' : ''}
                    <img src="${img}" style="width:100%;height:100px;object-fit:cover" loading="lazy">
                    <div style="padding:.4rem;font-size:.75rem">
                        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${art.title}</div>
                        <div style="color:var(--accent)">${status}</div>
                    </div>
                </div>`;
        });
        c.innerHTML = html + '</div>';
    } catch (e) { c.innerHTML = `<p style="color:red">로드 실패: ${e.message}</p>`; }
}

async function loadMyPurchases() {
    if (!currentUser) return;
    const c = document.getElementById('my-art-collection');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--accent)">로딩 중...</p>';

    try {
        const arts = await db.collection('artworks')
            .where('buyerId', '==', currentUser.uid)
            .orderBy('soldAt', 'desc').limit(30).get();

        if (arts.empty) { c.innerHTML = '<p style="color:var(--accent)">구매한 작품이 없습니다</p>'; return; }

        let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem">';
        arts.forEach(doc => {
            const art = doc.data();
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            html += `
                <div onclick="viewArtwork('${doc.id}')" style="background:var(--bg);border-radius:8px;overflow:hidden;cursor:pointer">
                    <img src="${img}" style="width:100%;height:100px;object-fit:cover" loading="lazy">
                    <div style="padding:.4rem;font-size:.75rem">
                        <div style="font-weight:600">${art.title}</div>
                        <div style="color:var(--accent)">🎨 ${art.artistNickname||'익명'} ${art.isNFT?'🔗':''}</div>
                    </div>
                </div>`;
        });
        c.innerHTML = html + '</div>';
    } catch (e) { c.innerHTML = `<p style="color:red">로드 실패: ${e.message}</p>`; }
}

async function loadMyNFTs() {
    if (!currentUser) return;
    const c = document.getElementById('my-art-collection');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--accent)">로딩 중...</p>';

    try {
        const [minted, bought] = await Promise.all([
            db.collection('artworks').where('artistId','==',currentUser.uid).where('isNFT','==',true).get(),
            db.collection('artworks').where('buyerId','==',currentUser.uid).where('isNFT','==',true).get()
        ]);

        const nfts = new Map();
        minted.forEach(d => nfts.set(d.id, { id: d.id, ...d.data(), relation: 'minted' }));
        bought.forEach(d => {
            if (nfts.has(d.id)) nfts.get(d.id).relation = 'minted+owned';
            else nfts.set(d.id, { id: d.id, ...d.data(), relation: 'owned' });
        });

        const items = Array.from(nfts.values());
        if (!items.length) { c.innerHTML = '<p style="color:var(--accent)">보유한 NFT가 없습니다</p>'; return; }

        let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem">';
        items.forEach(art => {
            const img = art.thumbnailUrl || art.imageUrl || art.imageData || '';
            const typeLabel = art.nftType === 'erc1155' ? `×${art.editionCount}` : '1/1';
            html += `
                <div onclick="viewArtwork('${art.id}')" style="background:var(--bg);border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid rgba(138,43,226,.3)">
                    <img src="${img}" style="width:100%;height:100px;object-fit:cover" loading="lazy">
                    <div style="padding:.4rem;font-size:.75rem">
                        <div style="font-weight:600">${art.title}</div>
                        <div style="color:#8B2BE2">🔗 #${art.nftTokenId||'?'} · ${typeLabel}</div>
                    </div>
                </div>`;
        });
        c.innerHTML = html + '</div>';
    } catch (e) { c.innerHTML = `<p style="color:red">로드 실패: ${e.message}</p>`; }
}


// ============================================================
// 12. 아티스트 프로필
// ============================================================

async function _updateArtistProfile(userId, updateData) {
    try {
        const ref = db.collection('artist_profiles').doc(userId);
        const doc = await ref.get();

        if (!doc.exists) {
            const userDoc = await db.collection('users').doc(userId).get();
            const ud = userDoc.exists ? userDoc.data() : {};
            await ref.set({
                userId, nickname: ud.nickname || '', email: ud.email || '',
                bio: '', profileImage: '',
                totalWorks: 0, totalSales: 0, totalRevenue: 0, totalLikes: 0,
                verified: false, createdAt: new Date(),
                ...updateData
            });
        } else {
            await ref.update(updateData);
        }
    } catch (e) { console.warn('🎨 [Profile] Update failed:', e.message); }
}

async function viewArtistProfile(artistId) {
    try {
        const [profileDoc, userDoc] = await Promise.all([
            db.collection('artist_profiles').doc(artistId).get(),
            db.collection('users').doc(artistId).get()
        ]);
        const profile = profileDoc.exists ? profileDoc.data() : {};
        const user = userDoc.exists ? userDoc.data() : {};
        const nickname = profile.nickname || user.nickname || '익명 아티스트';

        const worksSnap = await db.collection('artworks')
            .where('artistId', '==', artistId)
            .where('status', '==', 'active').get();

        const modal = document.createElement('div');
        modal.id = 'artist-profile-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.88);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:400px;width:100%;padding:1.5rem">
                <div style="text-align:center;margin-bottom:1rem">
                    <div style="width:60px;height:60px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;margin:0 auto .5rem;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#fff">${nickname.charAt(0).toUpperCase()}</div>
                    <h3>${nickname} ${profile.verified?'✅':''}</h3>
                    ${profile.bio ? `<p style="font-size:.85rem;color:var(--accent);margin-top:.3rem">${profile.bio}</p>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;text-align:center;margin-bottom:1rem">
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${worksSnap.size}</div><div style="font-size:.7rem;color:var(--accent)">작품</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalSales||0}</div><div style="font-size:.7rem;color:var(--accent)">판매</div></div>
                    <div style="background:var(--bg);padding:.6rem;border-radius:8px"><div style="font-size:1.1rem;font-weight:700">${profile.totalLikes||0}</div><div style="font-size:.7rem;color:var(--accent)">좋아요</div></div>
                </div>
                <button onclick="this.closest('#artist-profile-modal').remove()" style="width:100%;background:var(--bg);border:1px solid var(--border);padding:.6rem;border-radius:6px;cursor:pointer">닫기</button>
            </div>`;
        document.body.appendChild(modal);
    } catch (e) { console.error('🎨 [Profile] View failed:', e); }
}


// ============================================================
// 13. 유틸리티
// ============================================================

function _resetArtForm() {
    ['art-title', 'art-description'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const imgEl = document.getElementById('art-image');
    if (imgEl) imgEl.value = '';
    const nftChk = document.getElementById('art-mint-nft');
    if (nftChk) nftChk.checked = false;
    toggleNFTOptions();
    const statusEl = document.getElementById('art-upload-status');
    if (statusEl) statusEl.textContent = '';
}


// ============================================================
// 14. Thirdweb 배포 가이드 (콘솔)
// ============================================================

function showDeployGuide() {
    console.log(`
╔═════════════════════════════════════════════╗
║   CROWNY NFT 컬렉션 배포 가이드               ║
╠═════════════════════════════════════════════╣
║                                             ║
║  1. thirdweb.com/dashboard 접속              ║
║  2. "Deploy" 클릭                            ║
║                                             ║
║  ── ERC-721 (유니크 1/1) ──                   ║
║  Contract: NFT Collection                    ║
║  Name: CROWNY ART · Symbol: CRART            ║
║  Network: Polygon                            ║
║  Royalty: 10%                                ║
║  Recipient: ${ART_CONFIG.adminWallet}        ║
║                                             ║
║  ── ERC-1155 (에디션) ──                      ║
║  Contract: Edition                           ║
║  Name: CROWNY EDITIONS · Symbol: CREDI       ║
║  Network: Polygon                            ║
║  Royalty: 10%                                ║
║  Recipient: ${ART_CONFIG.adminWallet}        ║
║                                             ║
║  배포 후 → ART_CONFIG.contracts에 주소 입력     ║
╚═════════════════════════════════════════════╝
    `);
}

console.log('🎨 js/app-art.js v' + ART_VERSION + ' loaded. showDeployGuide() for NFT setup.');
