const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'marketplace.js');
let content = fs.readFileSync(filePath, 'utf8');

// 이모지 → Lucide 매핑 테이블
const emojiMap = {
  '💰': '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💄': '<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '⭐': '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🛒': '<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📦': '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '✅': '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '❌': '<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🚚': '<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🎬': '<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💊': '<i data-lucide="pill" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🏥': '<i data-lucide="hospital" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔐': '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🏗️': '<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '👗': '<i data-lucide="shirt" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔊': '<i data-lucide="volume-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💪': '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '☕': '<i data-lucide="coffee" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔋': '<i data-lucide="battery" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🍽️': '<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🌟': '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🚨': '<i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📝': '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '👍': '<i data-lucide="thumbs-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📊': '<i data-lucide="bar-chart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔥': '<i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '⚡': '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🧬': '<i data-lucide="dna" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔬': '<i data-lucide="microscope" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🤖': '<i data-lucide="bot" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💝': '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔄': '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📖': '<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🏪': '<i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🔧': '<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💻': '<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📷': '<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🎵': '<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '💃': '<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '😂': '<i data-lucide="smile" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📹': '<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🎧': '<i data-lucide="headphones" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📕': '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📗': '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📘': '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📙': '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🖋️': '<i data-lucide="pen-tool" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🧒': '<i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📒': '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '📚': '<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '✏️': '<i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '⏸': '<i data-lucide="pause" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '▶️': '<i data-lucide="play" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🗑️': '<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '⏳': '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🏆': '<i data-lucide="trophy" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '❤️': '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🤍': '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🎉': '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🏅': '<i data-lucide="award" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
  '🎭': '<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
};

// console.log나 주석 내의 이모지는 제외하고 HTML 부분만 교체
let modified = content;
for (const [emoji, iconHtml] of Object.entries(emojiMap)) {
  // \`와 ` 사이의 템플릿 리터럴에서만 교체 (백틱 사이 코드)
  // 또는 HTML 문자열(작은따옴표, 큰따옴표)에서만 교체
  const escapedEmoji = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 라인별 처리: console.log 라인은 제외
  modified = modified.split('\n').map(line => {
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.includes('console.log')) {
      return line; // 주석과 console 라인은 건드리지 않음
    }
    return line.replace(new RegExp(escapedEmoji, 'g'), iconHtml);
  }).join('\n');
}

// 파일 저장
fs.writeFileSync(filePath, modified, 'utf8');
console.log('✅ 이모지 교체 완료!');
console.log(`📁 파일: ${filePath}`);
console.log(`✨ 교체된 이모지 수: ${Object.keys(emojiMap).length}개`);
