// Sugestão de descanso ao volante (trazida do pacote v5). É recomendação de segurança, não regra legal
// para motorista não profissional: o intervalo e a parada mínima vêm de regras.json.

/**
 * etapas: [{ saidaUTC, duracao_s, saidaParadaUTC?, chegadaUTC, amostras: [{ c, dt }] }] de um sentido.
 * Uma parada de pelo menos `paradaMinimaMin` zera o tempo ao volante.
 * Retorna [{ trecho, t (ms), segundosNoTrecho, c ([lon, lat] ou null) }].
 */
export function sugerirDescansos(etapas, { intervaloH = 2, paradaMinimaMin = 15 } = {}) {
  const intervalo = Number(intervaloH) * 3600;
  const sugestoes = [];
  if (!(intervalo > 0)) return sugestoes;
  let aoVolante = 0;
  etapas.forEach((e, i) => {
    const d = Number(e.duracao_s) || 0;
    // Próximo descanso dentro deste trecho. Se o tempo ao volante já chegou ao limite (ex.: trecho anterior
    // de exatamente 2 h), o descanso é logo no início deste trecho. O passo é sempre o intervalo inteiro (> 0),
    // então o laço sempre termina.
    let proximo = Math.max(0, intervalo - aoVolante);
    let ultimo = null;
    while (proximo < d) {
      const pos = proximo;
      const amostra = (e.amostras || []).find((a) => a.dt >= pos) || null;
      sugestoes.push({ trecho: i + 1, segundosNoTrecho: pos, t: Date.parse(e.saidaUTC) + pos * 1000, c: amostra ? amostra.c : null });
      ultimo = pos;
      proximo = pos + intervalo;
    }
    aoVolante = ultimo === null ? aoVolante + d : d - ultimo;
    if (e.saidaParadaUTC) {
      const parada = (Date.parse(e.saidaParadaUTC) - Date.parse(e.chegadaUTC)) / 60000;
      if (parada >= paradaMinimaMin) aoVolante = 0;
    }
  });
  return sugestoes;
}
