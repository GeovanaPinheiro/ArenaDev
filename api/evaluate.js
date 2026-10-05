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

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  const systemPrompt = type === 'prompt'
    ? `Você é um juiz especialista em Engenharia de Prompts.
Receberá um desafio e uma lista de prompts submetidos.
Avalie cada um considerando:
1. Precisão e Clareza: Restringe alucinações?
2. Técnicas: Usa personas, few-shot, ou define formato?
Atribua uma nota de 0 a 100 para cada um.
Retorne um JSON estrito validando o schema solicitado.`
    : `Você é um Tech Lead Sênior avaliando código.
Receberá um desafio algorítmico e soluções de competidores.
Avalie rigorosamente:
1. Correção (resolve o problema?).
2. Complexidade de Tempo/Espaço (Eficiência).
3. Clean Code.
Atribua uma nota de 0 a 100 para cada um.
Retorne um JSON estrito validando o schema solicitado.`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: JSON.stringify({
              desafio: task,
              submissoes: submissions
            })
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          ranking: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                nota: { type: 'INTEGER' },
                justificativa: {
                  type: 'STRING',
                  description: 'Avaliação técnica direta, 1 a 2 frases.'
                }
              },
              required: ['id', 'nota', 'justificativa']
            }
          }
        },
        required: ['ranking']
      }
    }
  };

  try {
    let geminiResponse;
    let lastErrorText = '';

    for (const model of models) {
      const apiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (geminiResponse.ok) {
        break;
      }

      lastErrorText = await geminiResponse.text();
      console.error(`Erro Gemini (${model}):`, lastErrorText);

      const isTemporaryError = [429, 500, 502, 503, 504].includes(
        geminiResponse.status
      );

      if (!isTemporaryError || model === models[models.length - 1]) {
        if ([429, 503].includes(geminiResponse.status)) {
          return res.status(503).json({
            error: 'A IA avaliadora está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
            code: 'AI_UNAVAILABLE'
          });
        }

        return res.status(502).json({
          error: 'Falha ao consultar o Gemini'
        });
      }
    }

    if (!geminiResponse || !geminiResponse.ok) {
      console.error('Todos os modelos Gemini falharam:', lastErrorText);

      return res.status(503).json({
        error: 'A IA avaliadora está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
        code: 'AI_UNAVAILABLE'
      });
    }

    const result = await geminiResponse.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.error('Resposta do Gemini sem conteúdo esperado:', result);
      return res.status(502).json({
        error: 'O Gemini retornou uma resposta vazia ou inválida.'
      });
    }

    const parsed = JSON.parse(responseText);
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Erro no handler:', error);

    return res.status(500).json({
      error: 'Erro interno ao avaliar submissões'
    });
  }
}
