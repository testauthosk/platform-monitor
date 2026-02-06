/**
 * Bookmakers Research - Глубокий анализ БК для ITF тенниса
 * 
 * Критерии:
 * - ITF покрытие (лайв)
 * - Скорость обновления линий (медленнее = лучше)
 * - Лимиты (не режут = лучше)
 * - Вывод (быстрый, без проблем)
 * - Верификация (минимальная)
 */

const https = require('https');
const fs = require('fs');

// Регионы для поиска
const REGIONS = {
  europe: {
    name: 'Европа',
    countries: ['UK', 'DE', 'ES', 'IT', 'FR', 'NL', 'BE', 'AT', 'CH', 'PL', 'CZ'],
    keywords: ['european bookmaker', 'EU betting', 'licensed europe']
  },
  cis: {
    name: 'СНГ',
    countries: ['RU', 'UA', 'KZ', 'BY', 'UZ'],
    keywords: ['букмекер', '1xbet', 'fonbet', 'parimatch']
  },
  asia: {
    name: 'Азия',
    countries: ['PH', 'MY', 'TH', 'VN', 'ID', 'IN'],
    keywords: ['asian bookmaker', 'asian handicap', 'sbobet', 'maxbet']
  },
  offshore: {
    name: 'Офшор',
    countries: ['CW', 'MT', 'GI', 'CY'],
    keywords: ['offshore betting', 'curacao license', 'no limits bookmaker']
  },
  latam: {
    name: 'Латинская Америка', 
    countries: ['BR', 'MX', 'AR', 'CO', 'CL'],
    keywords: ['latin america betting', 'brazil bookmaker']
  }
};

// Критерии оценки БК
const CRITERIA = {
  itf_coverage: { weight: 25, description: 'ITF турниры в лайве' },
  line_speed: { weight: 20, description: 'Скорость обновления (медленнее = лучше)' },
  limits: { weight: 25, description: 'Не режут лимиты' },
  withdrawal: { weight: 15, description: 'Быстрый вывод' },
  verification: { weight: 10, description: 'Минимальная верификация' },
  accounts: { weight: 5, description: 'Легко создать аккаунт' }
};

// Известные БК для проверки
const KNOWN_BOOKMAKERS = [
  // Tier 1 - Крупные, но режут
  { name: 'Bet365', region: 'europe', url: 'bet365.com', notes: 'Большой ITF, но режут быстро' },
  { name: 'Pinnacle', region: 'offshore', url: 'pinnacle.com', notes: 'Не режут, но линии быстрые' },
  { name: 'Betfair', region: 'europe', url: 'betfair.com', notes: 'Биржа, линии очень быстрые' },
  
  // Tier 2 - Средние
  { name: 'Marathonbet', region: 'europe', url: 'marathonbet.com', notes: 'Неплохо для ITF' },
  { name: 'Unibet', region: 'europe', url: 'unibet.com', notes: 'Режут' },
  { name: 'Bwin', region: 'europe', url: 'bwin.com', notes: 'Режут' },
  { name: '888sport', region: 'europe', url: '888sport.com', notes: 'Режут' },
  { name: 'William Hill', region: 'europe', url: 'williamhill.com', notes: 'Режут' },
  { name: 'Ladbrokes', region: 'europe', url: 'ladbrokes.com', notes: 'Режут' },
  
  // Tier 3 - Офшор/СНГ (терпят дольше)
  { name: '1xBet', region: 'offshore', url: '1xbet.com', notes: 'Много ITF, терпят дольше' },
  { name: 'Melbet', region: 'offshore', url: 'melbet.com', notes: 'Клон 1xbet' },
  { name: '22bet', region: 'offshore', url: '22bet.com', notes: 'Клон 1xbet' },
  { name: 'Betwinner', region: 'offshore', url: 'betwinner.com', notes: 'Клон 1xbet' },
  { name: 'Parimatch', region: 'cis', url: 'parimatch.com', notes: 'СНГ, средне' },
  { name: 'Fonbet', region: 'cis', url: 'fonbet.com', notes: 'РФ, легальный' },
  { name: 'Leonbets', region: 'cis', url: 'leonbets.com', notes: 'СНГ' },
  
  // Tier 4 - Азия
  { name: 'SBOBET', region: 'asia', url: 'sbobet.com', notes: 'Азия, профессионалы' },
  { name: 'Maxbet/IBCbet', region: 'asia', url: 'maxbet.com', notes: 'Азия' },
  { name: 'Singbet', region: 'asia', url: 'singbet.com', notes: 'Сингапур' },
  { name: '188bet', region: 'asia', url: '188bet.com', notes: 'Азия' },
  { name: 'Dafabet', region: 'asia', url: 'dafabet.com', notes: 'Азия, хороший ITF' },
  
  // Tier 5 - Крипто/Новые
  { name: 'Stake', region: 'offshore', url: 'stake.com', notes: 'Крипто, быстрый вывод' },
  { name: 'Cloudbet', region: 'offshore', url: 'cloudbet.com', notes: 'Крипто' },
  { name: 'Sportsbet.io', region: 'offshore', url: 'sportsbet.io', notes: 'Крипто' },
  { name: 'Duelbits', region: 'offshore', url: 'duelbits.com', notes: 'Крипто' },
  { name: 'Rollbit', region: 'offshore', url: 'rollbit.com', notes: 'Крипто, лимиты?' },
  
  // Менее известные для проверки
  { name: 'Betsson', region: 'europe', url: 'betsson.com', notes: 'Скандинавия' },
  { name: 'Nordicbet', region: 'europe', url: 'nordicbet.com', notes: 'Скандинавия' },
  { name: 'Betway', region: 'europe', url: 'betway.com', notes: 'Режут' },
  { name: 'Betclic', region: 'europe', url: 'betclic.com', notes: 'Франция' },
  { name: 'Tipico', region: 'europe', url: 'tipico.com', notes: 'Германия' },
  { name: 'Interwetten', region: 'europe', url: 'interwetten.com', notes: 'Австрия' },
  { name: 'Sportingbet', region: 'europe', url: 'sportingbet.com', notes: '' },
  { name: 'Betcris', region: 'latam', url: 'betcris.com', notes: 'Латам' },
  { name: 'Caliente', region: 'latam', url: 'caliente.mx', notes: 'Мексика' },
  { name: 'Betano', region: 'europe', url: 'betano.com', notes: 'Румыния/Бразилия' },
  { name: 'Superbet', region: 'europe', url: 'superbet.com', notes: 'Румыния/Польша' },
  { name: 'STS', region: 'europe', url: 'sts.pl', notes: 'Польша' },
  { name: 'Fortuna', region: 'europe', url: 'fortuna.pl', notes: 'Польша/Чехия' },
  { name: 'Tipsport', region: 'europe', url: 'tipsport.cz', notes: 'Чехия' },
];

// HTTP запрос
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    };
    
    https.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

// Поиск информации о БК
async function researchBookmaker(bk) {
  const results = {
    name: bk.name,
    region: bk.region,
    url: bk.url,
    notes: bk.notes,
    research: {
      itf_coverage: null,
      limits_info: [],
      withdrawal_info: [],
      reviews: []
    }
  };
  
  console.log(`\n🔍 Исследую ${bk.name}...`);
  
  // Тут будем добавлять парсинг разных источников
  // Пока заглушка - в будущем парсим:
  // - SBR (sportsbookreview.com)
  // - AskGamblers
  // - Trustpilot
  // - Reddit
  // - Специализированные форумы
  
  return results;
}

// Поиск новых БК по региону
async function discoverBookmakers(region) {
  console.log(`\n🌍 Поиск БК в регионе: ${REGIONS[region].name}`);
  
  const discovered = [];
  
  // Тут будем парсить списки БК
  // - Oddschecker
  // - Bookmaker ratings sites
  // - Regional gambling sites
  
  return discovered;
}

// Основная функция
async function main() {
  console.log('='.repeat(60));
  console.log('🎾 BOOKMAKERS RESEARCH - ITF Tennis Courtsiding');
  console.log('='.repeat(60));
  
  console.log('\n📋 Критерии оценки:');
  Object.entries(CRITERIA).forEach(([key, val]) => {
    console.log(`   ${val.weight}% - ${val.description}`);
  });
  
  console.log(`\n📊 Известных БК для анализа: ${KNOWN_BOOKMAKERS.length}`);
  
  // Группируем по регионам
  const byRegion = {};
  KNOWN_BOOKMAKERS.forEach(bk => {
    if (!byRegion[bk.region]) byRegion[bk.region] = [];
    byRegion[bk.region].push(bk);
  });
  
  console.log('\n🌍 По регионам:');
  Object.entries(byRegion).forEach(([region, bks]) => {
    const regionName = REGIONS[region]?.name || region;
    console.log(`   ${regionName}: ${bks.length} БК`);
  });
  
  // Предварительный рейтинг на основе известной информации
  console.log('\n' + '='.repeat(60));
  console.log('⭐ ПРЕДВАРИТЕЛЬНЫЙ РЕЙТИНГ (для courtsiding ITF)');
  console.log('='.repeat(60));
  
  const preliminary = [
    { name: '1xBet/Melbet/22bet', score: 85, reason: 'Много ITF, терпят дольше, но мутный вывод' },
    { name: 'Pinnacle', score: 75, reason: 'Не режут лимиты, но линии быстрые' },
    { name: 'Stake (крипто)', score: 80, reason: 'Быстрый вывод, терпят, но проверить ITF' },
    { name: 'Dafabet', score: 70, reason: 'Хороший ITF, азия' },
    { name: 'SBOBET', score: 65, reason: 'Профи принимают, но нужен агент' },
    { name: 'Marathonbet', score: 60, reason: 'Есть ITF, средне по лимитам' },
    { name: 'Bet365', score: 50, reason: 'Отличный ITF, но режут моментально' },
    { name: 'Betfair', score: 40, reason: 'Биржа - линии слишком быстрые' },
  ];
  
  preliminary.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.name} [${item.score}/100]`);
    console.log(`   ${item.reason}`);
  });
  
  // Сохраняем данные
  const output = {
    generated: new Date().toISOString(),
    criteria: CRITERIA,
    regions: REGIONS,
    bookmakers: KNOWN_BOOKMAKERS,
    preliminary_rating: preliminary
  };
  
  fs.writeFileSync('bookmakers-data.json', JSON.stringify(output, null, 2));
  console.log('\n\n💾 Данные сохранены в bookmakers-data.json');
  
  console.log('\n' + '='.repeat(60));
  console.log('📝 СЛЕДУЮЩИЕ ШАГИ:');
  console.log('='.repeat(60));
  console.log(`
1. Глубокий ресёрч топ-10 БК:
   - Проверить ITF покрытие (зайти на сайт)
   - Найти отзывы о лимитах на форумах
   - Проверить скорость вывода
   
2. Добавить парсеры:
   - SBR (sportsbookreview.com)
   - Trustpilot отзывы
   - Reddit (r/sportsbook, r/sportsbetting)
   
3. Тестовые аккаунты:
   - Создать по 1 акку на топ БК
   - Проверить ITF лайв наличие
   - Замерить задержку линий
  `);
}

main().catch(console.error);
