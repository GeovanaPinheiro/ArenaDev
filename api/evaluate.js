export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { task, submission, type } = req.body;

  if (!task || !submission || !type) {
    return res.status(400).json({ error: 'Dados incompletos na requisição' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API não configurada no servidor' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  let systemPrompt = '';
  if (type === 'prompt') {
    systemPrompt = `Você é um juiz especialista em Engenharia de Prompts.
Receberá um desafio e o prompt submetido por um participante.
Avalie considerando:
1. Precisão e Clareza: Restringe alucinações?
2. Técnicas: Usa personas, few-shot, ou define formato?
Atribua uma nota de 0 a 100.
Retorne um JSON estrito validando o schema solicitado.`;
  } else {
    systemPrompt = `Você é um Tech Lead Sênior avaliando código.
Receberá um desafio algorítmico e a solução submetida por um participante.
Avalie rigorosamente:
1. Correção (resolve o problema?).
2. Complexidade de Tempo/Espaço (Eficiência).
3. Clean Code.
Atribua uma nota de 0 a 100.
Retorne um JSON estrito validando o schema solicitado.`;
  }

  const payload = {
    contents: [{ parts: [{ text: JSON.stringify({ desafio: task, submissao: submission }) }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          nota: { type: 'INTEGER' },
          justificativa: { type: 'STRING', description: 'Avaliação técnica direta, 1 a 2 frases.' }
        },
        required: ['nota', 'justificativa']
      }
    }
  };

  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 1500; // tempo entre tentativas, aumenta a cada retry

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        const isOverloaded = geminiResponse.status === 503 || geminiResponse.status === 429;

        console.error(`Erro Gemini (tentativa ${attempt}/${MAX_ATTEMPTS}):`, errText);

        // Se o modelo está sobrecarregado (503) ou com rate limit (429) e ainda temos tentativas, espera e tenta de novo
        if (isOverloaded && attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * attempt); // backoff crescente: 1.5s, depois 3s
          continue;
        }

        return res.status(502).json({
          error: isOverloaded
            ? 'O modelo de IA está sobrecarregado no momento. Tente submeter novamente em alguns segundos.'
            : 'Falha ao consultar o Gemini'
        });
      }

      const result = await geminiResponse.json();
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);

      return res.status(200).json(parsed);
    } catch (error) {
      console.error(`Erro no handler (tentativa ${attempt}/${MAX_ATTEMPTS}):`, error);

      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      return res.status(500).json({ error: 'Erro interno ao avaliar submissão' });
    }
  }
}
