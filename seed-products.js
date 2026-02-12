// seed-products.js — products 컬렉션만 삭제 후 재생성
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  // 1. 기존 products 삭제
  const existing = await db.collection('products').get();
  const delBatch = db.batch();
  existing.forEach(d => delBatch.delete(d.ref));
  if (!existing.empty) { await delBatch.commit(); console.log(`🗑️ ${existing.size} products deleted`); }

  // 2. 새 products 시드
  const products = [
    { title: '멜로우 마스크팩 세트', description: '프리미엄 보습 마스크팩 10매입. 히알루론산 함유.', price: 25500, token: 'CRGC', category: 'present', image: '🧴' },
    { title: '크라우니 블루투스 스피커', description: '360도 서라운드 사운드. IPX7 방수.', price: 89000, token: 'CRGC', category: 'avls', image: '🔊' },
    { title: '아르띠스떼 에너지크림', description: '피부 에너지를 채워주는 고보습 크림 50ml.', price: 76500, token: 'CRGC', category: 'present', image: '✨' },
    { title: '크라우니 무선 이어폰 Pro', description: 'ANC 노이즈캔슬링. 30시간 배터리.', price: 159000, token: 'CRGC', category: 'avls', image: '🎧' },
    { title: '고센스 스포츠겔', description: '근육 피로 회복 마사지겔 200ml.', price: 32000, token: 'CRGC', category: 'doctor', image: '💪' },
    { title: '크라우니 텀블러 500ml', description: '진공 단열 스테인리스. 12시간 보온.', price: 28000, token: 'CRGC', category: 'mall', image: '☕' },
    { title: '멜로우 클렌징 폼', description: '약산성 저자극 클렌징. 민감성 피부용.', price: 18500, token: 'CRGC', category: 'present', image: '🫧' },
    { title: '크라우니 보조배터리 20000mAh', description: 'PD 65W 급속충전. 노트북 충전 가능.', price: 55000, token: 'CRGC', category: 'mall', image: '🔋' },
    { title: '아로마 디퓨저 세트', description: '초음파 가습 겸용. 라벤더/유칼립투스 오일 포함.', price: 42000, token: 'CRGC', category: 'mall', image: '🌿' },
    { title: '프리미엄 콜라겐 분말', description: '저분자 피쉬 콜라겐 3000mg. 30일분.', price: 49000, token: 'CRGC', category: 'doctor', image: '💊' },
    { title: '스마트 체중계 Pro', description: '체지방/근육량/수분 측정. 앱 연동.', price: 65000, token: 'CRGC', category: 'medical', image: '⚖️' },
    { title: 'LED 스튜디오 조명 키트', description: '유튜브/틱톡 촬영용 3점 조명 세트.', price: 120000, token: 'CRGC', category: 'avls', image: '💡' },
    { title: '보안 카메라 2팩', description: '1080p 나이트비전. 양방향 오디오. 클라우드 저장.', price: 98000, token: 'CRGC', category: 'solution', image: '📹' },
    { title: '모듈러 선반 시스템', description: '조립식 인테리어 선반. 4단 구성.', price: 85000, token: 'CRGC', category: 'architect', image: '🏗️' },
    { title: '크라우니 로고 후드티', description: '프리미엄 오버핏 후드. S/M/L/XL.', price: 59000, token: 'CRGC', category: 'designers', image: '👕' },
    { title: '오가닉 그래놀라 세트', description: '유기농 견과류 그래놀라 3종 세트.', price: 22000, token: 'CRGC', category: 'mall', image: '🥣' },
    { title: '비타민C 세럼', description: '순수 비타민C 15% 함유 고농축 세럼 30ml.', price: 38000, token: 'CRGC', category: 'present', image: '🧪' },
    { title: '무선 마우스 & 키보드 세트', description: '인체공학 무선 콤보. USB-C 충전.', price: 72000, token: 'CRGC', category: 'mall', image: '⌨️' },
  ];

  const batch = db.batch();
  const ts = (d) => admin.firestore.Timestamp.fromDate(new Date(Date.now() - d * 86400000));

  for (const p of products) {
    const ref = db.collection('products').doc();
    batch.set(ref, {
      ...p, sellerId: 'sample_seller_1', status: 'active',
      createdAt: ts(Math.floor(Math.random() * 30)),
      stock: 100, sold: 0, salesCount: Math.floor(Math.random() * 50),
      avgRating: +(3.5 + Math.random() * 1.5).toFixed(1),
      reviewCount: Math.floor(Math.random() * 20)
    });
  }

  await batch.commit();
  console.log(`✅ ${products.length} products seeded!`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
