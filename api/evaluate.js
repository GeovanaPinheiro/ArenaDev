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
    console.error('Corpo JSON inválido:', error.message);
    return res.status(400).json({
      error: 'O corpo da requisição não contém um JSON válido.',
      code: 'INVALID_JSON'
    });
  }

  const { task, submissions, type } = body || {};
  const missingFields = [];
  
  if (typeof task !== 'string' || !task.trim()) {
    missingFields.push('task');
  }
  if (!Array.isArray(submissions) || submissions.length === 0) {
    missingFields.push('submissions');
  }
  if (!['prompt', 'logic'].includes(type)) {
    missingFields.push('type');
  }

  if (missingFields.length > 0) {
    console.error(
      'Requisição de avaliação inválida; campos ausentes ou inválidos:',
      missingFields
    );
    return res.status(400).json({
      error: `Requisição inválida. Verifique os campos: ${missingFields.join(', ')}.`,
      code: 'INVALID_REQUEST',
      fields: missingFields
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Chave da API não configurada no servidor'
    });
  }

  // Modelos atualizados para garantir compatibilidade com a chave gratuita
  const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest'];

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
            justificativa: {
              type: 'string',
              description: 'Avaliação técnica direta, de uma a duas frases.'
            }
          },
          required: ['id', 'nota', 'justificativa']
        }
      }
    },
    required: ['ranking']
  };

  const input = `${systemPrompt} Avalie todas as submissões para o desafio informado. Preserve os IDs recebidos. Dados: ${JSON.stringify({ desafio: task, submissoes: submissions })}`;

  try {
    let geminiResponse;
    let lastErrorText = '';

    for (const model of models) {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: input }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: rankingSchema
            }
          })
        }
      );

      if (geminiResponse.ok) {
        break;
      }

      lastErrorText = await geminiResponse.text();
      console.error(`Erro Gemini (${model}):`, lastErrorText);

      const canTryAnotherModel =
        [404, 429, 500, 502, 503, 504].includes(geminiResponse.status) &&
        model !== models[models.length - 1];

      if (canTryAnotherModel) {
        continue;
      }

      if ([429, 503].includes(geminiResponse.status)) {
        return res.status(503).json({
          error: 'A IA avaliadora está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
          code: 'AI_UNAVAILABLE'
        });
      }

      let providerMessage = 'Falha ao consultar o Gemini.';
      try {
        const providerError = JSON.parse(lastErrorText);
        providerMessage = providerError.error?.message || providerMessage;
      } catch {
        providerMessage = lastErrorText || providerMessage;
      }

      return res.status(502).json({
        error: providerMessage,
        code: geminiResponse.status === 404
          ? 'MODEL_NOT_AVAILABLE'
          : 'GEMINI_REQUEST_FAILED'
      });
    }

    if (!geminiResponse || !geminiResponse.ok) {
      console.error('Todos os modelos Gemini falharam:', lastErrorText);
      return res.status(503).json({
        error: 'A IA avaliadora está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
        code: 'AI_UNAVAILABLE'
      });
    }

    const result = await geminiResponse.json();
    
    // Extração correta do texto da resposta estruturada da API do Gemini
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.error(
        'Resposta do Gemini sem texto de saída:',
        JSON.stringify(result)
      );
      return res.status(502).json({
        error: 'O Gemini retornou uma resposta vazia ou inválida.',
        code: 'EMPTY_MODEL_RESPONSE'
      });
    }

    const parsed = JSON.parse(responseText);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Erro no handler:', error);
    return res.status(500).json({
      error: 'Erro interno ao avaliar submissões.'
    });
  }
}
