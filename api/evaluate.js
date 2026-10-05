export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  let body = req.body;
  try {
    if (typeof body === 'string') {
      body = JSON.parse(body);
    } else if (body == null && req[Symbol.asyncIterator]) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch (error) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }

  const { task, submissions, type } = body || {};
  if (!task || !submissions || !type) {
    return res.status(400).json({ error: 'Dados incompletos enviados pela arena.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'A chave da API do Gemini não está configurada no Vercel.' });
  }

  const systemPrompt = type === 'prompt'
    ? `Você é um juiz especialista em Engenharia de Prompts. Receberá um desafio e uma lista de prompts submetidos. Avalie cada um considerando: 1. Precisão e Clareza: restringe alucinações? 2. Técnicas: usa personas, few-shot ou define formato? Atribua uma nota de 0 a 100 para cada um. Retorne somente o JSON solicitado.`
    : `Você é um Tech Lead Sênior avaliando código. Receberá um desafio algorítmico e soluções de competidores. Avalie rigorosamente: 1. Correção: resolve o problema? 2. Complexidade de tempo e espaço 3. Clean Code. Atribua uma nota de 0 a 100 para cada um. Retorne somente o JSON solicitado.`;

  const rankingSchema = {
    type: 'object',
    properties: {
      ranking: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nota: { type: 'integer' },
            justificativa: { type: 'string', description: 'Avaliação técnica direta, 1 a 2 frases.' }
          },
          required: ['id', 'nota', 'justificativa']
        }
      }
    },
    required: ['ranking']
  };

  const input = `${systemPrompt}\n\nDesafio: ${task}\n\nSubmissões: ${JSON.stringify(submissions)}`;

  try {
    // Chamada direta e única ao modelo principal
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: input }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: rankingSchema
          }
        })
      }
    );

    const responseText = await response.text();
    
    // Captura exata do erro real se a API falhar
    if (!response.ok) {
      console.error("Erro da API Gemini:", responseText);
      let errorMsg = 'Falha ao consultar o Gemini.';
      try {
        errorMsg = JSON.parse(responseText).error.message;
      } catch(e) {}
      return res.status(502).json({ error: errorMsg });
    }

    const result = JSON.parse(responseText);
    const outText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!outText) {
      return res.status(502).json({ error: 'O Gemini retornou uma resposta vazia.' });
    }

    return res.status(200).json(JSON.parse(outText));

  } catch (error) {
    console.error('Erro no handler:', error);
    return res.status(500).json({ error: 'Erro interno do servidor ao processar a avaliação.' });
  }
}
