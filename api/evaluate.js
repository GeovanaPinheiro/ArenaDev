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
    return res.status(500).json({ error: 'A chave da API do Gemini não está configurada.' });
  }

  // O prompt agora ensina o formato exato em vez de depender do responseSchema
  const systemPrompt = type === 'prompt'
    ? `Você é um juiz de Engenharia de Prompts. Avalie as submissões considerando: 1. Precisão 2. Técnicas. Dê uma nota de 0 a 100. Você DEVE retornar EXATAMENTE este JSON, sem nenhum texto antes ou depois: { "ranking": [ { "id": "user", "nota": 95, "justificativa": "frase curta aqui" } ] }`
    : `Você é um Tech Lead avaliando código. Avalie rigorosamente: 1. Correção 2. Complexidade 3. Clean Code. Dê uma nota de 0 a 100. Você DEVE retornar EXATAMENTE este JSON, sem nenhum texto antes ou depois: { "ranking": [ { "id": "user", "nota": 95, "justificativa": "frase curta aqui" } ] }`;

  const input = `${systemPrompt}\n\nDesafio: ${task}\n\nSubmissões: ${JSON.stringify(submissions)}`;

  try {
    // Chamada direta ao modelo mais estável e universal
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: input }] }]
        })
      }
    );

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error("Erro da API Gemini:", responseText);
      let errorMsg = 'Falha ao consultar o Gemini.';
      try {
        errorMsg = JSON.parse(responseText).error.message;
      } catch(e) {}
      return res.status(502).json({ error: errorMsg });
    }

    const result = JSON.parse(responseText);
    let outText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!outText) {
      return res.status(502).json({ error: 'O Gemini retornou uma resposta vazia.' });
    }

    // Limpeza de possíveis blocos de código (markdown) que o gemini-pro adora colocar
    outText = outText.replace(/```json/gi, '').replace(/```/g, '').trim();

    return res.status(200).json(JSON.parse(outText));

  } catch (error) {
    console.error('Erro no handler:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a avaliação.' });
  }
}
