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
    return res.status(400).json({ error: 'O corpo da requisição não contém um JSON válido.' });
  }

  const { task, submissions, type } = body || {};
  if (!task || !submissions || !type) {
    return res.status(400).json({ error: 'Requisição inválida. Faltam dados do desafio.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API não configurada no servidor' });
  }

  // Voltando estritamente ao modelo tradicional que funcionava no seu código
  const model = 'gemini-flash-lite-latest';

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
            justificativa: { type: 'string' }
          },
          required: ['id', 'nota', 'justificativa']
        }
      }
    },
    required: ['ranking']
  };

  const input = `${systemPrompt} Avalie todas as submissões para o desafio informado. Preserve os IDs recebidos. Dados: ${JSON.stringify({ desafio: task, submissoes: submissions })}`;

  try {
    // Restaurando a chamada original que funcionava para si
    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: model,
          input: input,
          store: false,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: rankingSchema
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Erro Gemini:', errorText);
      
      // Se a API estiver temporariamente ocupada, avisa o frontend para tentar novamente
      if ([429, 503].includes(geminiResponse.status)) {
        return res.status(503).json({
          error: 'A IA avaliadora está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
          code: 'AI_UNAVAILABLE'
        });
      }
      
      return res.status(502).json({ error: 'Falha ao consultar o Gemini.' });
    }

    const result = await geminiResponse.json();
    
    // Restaurando a extração original de texto
    const responseText = result.output_text 
      || result.steps
          ?.filter(step => step.type === 'model_output')
          .flatMap(step => step.content || [])
          .filter(content => content.type === 'text')
          .map(content => content.text)
          .join('');

    if (!responseText) {
      return res.status(502).json({ error: 'O Gemini retornou uma resposta vazia ou inválida.' });
    }

    const parsed = JSON.parse(responseText);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Erro no handler:', error);
    return res.status(500).json({ error: 'Erro interno ao avaliar submissões.' });
  }
}
