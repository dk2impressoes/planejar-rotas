// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Textos dos botões "?": explicações curtas, para quem nunca usou um app de viagem.
// Ficam todos aqui para revisar e corrigir com facilidade.

export const EXPLICA = {
  // Passo 1 — Quando
  diaIda: 'O dia em que vocês saem de casa. Pode digitar, por exemplo, 28/11/2026, ou tocar no 📅 para escolher no calendário.',
  horaIda: ['A hora em que pretendem sair. O app usa essa hora para calcular a chegada, os descansos, o rodízio de São Paulo e os pedágios.', 'Não sabe ainda? Deixe 08:00 e mude depois.'],
  diaVolta: 'O dia em que vocês saem do destino para voltar para casa.',
  horaVolta: 'A hora em que pretendem sair do destino na volta.',
  nome: 'Um nome para você achar esta viagem depois na lista, como "Férias na praia". É opcional.',

  // Passo 2 — Caminho
  origem: ['O lugar de onde vocês saem, normalmente a sua casa ou a sua cidade.', 'Digite o nome da cidade ou o endereço e toque no resultado certo. Ou toque em "Usar onde estou agora".'],
  destino: 'Para onde vocês vão. Digite a cidade, o endereço ou o nome de um lugar conhecido (hotel, parque, praia) e toque no resultado certo.',

  // Passo 3 — Paradas
  tipoParada: ['Parada rápida: um intervalo curto, para comer, ir ao banheiro ou abastecer.', 'Pernoite: vocês dormem na cidade e seguem viagem em outro dia.'],
  lugarParada: 'A cidade onde vocês vão parar. O caminho e os horários são refeitos passando por ela.',
  duracaoParada: 'Quanto tempo vão ficar parados, em minutos. Exemplo: 30 para um almoço rápido.',
  saidaPernoite: 'O dia e a hora em que vocês vão sair dessa cidade para continuar a viagem.',
  abastecerParada: ['Marque só se você já sabe que vai abastecer nesta parada.', 'Não precisa marcar para ter recomendação: no resumo, o app já mostra por volta de onde vai precisar abastecer.'],

  // Passo 4 — Carro
  veiculo: 'O tipo de veículo muda o valor do pedágio. Carro com reboque paga mais, conforme o número de eixos.',
  eixos: 'Eixo é cada par de rodas. Um carro tem 2 eixos; com um reboque de 1 eixo, o conjunto tem 3.',
  flex: 'Carro flex aceita etanol e gasolina. Em geral está escrito "flex" na traseira ou no manual.',
  combustivel: 'O combustível que você vai colocar no tanque. É usado para buscar o preço médio do estado e calcular o gasto.',
  consumo: ['Quantos quilômetros o carro anda com 1 litro, na estrada.', 'Como descobrir: muitos carros mostram no painel ("km/l"). Ou encha o tanque, zere o marcador de km parcial e, no próximo abastecimento, divida os km rodados pelos litros que couberam.', 'Não sabe? Use 10.'],
  tanque: 'Quantos litros cabem no tanque cheio. Está no manual do carro. Carros pequenos costumam ter de 40 a 50 litros.',
  placa: ['Só o último número da placa. Exemplo: placa ABC1D23 → 3.', 'Serve para avisar se o carro cai no rodízio da cidade de São Paulo. A placa inteira nunca é pedida.'],
  saida: 'Quanto de combustível terá no tanque quando sair. 100 = tanque cheio; 50 = metade.',
  reserva: 'Uma sobra de combustível que você não quer usar, por segurança. O app recomenda abastecer antes de chegar nela.',
  perda: 'Carro cheio de malas ou com bagageiro no teto gasta um pouco mais. Se achar que gasta 10% a mais, coloque 10.',
  precoUltimo: 'O preço por litro que você pagou da última vez que abasteceu. Ajuda a calcular quanto custa o combustível que já está no tanque.',

  // Passo 5 — Pessoas
  separacao: 'Serve para saber quem confere cada lista. Se uma pessoa separa tudo, o nome dela aparece em todas as listas e no resumo; se cada um separa o seu, cada lista mostra o nome do dono.',
  nomePessoa:'Só um nome ou apelido para identificar a pessoa nas listas. Fica guardado só neste aparelho.',
  nascimento: ['A data de nascimento serve para saber a idade no dia da viagem.', 'Com ela, o app diz quais documentos levar, se a criança precisa de autorização ou de cadeirinha. Fica só neste aparelho.'],
  faixa: 'Se preferir não dar a data de nascimento, escolha a idade aproximada. Para 15 anos o app vai pedir a data, porque a regra muda aos 16.',
  condutor: 'Marque quem vai dirigir. Para essa pessoa o app lembra da carteira de motorista (CNH) e do documento do carro.',
};
