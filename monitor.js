/**
 * Platform Monitor - Мониторинг новых платформ
 * 
 * Отслеживает Product Hunt, BetaList, HackerNews
 * Ищет платформы с бонусами для early adopters
 */

const https = require('https');

// Конфигурация
const CONFIG = {
  // Интересующие категории
  categories: [
    'fintech', 'finance', 'crypto', 'web3', 'defi',
    'productivity', 'saas', 'marketplace', 'tools'
  ],
  
  // Ключевые слова для поиска бонусов
  bonusKeywords: [
    'free', 'bonus', 'reward', 'early', 'beta', 'credits',
    'lifetime', 'discount', 'launch', 'promo', 'giveaway'
  ],
  
  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
};

/**
 * Парсит Product Hunt главную страницу
 */
async function fetchProductHunt() {
  return new Promise((resolve, reject) => {
    https.get('https://www.producthunt.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlatformMonitor/1.0)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Парсит BetaList
 */
async function fetchBetaList() {
  return new Promise((resolve, reject) => {
    https.get('https://betalist.com/startups', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlatformMonitor/1.0)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Парсит HackerNews Launch HN
 */
async function fetchHackerNews() {
  return new Promise((resolve, reject) => {
    https.get('https://hn.algolia.com/api/v1/search?query=Launch%20HN&tags=story', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ hits: [] });
        }
      });
    }).on('error', reject);
  });
}

/**
 * Извлекает продукты из HTML Product Hunt
 */
function parseProductHunt(html) {
  const products = [];
  
  // Ищем JSON данные в странице
  const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      // Структура может меняться, базовый парсинг
      const posts = data?.props?.initialState?.homefeed?.edges || [];
      
      posts.forEach(edge => {
        const node = edge?.node;
        if (node) {
          products.push({
            name: node.name || 'Unknown',
            tagline: node.tagline || '',
            url: `https://www.producthunt.com/posts/${node.slug}`,
            votes: node.votesCount || 0,
            source: 'ProductHunt'
          });
        }
      });
    } catch (e) {
      // Fallback: простой regex парсинг
      const nameRegex = /"name":"([^"]+)"/g;
      let match;
      while ((match = nameRegex.exec(html)) !== null) {
        products.push({
          name: match[1],
          tagline: '',
          url: 'https://producthunt.com',
          votes: 0,
          source: 'ProductHunt'
        });
      }
    }
  }
  
  return products.slice(0, 20); // Топ 20
}

/**
 * Парсит HackerNews результаты
 */
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
      date: hit.created_at
    }))
    .slice(0, 10);
}

/**
 * Проверяет наличие бонусных ключевых слов
 */
function hasBonusKeywords(text) {
  const lower = text.toLowerCase();
  return CONFIG.bonusKeywords.some(kw => lower.includes(kw));
}

/**
 * Проверяет релевантную категорию
 */
function hasRelevantCategory(text) {
  const lower = text.toLowerCase();
  return CONFIG.categories.some(cat => lower.includes(cat));
}

/**
 * Фильтрует и ранжирует продукты
 */
function filterProducts(products) {
  return products
    .map(p => {
      const combined = `${p.name} ${p.tagline}`.toLowerCase();
      const hasBonus = hasBonusKeywords(combined);
      const hasCategory = hasRelevantCategory(combined);
      
      return {
        ...p,
        hasBonus,
        hasCategory,
        score: (hasBonus ? 10 : 0) + (hasCategory ? 5 : 0) + Math.min(p.votes / 10, 5)
      };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Отправляет алерт в Telegram
 */
async function sendTelegramAlert(products) {
  if (!CONFIG.telegramBotToken || !CONFIG.telegramChatId) {
    console.log('\n📱 Результаты (Telegram не настроен):\n');
    products.forEach(p => {
      const bonus = p.hasBonus ? '🎁' : '';
      console.log(`${bonus} ${p.name}`);
      console.log(`   ${p.tagline || 'No tagline'}`);
      console.log(`   ${p.url}`);
      console.log(`   Source: ${p.source} | Score: ${p.score.toFixed(1)}`);
      console.log('');
    });
    return;
  }
  
  const message = products.slice(0, 5).map(p => {
    const bonus = p.hasBonus ? '🎁 ' : '';
    return `${bonus}*${p.name}*\n` +
      `├ ${p.tagline || 'No tagline'}\n` +
      `├ Source: ${p.source}\n` +
      `└ [Link](${p.url})`;
  }).join('\n\n');
  
  const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`;
  
  const data = JSON.stringify({
    chat_id: CONFIG.telegramChatId,
    text: `🚀 *New Platforms Alert*\n\n${message}`,
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
 * Основная функция
 */
async function main() {
  console.log('🚀 Platform Monitor запущен...');
  console.log(`Категории: ${CONFIG.categories.join(', ')}`);
  console.log(`Бонус-слова: ${CONFIG.bonusKeywords.join(', ')}`);
  console.log('');
  
  const allProducts = [];
  
  try {
    // Product Hunt
    console.log('📦 Загрузка Product Hunt...');
    const phHtml = await fetchProductHunt();
    const phProducts = parseProductHunt(phHtml);
    console.log(`   Найдено: ${phProducts.length}`);
    allProducts.push(...phProducts);
  } catch (e) {
    console.log(`   ❌ Ошибка: ${e.message}`);
  }
  
  try {
    // HackerNews
    console.log('📰 Загрузка HackerNews...');
    const hnData = await fetchHackerNews();
    const hnProducts = parseHackerNews(hnData);
    console.log(`   Найдено: ${hnProducts.length}`);
    allProducts.push(...hnProducts);
  } catch (e) {
    console.log(`   ❌ Ошибка: ${e.message}`);
  }
  
  console.log('');
  console.log(`Всего продуктов: ${allProducts.length}`);
  
  // Фильтруем
  const filtered = filterProducts(allProducts);
  console.log(`После фильтрации: ${filtered.length}`);
  
  if (filtered.length > 0) {
    await sendTelegramAlert(filtered);
    console.log('✅ Готово');
  } else {
    console.log('Нет продуктов, соответствующих критериям');
  }
}

// Запуск
main();
