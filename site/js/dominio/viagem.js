// Modelo da viagem (Seção 10.1), validação por tela (Seção 2) e chaves de invalidação (Seção 3).
import { VEICULO_PADRAO, validarVeiculo } from './combustivel.js';
import { dataValida, horaValida, localParaUTC, fusoDaUF, FUSO_PADRAO } from './tempo.js';
import { FAIXAS } from './documentos.js';

export const VERSAO_ESQUEMA = 2;

// Ordem das telas do assistente. Na versão 2 o carro passou para antes das paradas
// (o combustível escolhido no carro define o preço pedido nas paradas para abastecer).
export const TELA = { QUANDO: 1, LUGARES: 2, CARRO: 3, PARADAS: 4, PESSOAS: 5, RESUMO: 6 };

// Migrações por versão de esquema: cada uma recebe a viagem e devolve a nova (sem efeitos colaterais).
const MIGRACOES = {
  // 2: carro e paradas trocaram de lugar; quem tinha parado no passo 3 (paradas) vai para o 4, e vice-versa.
  2: (v) => ({ ...v, versao_esquema: 2, tela: v.tela === 3 ? 4 : v.tela === 4 ? 3 : v.tela }),
};

/** Leva uma viagem de qualquer versão anterior até a atual. */
export function migrarViagem(v) {
  let x = v;
  for (let n = (v.versao_esquema || 1) + 1; n <= VERSAO_ESQUEMA; n++) x = MIGRACOES[n] ? MIGRACOES[n](x) : { ...x, versao_esquema: n };
  return x;
}
export const TIPOS_PARADA = ['Parada rápida', 'Pernoite'];

export function novoId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

export function novaViagem() {
  const agora = new Date().toISOString();
  return {
    id: novoId(), versao_esquema: VERSAO_ESQUEMA, criado_em: agora, atualizado_em: agora,
    revisao: 1, tela: 1, nome: '',
    datas: { ida: { data: '', hora: '08:00' }, volta: { data: '', hora: '08:00' } },
    origem: null, destino: null,
    paradas: { ida: [], volta: [] },
    veiculo: { ...VEICULO_PADRAO },
    viajantes: [],
    listas: modelosDeLista(),
    // Quem separa o que levar: '' (não respondeu), 'cada_um' ou 'uma_pessoa' (com o responsável).
    separacao: { modo: '', responsavelId: null },
    documentosConfirmados: {},
    manual: { ida: [], volta: [] },
    ajustesPedagio: {},
    abastecimentosReais: [],   // registrados durante a viagem: { id, sentido, trechoDoSentido, kmNoTrecho, modo, litros, preco, quando, lugar }
    lugaresSugeridos: {},      // cidade descoberta de cada ponto recomendado (cache, não muda a viagem)
    rotas: { ida: null, volta: null },
    historicoRotas: [],
    preparacao: { estado: 'não preparado', preparado_em: null, revisao: null },
  };
}

export function novaParada() {
  return { id: novoId(), tipo: 'Parada rápida', lugar: null, duracaoMin: 15, saidaAgendada: null, abastecer: null, preco: null };
}

export function novoViajante() {
  return { id: novoId(), nome: '', nascimento: '', faixa: '', condutor: false };
}

/**
 * Lista individual já com o básico (a pessoa pode apagar ou acrescentar itens).
 * idadeAnos: idade no início da viagem (null se não souber) — crianças recebem itens a mais.
 */
export function modeloListaIndividual(viajante, idadeAnos = null, dias = null) {
  // Roupas já vêm com a quantidade de dias da viagem (dá para mudar); o resto fica sem quantidade.
  const porDia = ['Roupas para os dias da viagem', 'Roupas íntimas e meias'];
  const item = (texto) => ({ id: novoId(), texto, feito: false, quantidade: dias && porDia.includes(texto) ? String(dias) : '' });
  const base = [
    'Roupas para os dias da viagem', 'Roupa de dormir', 'Roupas íntimas e meias', 'Casaco ou blusa de frio', 'Calçado extra',
    'Escova e pasta de dente', 'Sabonete, xampu e desodorante', 'Remédios de uso pessoal', 'Óculos, se usar', 'Carregador do celular',
  ];
  const crianca = idadeAnos !== null && idadeAnos < 12
    ? ['Brinquedo ou livro para a viagem', 'Lanche e água à mão no carro', 'Uma muda de roupa à mão no carro'] : [];
  const bebe = idadeAnos !== null && idadeAnos < 3 ? ['Fraldas e lenços umedecidos', 'Mamadeira ou chupeta'] : [];
  return {
    id: novoId(), escopo: 'individual', viajanteId: viajante.id,
    titulo: `Lista de ${viajante.nome || 'viajante'}`,
    itens: [...base, ...crianca, ...bebe].map(item),
  };
}

/**
 * Quem separa os itens de uma lista, conforme a resposta em "O que levar".
 * Devolve o nome (ou null quando não respondeu, ou quando cada um separa e a lista é a coletiva).
 */
export function separadorDaLista(v, lista) {
  const s = v.separacao || {};
  const nome = (id) => { const p = v.viajantes.find((x) => x.id === id); return p ? (p.nome || 'pessoa sem nome') : null; };
  if (s.modo === 'uma_pessoa') return nome(s.responsavelId);
  if (s.modo === 'cada_um' && lista.escopo === 'individual') return nome(lista.viajanteId);
  return null;
}

function modelosDeLista() {
  const item = (texto) => ({ id: novoId(), texto, feito: false });
  return [{
    id: novoId(), escopo: 'geral', viajanteId: null, titulo: 'Lista coletiva',
    itens: [item('Carregador de celular'), item('Estepe, macaco e triângulo'), item('Kit de primeiros socorros'), item('Água e lanches')],
  }];
}

// Fuso de um lugar: o informado pelo serviço ou o da UF.
export function fusoDe(lugar) {
  return lugar?.fuso || (lugar?.uf ? fusoDaUF(lugar.uf) : FUSO_PADRAO);
}

export function partidaUTC(v, sentido) {
  const d = v.datas[sentido];
  const lugar = sentido === 'ida' ? v.origem : v.destino;
  return localParaUTC(d.data, d.hora, fusoDe(lugar));
}

// Pontos da rota de um sentido: origem → paradas → destino (a volta não presume o caminho da ida).
export function pontosDaRota(v, sentido) {
  const inicio = sentido === 'ida' ? v.origem : v.destino;
  const fim = sentido === 'ida' ? v.destino : v.origem;
  return [inicio, ...v.paradas[sentido].map((p) => p.lugar), fim];
}

// Chave que muda quando origem, destino ou paradas mudam (invalida a rota).
export function chaveRota(v, sentido) {
  return pontosDaRota(v, sentido)
    .map((l) => (l ? `${Number(l.lat).toFixed(5)},${Number(l.lon).toFixed(5)}` : 'x'))
    .join('|');
}

/** Registra uma alteração: sobe a revisão e marca a preparação offline como desatualizada. */
export function registrarAlteracao(v) {
  v.revisao = (v.revisao || 0) + 1;
  v.atualizado_em = new Date().toISOString();
  if (v.preparacao?.estado === 'pronto' && v.preparacao.revisao !== v.revisao) {
    v.preparacao.desatualizada = true;
  }
  return v;
}

/** Validação por tela. Retorna { campo: mensagem } em linguagem simples. */
export function validarTela(v, tela) {
  const e = {};
  if (tela === 1) {
    if (!dataValida(v.datas.ida.data)) e['ida.data'] = 'Informe a data da ida.';
    if (!horaValida(v.datas.ida.hora)) e['ida.hora'] = 'Informe o horário de partida da ida.';
    if (!dataValida(v.datas.volta.data)) e['volta.data'] = 'Informe a data da volta.';
    if (!horaValida(v.datas.volta.hora)) e['volta.hora'] = 'Informe o horário de partida da volta.';
    if (!Object.keys(e).length) {
      const a = v.datas.ida.data + 'T' + v.datas.ida.hora;
      const b = v.datas.volta.data + 'T' + v.datas.volta.hora;
      if (v.datas.volta.data < v.datas.ida.data) e['volta.data'] = 'A data da volta deve ser depois da data da ida.';
      else if (b <= a) e['volta.hora'] = 'O horário da volta deve ser depois da partida da ida.';
    }
    if ((v.nome || '').length > 80) e.nome = 'Use até 80 caracteres.';
  }
  if (tela === 2) {
    if (!v.origem) e.origem = 'Escolha a origem em um dos resultados da busca.';
    if (!v.destino) e.destino = 'Escolha o destino em um dos resultados da busca.';
    if (v.origem && v.destino && Math.abs(v.origem.lat - v.destino.lat) < 1e-5 && Math.abs(v.origem.lon - v.destino.lon) < 1e-5) {
      e.destino = 'O destino deve ser diferente da origem.';
    }
  }
  if (tela === TELA.PARADAS) {
    for (const sentido of ['ida', 'volta']) {
      v.paradas[sentido].forEach((p, i) => {
        const k = `${sentido}.${i}`;
        if (!p.lugar) e[`${k}.lugar`] = 'Escolha o local da parada.';
        if (!TIPOS_PARADA.includes(p.tipo)) e[`${k}.tipo`] = 'Escolha o tipo da parada.';
        if (p.saidaAgendada) {
          if (!dataValida(p.saidaAgendada.data) || !horaValida(p.saidaAgendada.hora)) e[`${k}.saida`] = 'Informe data e hora da saída agendada.';
        } else if (!(Number(p.duracaoMin) >= 0) || p.duracaoMin === '' || p.duracaoMin === null) {
          e[`${k}.duracao`] = 'A duração deve ser zero ou mais minutos.';
        }
        if (p.abastecer?.modo === 'parcial' && !(Number(p.abastecer.litros) > 0)) e[`${k}.litros`] = 'Informe os litros (maior que zero).';
        if (p.preco !== null && p.preco !== '' && !(Number(p.preco) >= 0)) e[`${k}.preco`] = 'O preço não pode ser negativo.';
      });
    }
  }
  if (tela === TELA.CARRO) Object.assign(e, validarVeiculo(v.veiculo));
  if (tela === 5) {
    if (!v.viajantes.length) e.viajantes = 'Cadastre pelo menos um viajante.';
    v.viajantes.forEach((p, i) => {
      if (!p.nome.trim()) e[`viajante.${i}.nome`] = 'Informe o nome ou apelido.';
      if (p.nascimento && !dataValida(p.nascimento)) e[`viajante.${i}.nascimento`] = 'Data de nascimento inválida.';
      if (!p.nascimento && !FAIXAS.includes(p.faixa)) e[`viajante.${i}.faixa`] = 'Informe a data de nascimento ou a faixa etária.';
    });
    if (v.viajantes.length && !v.viajantes.some((p) => p.condutor)) e.condutor = 'Marque pelo menos um condutor.';
  }
  return e;
}
