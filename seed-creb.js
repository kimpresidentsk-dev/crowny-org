// CREB LABS 시드 데이터 — 4대 영역 프로젝트
// Usage: node seed-creb.js

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const projects = [
  // 🧬 유전공학
  {
    title: '희귀질환 유전자 치료제 연구',
    category: 'genetics',
    investType: 'donation',
    returnRate: 0,
    goal: 50000,
    location: '서울대 유전공학연구소',
    capacity: 0,
    description: '전 세계 7000여 종 희귀질환 중 치료제가 존재하는 것은 5% 미만. 유전자 편집 기술로 새로운 치료 가능성을 연구합니다.',
    milestones: [
      { name: '타깃 유전자 분석', target: 100, current: 45 },
      { name: '동물실험 단계', target: 100, current: 10 },
      { name: '임상시험 준비', target: 100, current: 0 }
    ],
    teamMembers: [
      { name: '김유전 교수', role: '수석 연구원' },
      { name: '이진화 박사', role: '유전체 분석' }
    ]
  },
  {
    title: '농업 유전체 분석 플랫폼',
    category: 'genetics',
    investType: 'return',
    returnRate: 9,
    goal: 80000,
    location: '경기도 수원',
    capacity: 0,
    description: '작물 유전체를 분석하여 병충해 저항성, 수확량 개선 품종을 개발하는 AI 기반 플랫폼.',
    milestones: [
      { name: '데이터셋 구축', target: 100, current: 60 },
      { name: 'AI 모델 개발', target: 100, current: 30 },
      { name: '파일럿 농장 적용', target: 100, current: 0 }
    ],
    teamMembers: [
      { name: '박농업 CTO', role: '플랫폼 아키텍트' }
    ]
  },

  // 🔬 생명공학
  {
    title: '마이크로바이옴 진단키트 개발',
    category: 'biotech',
    investType: 'return',
    returnRate: 8,
    goal: 100000,
    location: '판교 바이오밸리',
    capacity: 0,
    description: '장내 미생물 분석을 통한 개인맞춤형 건강관리. 가정에서 간편하게 검사 가능한 키트.',
    milestones: [
      { name: '프로토타입 개발', target: 100, current: 80 },
      { name: 'FDA 인증 준비', target: 100, current: 20 },
      { name: '양산 체계 구축', target: 100, current: 5 }
    ],
    teamMembers: [
      { name: '최미생물 CEO', role: '대표' },
      { name: '정키트 연구원', role: '제품 개발' }
    ]
  },
  {
    title: '줄기세포 재생의학 연구',
    category: 'biotech',
    investType: 'hybrid',
    returnRate: 5,
    goal: 150000,
    location: '서울 성북구',
    capacity: 0,
    description: '줄기세포를 활용한 연골/피부 재생 기술. 수익 50%는 투자자, 50%는 추가 연구에 재투자.',
    milestones: [
      { name: '줄기세포 배양 최적화', target: 100, current: 55 },
      { name: '동물실험', target: 100, current: 25 },
      { name: '임상 1상', target: 100, current: 0 }
    ],
    teamMembers: [
      { name: '한줄기 교수', role: '재생의학 전문' }
    ]
  },
  {
    title: '항생제 내성 신약 개발',
    category: 'biotech',
    investType: 'donation',
    returnRate: 0,
    goal: 200000,
    location: '한국생명공학연구원',
    capacity: 0,
    description: 'WHO가 경고한 슈퍼박테리아 대응 신약 개발. 인류 공통 위기에 대한 선한 투자.',
    milestones: [
      { name: '후보물질 발굴', target: 100, current: 35 },
      { name: '전임상', target: 100, current: 10 },
      { name: '임상시험', target: 100, current: 0 }
    ],
    teamMembers: [
      { name: '오내성 박사', role: '수석 연구원' },
      { name: '신약개 팀장', role: '약물 설계' }
    ]
  },

  // 🤖 AI·로보틱스
  {
    title: '농업용 AI 드론 양산',
    category: 'ai_robotics',
    investType: 'return',
    returnRate: 12,
    goal: 120000,
    location: '전남 나주',
    capacity: 0,
    description: '정밀 농업을 위한 AI 드론. 병충해 탐지, 자동 방제, 작황 분석을 한 번에.',
    milestones: [
      { name: '프로토타입 완성', target: 100, current: 90 },
      { name: '양산 라인 구축', target: 100, current: 40 },
      { name: '판매 개시', target: 100, current: 0 }
    ],
    teamMembers: [
      { name: '드론킹 CEO', role: '대표' },
      { name: 'AI농부 CTO', role: 'AI 엔진' }
    ]
  },
  {
    title: '노인 돌봄 로봇 개발',
    category: 'ai_robotics',
    investType: 'hybrid',
    returnRate: 4,
    goal: 90000,
    location: '대전 KAIST',
    capacity: 0,
    description: '고령화 사회를 위한 AI 돌봄 로봇. 건강 모니터링, 말벗, 낙상 감지 기능.',
    milestones: [
      { name: 'AI 대화 엔진', target: 100, current: 70 },
      { name: '하드웨어 설계', target: 100, current: 50 },
      { name: '파일럿 시범', target: 100, current: 10 }
    ],
    teamMembers: [
      { name: '로봇박사', role: 'HW 개발' },
      { name: '케어AI', role: 'SW 개발' }
    ]
  },
  {
    title: '교육용 AI 튜터 시스템',
    category: 'ai_robotics',
    investType: 'donation',
    returnRate: 0,
    goal: 60000,
    location: '서울 교육혁신센터',
    capacity: 0,
    description: '소외 지역 학생들을 위한 무료 AI 튜터. 개인 맞춤형 학습으로 교육 격차를 해소합니다.',
    milestones: [
      { name: 'AI 모델 학습', target: 100, current: 60 },
      { name: '학습 콘텐츠 구축', target: 100, current: 40 },
      { name: '시범 학교 적용', target: 100, current: 15 }
    ],
    teamMembers: [
      { name: '에듀AI 대표', role: '프로젝트 리드' }
    ]
  }
];

async function seed() {
  console.log('🔬 CREB LABS 시드 데이터 삽입 시작...');
  for (const p of projects) {
    await db.collection('energy_projects').add({
      ...p,
      invested: 0,
      investors: 0,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  ✅ ${CREB_CATEGORIES[p.category]} ${p.title}`);
  }
  console.log('🎉 완료! 총 ' + projects.length + '개 프로젝트 추가');
  process.exit(0);
}

const CREB_CATEGORIES = {
  energy: '⚡', genetics: '🧬', biotech: '🔬', ai_robotics: '🤖'
};

seed().catch(e => { console.error(e); process.exit(1); });
