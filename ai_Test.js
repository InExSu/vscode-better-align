import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для парсинга .env файла
function loadEnvFile(envPath = '.env') {
  const envFile = fs.readFileSync(path.resolve(__dirname, envPath), 'utf8');
  const envVars = {};
  
  envFile.split('\n').forEach(line => {
    // Пропускаем комментарии и пустые строки
    if (line.startsWith('#') || !line.trim()) {return;}
    
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    
    if (key && value) {
      envVars[key.trim()] = value;
    }
  });
  
  return envVars;
}

// Загружаем переменные
const env = loadEnvFile();
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
const OPENCODE_API_KEY = env.OPENCODE_API_KEY;

console.log('OpenCode Key:', OPENCODE_API_KEY?.substring(0, 10) + '...');
console.log('OpenRouter Key:', OPENROUTER_API_KEY?.substring(0, 10) + '...');

// Ваш fetch запрос
async function getKeyInfo() {
  const response = await fetch('https://openrouter.ai/api/v1/key', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
  });
  const keyInfo = await response.json();
  console.log(keyInfo);
}

getKeyInfo();