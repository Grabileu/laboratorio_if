const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

function loadConfig() {
  const filePath = path.join(ROOT, '.env');
  const config = {};

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const [key, ...rest] = trimmed.split('=');
      config[key.trim()] = rest.join('=').trim();
    });
  }

  return {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'cientista123',
    SECRET_CODE: process.env.SECRET_CODE || config.SECRET_CODE || '9742',
  };
}

let secretConfig = loadConfig();

function evaluateGuess(guess, code) {
  const results = new Array(guess.length);
  const codeRemaining = code.split('');

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === code[i]) {
      results[i] = { label: 'POSIÇÃO CERTA', className: 'success' };
      codeRemaining[i] = null;
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (results[i]) continue;
    const idx = codeRemaining.indexOf(guess[i]);
    if (idx !== -1) {
      results[i] = { label: 'CERTA, MAS POSIÇÃO ERRADA', className: 'warning' };
      codeRemaining[idx] = null;
    } else {
      results[i] = { label: 'ERRADO', className: 'danger' };
    }
  }

  return results;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload muito grande.'));
      }
    });

    req.on('end', () => {
      if (!body) return resolve({});

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON inválido.'));
      }
    });

    req.on('error', reject);
  });
}

function resolveStaticFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
  };

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    throw new Error('Arquivo não encontrado');
  });

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/admin-login' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const password = String(payload.password || '').trim();

      if (password === secretConfig.ADMIN_PASSWORD) {
        return sendJson(res, 200, { success: true });
      }

      return sendJson(res, 401, { success: false, error: 'Senha incorreta.' });
    } catch (error) {
      return sendJson(res, 400, { success: false, error: error.message || 'Requisição inválida.' });
    }
  }

  if (url.pathname === '/api/change-code' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const password = String(payload.password || '').trim();
      const code = String(payload.code || '').replace(/\D/g, '').slice(0, 4);

      if (password !== secretConfig.ADMIN_PASSWORD) {
        return sendJson(res, 401, { success: false, error: 'Senha incorreta.' });
      }

      if (!/^\d{4}$/.test(code)) {
        return sendJson(res, 400, { success: false, error: 'O código deve ter 4 dígitos.' });
      }

      secretConfig.SECRET_CODE = code;
      return sendJson(res, 200, { success: true, code });
    } catch (error) {
      return sendJson(res, 400, { success: false, error: error.message || 'Requisição inválida.' });
    }
  }

  if (url.pathname === '/api/submit-guess' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const guess = String(payload.guess || '').replace(/\D/g, '');

      if (!/^\d{4}$/.test(guess)) {
        return sendJson(res, 400, { success: false, error: 'Informe os 4 dígitos.' });
      }

      const results = evaluateGuess(guess, secretConfig.SECRET_CODE);
      const correct = results.every((item) => item.className === 'success');

      return sendJson(res, 200, {
        success: true,
        correct,
        results,
        answer: secretConfig.SECRET_CODE,
      });
    } catch (error) {
      return sendJson(res, 400, { success: false, error: error.message || 'Requisição inválida.' });
    }
  }

  if (url.pathname.includes('/.') || path.basename(url.pathname).startsWith('.')) {
    return sendJson(res, 403, { error: 'Acesso negado.' });
  }

  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { error: 'Arquivo não encontrado.' });
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    return sendJson(res, 500, { error: 'Erro ao carregar recurso.' });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
