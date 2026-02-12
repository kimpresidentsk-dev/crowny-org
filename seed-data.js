const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

function ts(daysAgo = 0) {
  return Timestamp.fromDate(new Date(Date.now() - daysAgo * 86400000));
}

async function seed() {
  const batch1 = db.batch();
  const batch2 = db.batch();
  const batch3 = db.batch();
  const batch4 = db.batch();
  let count = 0;

  function getBatch() {
    if (count < 15) return batch1;
    if (count < 30) return batch2;
    if (count < 45) return batch3;
    return batch4;
  }

  // 1. Products (Mall) - 9개
  const products = [
    { title: '멜로우 마스크팩 세트', description: '프리미엄 보습 마스크팩 10매입. 히알루론산 함유.', price: 25500, token: 'CRGC', category: '뷰티', image: '🧴' },
    { title: '크라우니 블루투스 스피커', description: '360도 서라운드 사운드. IPX7 방수.', price: 89000, token: 'CRGC', category: '음향', image: '🔊' },
    { title: '아르띠스떼 에너지크림', description: '피부 에너지를 채워주는 고보습 크림 50ml.', price: 76500, token: 'CRGC', category: '뷰티', image: '✨' },
    { title: '크라우니 무선 이어폰 Pro', description: 'ANC 노이즈캔슬링. 30시간 배터리.', price: 159000, token: 'CRGC', category: '음향', image: '🎧' },
    { title: '고센스 스포츠겔', description: '근육 피로 회복 마사지겔 200ml.', price: 32000, token: 'CRGC', category: '헬스', image: '💪' },
    { title: '크라우니 텀블러 500ml', description: '진공 단열 스테인리스. 12시간 보온.', price: 28000, token: 'CRGC', category: '생활', image: '☕' },
    { title: '멜로우 클렌징 폼', description: '약산성 저자극 클렌징. 민감성 피부용.', price: 18500, token: 'CRGC', category: '뷰티', image: '🫧' },
    { title: '크라우니 보조배터리 20000mAh', description: 'PD 65W 급속충전. 노트북 충전 가능.', price: 55000, token: 'CRGC', category: '전자', image: '🔋' },
    { title: '아로마 디퓨저 세트', description: '초음파 가습 겸용. 라벤더/유칼립투스 오일 포함.', price: 42000, token: 'CRGC', category: '생활', image: '🌿' },
  ];

  for (const p of products) {
    const ref = db.collection('products').doc();
    getBatch().set(ref, {
      ...p, sellerId: 'sample_seller_1', status: 'active', createdAt: ts(Math.floor(Math.random()*30)),
      stock: 100, salesCount: Math.floor(Math.random()*50), avgRating: (3.5 + Math.random()*1.5).toFixed(1) * 1, reviewCount: Math.floor(Math.random()*20)
    });
    count++;
  }

  // 2. Artworks - 9개
  const artworks = [
    { title: '서울의 밤', description: '네온 불빛으로 물든 강남 야경을 담은 디지털 아트.', price: 500, token: 'CRAC', category: '디지털아트', medium: 'Digital Painting' },
    { title: '파도의 기억', description: '제주 바다의 파도를 추상적으로 표현한 작품.', price: 300, token: 'CRAC', category: '추상', medium: 'Generative Art' },
    { title: '도시의 숨결', description: '빌딩 숲 사이로 보이는 하늘을 포착.', price: 750, token: 'CRAC', category: '사진', medium: 'Photography' },
    { title: '봄의 소리', description: '벚꽃이 흩날리는 순간을 AI로 생성.', price: 200, token: 'CRAC', category: 'AI아트', medium: 'AI Generated' },
    { title: '한옥의 정취', description: '전통과 현대가 만나는 한옥 마을 일러스트.', price: 450, token: 'CRAC', category: '일러스트', medium: 'Illustration' },
    { title: '별빛 아래서', description: '은하수와 산의 실루엣이 어우러진 작품.', price: 600, token: 'CRAC', category: '디지털아트', medium: 'Digital Painting' },
    { title: '바람의 형태', description: '바람의 움직임을 시각적으로 표현한 키네틱 아트.', price: 1000, token: 'CRAC', category: '추상', medium: '3D Art' },
    { title: '고양이의 오후', description: '따스한 햇살 속 고양이를 그린 일러스트.', price: 150, token: 'CRAC', category: '일러스트', medium: 'Illustration' },
    { title: '미래 도시 2050', description: '2050년 서울의 모습을 상상한 컨셉 아트.', price: 800, token: 'CRAC', category: 'AI아트', medium: 'AI + Digital' },
  ];

  for (const a of artworks) {
    const ref = db.collection('artworks').doc();
    getBatch().set(ref, {
      ...a, artistId: `sample_artist_${Math.floor(Math.random()*9)+1}`, status: 'active',
      createdAt: ts(Math.floor(Math.random()*60)), isNFT: Math.random() > 0.5,
      image: '', likeCount: Math.floor(Math.random()*100), viewCount: Math.floor(Math.random()*500)
    });
    count++;
  }

  // 3. Campaigns (Fundraise) - 9개
  const campaigns = [
    { title: '크라우니 커뮤니티 센터 건립', description: '크라우니 멤버들을 위한 오프라인 커뮤니티 공간을 만듭니다.', goal: 50000, raised: 32000 },
    { title: '독립 영화 "새벽의 문" 제작', description: '신예 감독의 첫 장편영화 제작비를 모금합니다.', goal: 30000, raised: 18500 },
    { title: '지역 아동센터 도서 기증', description: '소외 지역 아동센터에 1,000권의 도서를 기증합니다.', goal: 5000, raised: 4200 },
    { title: '친환경 패키지 전환 프로젝트', description: '크라우니 제품 전체를 친환경 패키지로 전환합니다.', goal: 20000, raised: 8000 },
    { title: '신진 아티스트 전시회', description: '10명의 신진 아티스트 첫 전시를 지원합니다.', goal: 15000, raised: 11000 },
    { title: '크라우니 장학금 펀드', description: '블록체인/핀테크 전공 대학생에게 장학금을 지급합니다.', goal: 100000, raised: 45000 },
    { title: '반려동물 보호소 지원', description: '유기동물 보호소 운영비와 의료비를 지원합니다.', goal: 10000, raised: 7500 },
    { title: '크라우니 뮤직 페스티벌', description: '크라우니 아티스트들의 첫 오프라인 뮤직 페스티벌.', goal: 80000, raised: 25000 },
    { title: '스마트팜 구축 프로젝트', description: 'IoT 기반 스마트팜을 구축하여 지역 농가를 지원합니다.', goal: 40000, raised: 12000 },
  ];

  for (const c of campaigns) {
    const ref = db.collection('campaigns').doc();
    getBatch().set(ref, {
      ...c, token: 'CRGC', creatorId: `sample_user_${Math.floor(Math.random()*9)+1}`,
      creatorEmail: `user${Math.floor(Math.random()*9)+1}@crowny.org`,
      status: 'active', createdAt: ts(Math.floor(Math.random()*45)),
      platformFee: 2.5, backers: Math.floor(Math.random()*100)+5, backerCount: Math.floor(Math.random()*100)+5, image: ''
    });
    count++;
  }

  // 4. Businesses - 9개
  const businesses = [
    { name: '크라우니 뷰티랩', description: '천연 화장품 연구개발 및 유통. 마스크팩/크림 전문.', category: '뷰티' },
    { name: '사운드웨이브 오디오', description: '고품질 음향기기 설계 및 제조. 블루투스 스피커/이어폰.', category: '전자' },
    { name: '그린에너지 솔루션', description: '태양광/풍력 에너지 컨설팅 및 설치.', category: '에너지' },
    { name: '크라우니 카페 체인', description: '크라우니 생태계 결제 가능한 카페 프랜차이즈.', category: 'F&B' },
    { name: '디지털아트 스튜디오', description: 'NFT 아트 제작/기획. AI 아트 솔루션 제공.', category: '아트' },
    { name: '핀테크 브릿지', description: '블록체인 기반 결제/송금 솔루션 개발.', category: 'IT' },
    { name: '헬스케어 플러스', description: '건강기능식품 및 스포츠 영양 제품 유통.', category: '헬스' },
    { name: '에코 패키징', description: '생분해성 친환경 포장재 제조.', category: '환경' },
    { name: '크라우니 에듀테크', description: '블록체인/Web3 교육 플랫폼 운영.', category: '교육' },
  ];

  for (const b of businesses) {
    const ref = db.collection('businesses').doc();
    getBatch().set(ref, {
      ...b, token: 'CRGC', creatorId: `sample_user_${Math.floor(Math.random()*9)+1}`,
      ownerId: `sample_user_${Math.floor(Math.random()*9)+1}`,
      ownerEmail: `user${Math.floor(Math.random()*9)+1}@crowny.org`,
      ownerNickname: b.name + ' 대표',
      country: '한국',
      status: 'active', createdAt: ts(Math.floor(Math.random()*90)),
      rating: (3 + Math.random()*2).toFixed(1) * 1, reviews: Math.floor(Math.random()*20),
      investorCount: Math.floor(Math.random()*50),
      totalInvested: Math.floor(Math.random()*50000)
    });
    count++;
  }

  // 5. Artists - 9개
  const artists = [
    { name: '이하늘', bio: '서울 기반 디지털 아티스트. 도시 풍경과 빛을 주제로 작업.', genre: '디지털아트' },
    { name: 'DJ Crown', bio: 'EDM/하우스 프로듀서. 크라우니 뮤직 페스티벌 헤드라이너.', genre: '일렉트로닉' },
    { name: '김소리', bio: '재즈 보컬리스트. 따뜻한 음색으로 사랑받는 아티스트.', genre: '재즈' },
    { name: 'PIXEL_J', bio: 'AI와 픽셀아트를 결합한 독특한 스타일의 아티스트.', genre: 'AI아트' },
    { name: '박서연', bio: '감성 일러스트레이터. 동물과 자연을 주로 그립니다.', genre: '일러스트' },
    { name: 'CryptoBeats', bio: 'Web3 뮤지션. 온체인 음악 NFT 선구자.', genre: '힙합' },
    { name: '최민우', bio: '3D 아티스트. 미래 건축과 공간 디자인 전문.', genre: '3D아트' },
    { name: '한별', bio: '싱어송라이터. 어쿠스틱 감성의 자작곡 활동.', genre: '인디' },
    { name: 'ArtFlow', bio: '제너레이티브 아트 그룹. 코드로 만드는 예술.', genre: '제너레이티브' },
  ];

  for (const a of artists) {
    const ref = db.collection('artists').doc();
    getBatch().set(ref, {
      ...a, token: 'CRAC', userId: `sample_artist_${count % 9 + 1}`,
      status: 'active', createdAt: ts(Math.floor(Math.random()*120)),
      fans: Math.floor(Math.random()*500)+10,
      totalSupport: Math.floor(Math.random()*10000),
      profileImage: ''
    });
    count++;
  }

  // 6. Books - 9개
  const books = [
    { title: '블록체인 입문', author: '김크라우니', description: '초보자를 위한 블록체인 기술 가이드.', price: 50, category: 'IT' },
    { title: '디지털 아트의 미래', author: '이하늘', description: 'NFT와 AI가 바꾸는 예술의 세계.', price: 35, category: '예술' },
    { title: '토큰 이코노미', author: '박핀테크', description: '토큰 기반 경제 시스템 설계 원리.', price: 80, category: '경제' },
    { title: 'Web3 창업 가이드', author: '최스타트', description: '블록체인 스타트업 창업 A to Z.', price: 60, category: 'IT' },
    { title: '에너지 혁명', author: '그린솔라', description: '신재생 에너지가 만드는 새로운 세상.', price: 45, category: '과학' },
    { title: '크라우드펀딩의 기술', author: '펀딩마스터', description: '성공적인 크라우드펀딩 캠페인 전략.', price: 40, category: '비즈니스' },
    { title: 'DeFi 투자 전략', author: '디파이킹', description: '탈중앙 금융 프로토콜 투자 가이드.', price: 70, category: '투자' },
    { title: '커뮤니티 빌딩', author: '소셜매니저', description: '온라인 커뮤니티 성장 전략과 운영법.', price: 30, category: '마케팅' },
    { title: '미래도시 이야기', author: '한별', description: '2050년 스마트시티를 배경으로 한 SF 소설.', price: 25, category: '소설' },
  ];

  for (const b of books) {
    const ref = db.collection('books').doc();
    getBatch().set(ref, {
      ...b, token: 'CRGC', sellerId: `sample_seller_${Math.floor(Math.random()*5)+1}`,
      publisherId: `sample_seller_${Math.floor(Math.random()*5)+1}`,
      status: 'active', createdAt: ts(Math.floor(Math.random()*60)),
      coverImage: '', sold: Math.floor(Math.random()*200), salesCount: Math.floor(Math.random()*200)
    });
    count++;
  }

  // 7. Energy Projects - 9개
  const energyProjects = [
    { name: '제주 해상풍력 1호', description: '제주도 해안에 500kW 해상풍력 발전기 설치.', type: 'wind', targetAmount: 100000, currentAmount: 65000, returnRate: 8.5 },
    { name: '충남 태양광 팜', description: '충남 서산 10MW 태양광 발전소 건설.', type: 'solar', targetAmount: 200000, currentAmount: 120000, returnRate: 7.2 },
    { name: '강원 소수력 발전', description: '강원도 계곡 소수력 발전 프로젝트.', type: 'hydro', targetAmount: 50000, currentAmount: 35000, returnRate: 6.8 },
    { name: '서울 건물 옥상 태양광', description: '서울 상업 건물 옥상 태양광 패널 설치.', type: 'solar', targetAmount: 30000, currentAmount: 22000, returnRate: 9.0 },
    { name: '전남 해상풍력 단지', description: '전남 신안 대규모 해상풍력 단지.', type: 'wind', targetAmount: 500000, currentAmount: 180000, returnRate: 10.5 },
    { name: '세종시 지열 에너지', description: '세종시 신도시 지열 냉난방 시스템.', type: 'geothermal', targetAmount: 80000, currentAmount: 45000, returnRate: 7.0 },
    { name: '부산 조력 발전소', description: '부산 해안 조력 발전 파일럿 프로젝트.', type: 'tidal', targetAmount: 150000, currentAmount: 60000, returnRate: 8.0 },
    { name: '경기 바이오가스 플랜트', description: '음식물 쓰레기 기반 바이오가스 발전.', type: 'biomass', targetAmount: 40000, currentAmount: 28000, returnRate: 11.0 },
    { name: '대전 수소 연료전지', description: '수소 연료전지 발전 실증 사업.', type: 'hydrogen', targetAmount: 250000, currentAmount: 90000, returnRate: 12.0 },
  ];

  for (const e of energyProjects) {
    const ref = db.collection('energy_projects').doc();
    getBatch().set(ref, {
      ...e, token: 'CREB', creatorId: `sample_user_${Math.floor(Math.random()*5)+1}`,
      title: e.name, goal: e.targetAmount, invested: e.currentAmount,
      investors: Math.floor(Math.random()*100)+5,
      status: 'active', createdAt: ts(Math.floor(Math.random()*90)),
      investorCount: Math.floor(Math.random()*100)+5
    });
    count++;
  }

  console.log(`Total documents: ${count}`);
  
  await batch1.commit();
  console.log('Batch 1 committed');
  await batch2.commit();
  console.log('Batch 2 committed');
  await batch3.commit();
  console.log('Batch 3 committed');
  await batch4.commit();
  console.log('Batch 4 committed');
  
  console.log('✅ All 63 sample documents inserted!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
