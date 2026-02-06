/**
 * Platform Monitor - Мониторинг платформ с бонусами
 * 
 * Источники:
 * - BankRewards.io (банки, брокеры, кредитки)
 * - Product Hunt (стартапы)
 * - HackerNews Launch HN
 */

const https = require('https');

// Конфигурация
const CONFIG = {
  // Минимальный бонус для алерта
  minBonus: 50, // $50+
  
  // Типы выгоды
  bonusTypes: [
    'airdrop', 'signup', 'sign-up', 'referral', 'cashback',
    'lifetime', 'giveaway', 'beta', 'credits', 'free'
  ],
  
  // Категории платформ
  categories: [
    'fintech', 'finance', 'crypto', 'web3', 'defi', 'banking',
    'brokerage', 'trading', 'saas', 'marketplace'
  ],
  
  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
};

/**
 * HTTP GET запрос
 */
function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      }
    };
    
    https.get(reqOptions, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, options).then(resolve).catch(reject);
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Парсит BankRewards.io
 */
async function fetchBankRewards() {
  const results = [];
  
  // Парсим разные категории
  const pages = [
    'https://www.bankrewards.io/bank',
    'https://www.bankrewards.io/brokerage', 
    'https://www.bankrewards.io/card'
  ];
  
  for (const pageUrl of pages) {
    try {
      const html = await httpGet(pageUrl);
      const offers = parseBankRewardsPage(html, pageUrl);
      results.push(...offers);
    } catch (e) {
      console.log(`   ⚠️ Ошибка загрузки ${pageUrl}: ${e.message}`);
    }
  }
  
  return results;
}

/**
 * Парсит страницу BankRewards
 */
function parseBankRewardsPage(html, sourceUrl) {
  const offers = [];
  const category = sourceUrl.includes('/bank') ? 'Bank' : 
                   sourceUrl.includes('/brokerage') ? 'Brokerage' : 'Credit Card';
  
  // Ищем карточки офферов
  // Паттерн: название, бонус в $, требования
  const bonusRegex = /\$(\d{1,3}(?:,\d{3})*|\d+)/g;
  const cardRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
  
  // Простой парсинг - ищем суммы бонусов
  let match;
  const seenNames = new Set();
  
  // Ищем структурированные данные
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (jsonLdMatch) {
    jsonLdMatch.forEach(block => {
      try {
        const jsonStr = block.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
        const data = JSON.parse(jsonStr);
        if (data.offers || data.name) {
          // Обработка структурированных данных
        }
      } catch (e) {}
    });
  }
  
  // Fallback: regex парсинг
  // Ищем паттерны типа "Bonus $XXX" или "$XXX bonus"
  const sections = html.split(/<(?:div|article|section)[^>]*class="[^"]*card[^"]*"[^>]*>/i);
  
  sections.forEach(section => {
    const bonusMatch = section.match(/\$(\d{1,3}(?:,\d{3})*)/);
    const nameMatch = section.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i) || 
                      section.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
    
    if (bonusMatch && nameMatch) {
      const bonus = parseInt(bonusMatch[1].replace(/,/g, ''));
      const name = nameMatch[1].trim();
      
      if (bonus >= CONFIG.minBonus && !seenNames.has(name)) {
        seenNames.add(name);
        offers.push({
          name: name,
          bonus: bonus,
          tagline: `$${bonus} bonus`,
          url: sourceUrl,
          source: `BankRewards (${category})`,
          type: 'signup'
        });
      }
    }
  });
  
  // Дополнительный парсинг из текста
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const offerPattern = /([A-Z][a-zA-Z\s®]+)(?:\s+(?:Checking|Savings|Brokerage|Account|Card))?\s+Bonus\s+\$(\d{1,3}(?:,\d{3})*)/g;
  
  while ((match = offerPattern.exec(textContent)) !== null) {
    const name = match[1].trim();
    const bonus = parseInt(match[2].replace(/,/g, ''));
    
    if (bonus >= CONFIG.minBonus && !seenNames.has(name)) {
      seenNames.add(name);
      offers.push({
        name: name,
        bonus: bonus,
        tagline: `$${bonus} signup bonus`,
        url: sourceUrl,
        source: `BankRewards (${category})`,
        type: 'signup'
      });
    }
  }
  
  return offers;
}

/**
 * Парсит Product Hunt
 */
async function fetchProductHunt() {
  const html = await httpGet('https://www.producthunt.com/');
  return parseProductHunt(html);
}

function parseProductHunt(html) {
  const products = [];
  
  const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const posts = data?.props?.initialState?.homefeed?.edges || [];
      
      posts.forEach(edge => {
        const node = edge?.node;
        if (node) {
          products.push({
            name: node.name || 'Unknown',
            tagline: node.tagline || '',
            url: `https://www.producthunt.com/posts/${node.slug}`,
            votes: node.votesCount || 0,
            source: 'ProductHunt',
            type: 'startup'
          });
        }
      });
    } catch (e) {
      // Fallback
      const nameRegex = /"name":"([^"]+)"/g;
      let match;
      while ((match = nameRegex.exec(html)) !== null) {
        products.push({
          name: match[1],
          tagline: '',
          url: 'https://producthunt.com',
          votes: 0,
          source: 'ProductHunt',
          type: 'startup'
        });
      }
    }
  }
  
  return products.slice(0, 20);
}

/**
 * Парсит HackerNews Launch HN
 */
async function fetchHackerNews() {
  const data = await httpGet('https://hn.algolia.com/api/v1/search?query=Launch%20HN&tags=story');
  try {
    return parseHackerNews(JSON.parse(data));
  } catch (e) {
    return [];
  }
}

function parseHackerNews(data) {
  if (!data.hits) return [];
  
  return data.hits
    .filter(hit => {
      const title = hit.title?.toLowerCase() || '';
      return title.includes('launch hn');
    })
    .map(hit => ({
      name: hit.title?.replace(/^Launch HN:\s*/i, '') || 'Unknown',
      tagline: '',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      votes: hit.points || 0,
      source: 'HackerNews',
      type: 'startup',
      date: hit.created_at
    }))
    .slice(0, 10);
}

/**
 * Проверяет бонусные ключевые слова
 */
function hasBonusKeywords(text) {
  const lower = text.toLowerCase();
  return CONFIG.bonusTypes.some(kw => lower.includes(kw));
}

/**
 * Проверяет категорию
 */
function hasRelevantCategory(text) {
  const lower = text.toLowerCase();
  return CONFIG.categories.some(cat => lower.includes(cat));
}

/**
 * Фильтрует и ранжирует
 */
function filterAndRank(items) {
  return items
    .map(item => {
      const combined = `${item.name} ${item.tagline || ''}`.toLowerCase();
      const hasBonus = hasBonusKeywords(combined) || item.bonus > 0;
      const hasCategory = hasRelevantCategory(combined);
      
      // Score: бонус в $ + ключевые слова + категория
      let score = 0;
      if (item.bonus) score += Math.min(item.bonus / 10, 50); // До 50 очков за сумму
      if (hasBonus) score += 10;
      if (hasCategory) score += 5;
      if (item.votes) score += Math.min(item.votes / 10, 5);
      
      return { ...item, hasBonus, hasCategory, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Форматирует оффер для вывода
 */
function formatOffer(item) {
  const emoji = item.bonus ? '💰' : item.hasBonus ? '🎁' : '🚀';
  const bonusText = item.bonus ? ` ($${item.bonus})` : '';
  
  return {
    emoji,
    title: `${item.name}${bonusText}`,
    tagline: item.tagline || 'No description',
    url: item.url,
    source: item.source,
    score: item.score
  };
}

/**
 * Отправляет Telegram алерт
 */
async function sendTelegramAlert(items) {
  const formatted = items.slice(0, 10).map(formatOffer);
  
  if (!CONFIG.telegramBotToken || !CONFIG.telegramChatId) {
    console.log('\n📱 Результаты (Telegram не настроен):\n');
    formatted.forEach(f => {
      console.log(`${f.emoji} ${f.title}`);
      console.log(`   ${f.tagline}`);
      console.log(`   ${f.url}`);
      console.log(`   Source: ${f.source} | Score: ${f.score.toFixed(1)}`);
      console.log('');
    });
    return;
  }
  
  const message = formatted.slice(0, 5).map(f => 
    `${f.emoji} *${f.title}*\n` +
    `├ ${f.tagline}\n` +
    `├ Source: ${f.source}\n` +
    `└ [Link](${f.url})`
  ).join('\n\n');
  
  const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`;
  
  const data = JSON.stringify({
    chat_id: CONFIG.telegramChatId,
    text: `🔔 *Platform Monitor Alert*\n\n${message}`,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      resolve(res.statusCode);
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Main
 */
async function main() {
  console.log('🔍 Platform Monitor v2.0');
  console.log(`Минимальный бонус: $${CONFIG.minBonus}`);
  console.log('');
  
  const allItems = [];
  
  // BankRewards.io
  try {
    console.log('🏦 Загрузка BankRewards.io...');
    const bankOffers = await fetchBankRewards();
    console.log(`   Найдено: ${bankOffers.length} офферов $${CONFIG.minBonus}+`);
    allItems.push(...bankOffers);
  } catch (e) {
    console.log(`   ❌ Ошибка: ${e.message}`);
  }
  
  // Product Hunt
  try {
    console.log('📦 Загрузка Product Hunt...');
    const phProducts = await fetchProductHunt();
    console.log(`   Найдено: ${phProducts.length}`);
    allItems.push(...phProducts);
  } catch (e) {
    console.log(`   ❌ Ошибка: ${e.message}`);
  }
  
  // HackerNews
  try {
    console.log('📰 Загрузка HackerNews...');
    const hnProducts = await fetchHackerNews();
    console.log(`   Найдено: ${hnProducts.length}`);
    allItems.push(...hnProducts);
  } catch (e) {
    console.log(`   ❌ Ошибка: ${e.message}`);
  }
  
  console.log('');
  console.log(`Всего: ${allItems.length}`);
  
  // Фильтруем и ранжируем
  const filtered = filterAndRank(allItems);
  console.log(`После фильтрации: ${filtered.length}`);
  
  if (filtered.length > 0) {
    await sendTelegramAlert(filtered);
    console.log('\n✅ Готово');
  } else {
    console.log('Нет офферов, соответствующих критериям');
  }
}

main();
