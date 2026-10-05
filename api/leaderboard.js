const LEADERBOARD_KEY = 'dev-arena:leaderboard';
const PLAYER_NAMES_KEY = 'dev-arena:player-names';

function getRedisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ''),
    token
  };
}

async function executePipeline(config, commands) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  const results = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(results)) {
    console.error('Resposta inválida do Upstash:', response.status);
    throw new Error('Falha ao consultar o banco do placar.');
  }

  const failedCommand = results.find(result => result.error);
  if (failedCommand) {
    console.error('Erro em comando do placar:', failedCommand.error);
    throw new Error('Falha ao executar uma operação no placar.');
  }

  return results.map(result => result.result);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const config = getRedisConfig();

  if (!config) {
    return res.status(503).json({
      error: 'Placar não configurado. Configure as variáveis do Upstash Redis no Vercel.'
    });
  }

  try {
    if (req.method === 'GET') {
      const [scores] = await executePipeline(config, [
        ['ZREVRANGE', LEADERBOARD_KEY, '0', '9', 'WITHSCORES']
      ]);

      if (!Array.isArray(scores) || scores.length === 0) {
        return res.status(200).json({ entries: [] });
      }

      const members = [];
      for (let index = 0; index < scores.length; index += 2) {
        members.push(scores[index]);
      }

      const [names] = await executePipeline(config, [
        ['HMGET', PLAYER_NAMES_KEY, ...members]
      ]);

      const entries = members.map((member, index) => ({
        name: names?.[index] || member,
        score: Number(scores[index * 2 + 1])
      }));

      return res.status(200).json({ entries });
    }

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: 'O corpo da requisição não contém um JSON válido.'
        });
      }
    }

    const name = typeof body?.name === 'string'
      ? body.name.trim().replace(/\s+/g, ' ').slice(0, 40)
      : '';

    const score = Number(body?.score);

    if (!name || !Number.isInteger(score) || score < 0 || score > 100) {
      return res.status(400).json({
        error: 'Informe um nome e uma nota inteira entre 0 e 100.'
      });
    }

    const member = name.normalize('NFKC').toLocaleLowerCase('pt-BR');

    await executePipeline(config, [
      ['ZADD', LEADERBOARD_KEY, 'GT', String(score), member],
      ['HSET', PLAYER_NAMES_KEY, member, name]
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no placar:', error.message);

    return res.status(502).json({
      error: 'Não foi possível acessar o banco do placar.'
    });
  }
}
