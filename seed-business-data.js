// seed-business-data.js - 비즈니스 샘플 데이터 생성
const admin = require('firebase-admin');

// Firebase Admin 초기화
if (!admin.apps.length) {
    const serviceAccount = require('./service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://crowny-org-default-rtdb.firebaseio.com/",
        storageBucket: "crowny-org.appspot.com"
    });
}

const db = admin.firestore();

const sampleBusinesses = [
    {
        name: "크라우니 카페",
        description: "친환경적이고 지속가능한 커피를 제공하는 아늑한 동네 카페입니다. 원산지 직거래 원두만을 사용하며, 재사용 가능한 컵 사용을 장려합니다. 지역 아티스트들의 작품 전시공간도 함께 운영합니다.",
        category: "요식업",
        country: "대한민국",
        website: "https://crowny-cafe.com",
        contactEmail: "info@crowny-cafe.com",
        investmentGoal: 50000000,
        investmentCurrent: 15000000,
        images: [],
        ownerId: "sample-owner-1",
        ownerEmail: "cafe@crowny.org",
        status: "approved",
        emoji: "☕",
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: "스마트팜 솔루션",
        description: "IoT 기술을 활용한 스마트 농업 시스템을 개발하는 기술 스타트업입니다. 센서와 AI를 통해 작물의 성장 환경을 최적화하고, 농부들이 원격으로 농장을 관리할 수 있는 플랫폼을 제공합니다.",
        category: "기술",
        country: "대한민국",
        website: "https://smartfarm.tech",
        contactEmail: "contact@smartfarm.tech",
        investmentGoal: 200000000,
        investmentCurrent: 75000000,
        images: [],
        ownerId: "sample-owner-2",
        ownerEmail: "tech@crowny.org",
        status: "approved",
        emoji: "🌱",
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: "에코 패션 브랜드",
        description: "재활용 소재와 친환경 염료만을 사용하는 지속가능한 패션 브랜드입니다. 패스트 패션을 지양하고, 오래 입을 수 있는 고품질의 의류를 만듭니다. 판매 수익의 일부는 환경 보호 단체에 기부됩니다.",
        category: "제조",
        country: "대한민국",
        website: "https://ecofashion.kr",
        contactEmail: "hello@ecofashion.kr",
        investmentGoal: 100000000,
        investmentCurrent: 30000000,
        images: [],
        ownerId: "sample-owner-3",
        ownerEmail: "fashion@crowny.org",
        status: "approved",
        emoji: "👕",
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: "온라인 교육 플랫폼",
        description: "AI 기반 개인 맞춤형 학습을 제공하는 교육 플랫폼입니다. 학습자의 진도와 이해도를 분석하여 최적의 학습 경로를 제시하고, 실시간 튜터링 서비스도 함께 제공합니다.",
        category: "교육",
        country: "대한민국",
        website: "https://learnwithme.edu",
        contactEmail: "support@learnwithme.edu",
        investmentGoal: 150000000,
        investmentCurrent: 90000000,
        images: [],
        ownerId: "sample-owner-4",
        ownerEmail: "edu@crowny.org",
        status: "approved",
        emoji: "📚",
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        name: "홈케어 서비스",
        description: "바쁜 현대인을 위한 종합 홈케어 서비스를 제공합니다. 청소, 세탁, 정리정돈부터 간단한 수리까지 전문적이고 신뢰할 수 있는 서비스를 제공합니다. 모든 직원은 철저한 배경 조사를 거쳤습니다.",
        category: "서비스",
        country: "대한민국",
        website: "https://homecare.services",
        contactEmail: "care@homecare.services",
        investmentGoal: 80000000,
        investmentCurrent: 25000000,
        images: [],
        ownerId: "sample-owner-5",
        ownerEmail: "service@crowny.org",
        status: "approved",
        emoji: "🏠",
        createdAt: new Date(),
        updatedAt: new Date()
    }
];

const sampleQuestions = [
    {
        businessId: "", // Will be set after business creation
        question: "투자금은 주로 어떤 용도로 사용될 예정인가요?",
        answer: "투자금의 60%는 장비 구입, 30%는 마케팅, 10%는 운영 자금으로 사용할 계획입니다.",
        askerUid: "sample-user-1",
        askerEmail: "investor1@example.com",
        answered: true,
        isPublic: true,
        createdAt: new Date(),
        answeredAt: new Date()
    },
    {
        businessId: "", // Will be set after business creation
        question: "경쟁 업체와의 차별화 포인트는 무엇인가요?",
        answer: "저희는 AI 기술을 활용한 개인 맞춤형 서비스를 제공한다는 점에서 차별화됩니다.",
        askerUid: "sample-user-2",
        askerEmail: "investor2@example.com",
        answered: true,
        isPublic: true,
        createdAt: new Date(),
        answeredAt: new Date()
    },
    {
        businessId: "", // Will be set after business creation
        question: "향후 확장 계획이 있으신가요?",
        answer: null,
        askerUid: "sample-user-3",
        askerEmail: "investor3@example.com",
        answered: false,
        isPublic: true,
        createdAt: new Date(),
        answeredAt: null
    }
];

async function seedBusinessData() {
    console.log('🚀 비즈니스 샘플 데이터 생성 시작...');
    
    try {
        // 1. 기존 샘플 데이터 삭제 (선택사항)
        console.log('기존 샘플 데이터 확인 중...');
        const existingBusinesses = await db.collection('businesses')
            .where('ownerEmail', 'in', ['cafe@crowny.org', 'tech@crowny.org', 'fashion@crowny.org', 'edu@crowny.org', 'service@crowny.org'])
            .get();
        
        if (!existingBusinesses.empty) {
            console.log(`기존 샘플 사업체 ${existingBusinesses.size}개 발견. 삭제 중...`);
            const deletePromises = existingBusinesses.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
        }

        // 2. 새 사업체 데이터 추가
        console.log('새 사업체 데이터 추가 중...');
        const businessRefs = [];
        
        for (const business of sampleBusinesses) {
            const docRef = await db.collection('businesses').add(business);
            businessRefs.push({ id: docRef.id, name: business.name });
            console.log(`✅ ${business.name} 생성됨 (ID: ${docRef.id})`);
        }

        // 3. 샘플 Q&A 데이터 추가
        console.log('샘플 Q&A 데이터 추가 중...');
        
        // 각 사업체에 1-2개씩 질문 추가
        for (let i = 0; i < Math.min(businessRefs.length, sampleQuestions.length); i++) {
            const question = { ...sampleQuestions[i] };
            question.businessId = businessRefs[i].id;
            
            await db.collection('business_questions').add(question);
            console.log(`✅ ${businessRefs[i].name}에 Q&A 추가됨`);
        }

        // 4. 샘플 투자 기록 추가 (선택사항)
        console.log('샘플 투자 기록 추가 중...');
        for (const businessRef of businessRefs.slice(0, 3)) {
            await db.collection('investments').add({
                businessId: businessRef.id,
                businessName: businessRef.name,
                investorUid: 'sample-investor-1',
                investorEmail: 'investor@example.com',
                amount: Math.floor(Math.random() * 10000000) + 1000000,
                createdAt: new Date()
            });
        }

        console.log('🎉 비즈니스 샘플 데이터 생성 완료!');
        console.log(`총 ${sampleBusinesses.length}개 사업체, ${sampleQuestions.length}개 Q&A, 3개 투자 기록이 생성되었습니다.`);
        
    } catch (error) {
        console.error('❌ 샘플 데이터 생성 실패:', error);
        throw error;
    }
}

// 스크립트 실행
if (require.main === module) {
    seedBusinessData()
        .then(() => {
            console.log('✨ 모든 작업이 완료되었습니다.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 오류 발생:', error);
            process.exit(1);
        });
}

module.exports = { seedBusinessData };