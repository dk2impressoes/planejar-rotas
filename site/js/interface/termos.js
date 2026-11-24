// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Termos de Uso e Aviso de Privacidade (versão 1.0, 24/11/2026). Texto do Grupo DK², ajustado ao que o app faz.
// Ao mudar o texto, suba VERSAO_TERMOS: o app pede novo aceite a todos.
import { el } from './dom.js';

export const VERSAO_TERMOS = '1.0';
export const DATA_TERMOS = '2026-11-24';
export const CONTATO = 'https://github.com/dk2impressoes/planejar-rotas/issues';

export const AVISO_CURTO_TERMOS = 'Planejamento estimado: valores, locais e informações podem estar incompletos, desatualizados ou diferentes do cobrado. O uso é por sua conta e risco; confira com os estabelecimentos e fontes oficiais e não use o celular enquanto dirige.';

// Cada seção: [título, ...partes]. Uma parte é um parágrafo (texto) ou uma lista (array de textos).
export const TERMOS = [
  ['', 'Ao marcar a caixa de aceite e utilizar o aplicativo Planejar Rotas com Checklist, desenvolvido e mantido pelo Grupo DK², o usuário declara ter lido, compreendido e aceito integralmente as condições deste documento. Caso não concorde com qualquer cláusula, o usuário não deve utilizar o aplicativo.',
    'Todas as cláusulas destes Termos valem na extensão máxima permitida pela lei.'],
  ['1. Objeto e natureza gratuita da ferramenta',
    'O Planejar Rotas com Checklist é uma ferramenta gratuita, destinada exclusivamente ao planejamento pessoal de viagens de carro. O aplicativo oferece, entre outras funções:',
    ['cálculo estimado de rotas, rotas alternativas, distâncias e tempo de percurso;',
      'estimativa de pedágios, pela tarifa de automóvel de passeio, e de consumo e custo de combustível;',
      'avisos sobre rodízio, restrições e regras de trânsito;',
      'lembretes sobre documentos, autorização de viagem e cadeirinha para crianças;',
      'botões que abrem o caminho no Google Maps ou no Waze;',
      'histórico e comparação dos gastos das viagens;',
      'listas de verificação (checklists) e consulta sem internet das viagens preparadas.'],
    'O Guia de hospedagem, locais turísticos e compras está em desenvolvimento. Quando ficar disponível, estes Termos valerão também para ele.',
    'Todas as informações geradas têm caráter estritamente informativo e estimativo e são fornecidas "no estado em que se encontram" ("as is"), sem garantias de qualquer natureza.'],
  ['2. Natureza estimativa e divergência de valores',
    'Valores, preços, tarifas, pedágios, consumo de combustível, distâncias, tempos de viagem e horários mostrados pelo aplicativo são estimativas feitas apenas para ajudar no planejamento. Eles não são orçamento, oferta, reserva nem garantia de preço.',
    'O pedágio é estimado pela tarifa de automóvel de passeio. Motocicletas, veículos com mais eixos e veículos com reboque podem pagar valores diferentes.',
    'O Grupo DK² não se responsabiliza por diferenças entre os valores estimados pelo aplicativo e os valores cobrados por estabelecimentos, concessionárias, postos de combustível, órgãos públicos ou quaisquer terceiros.'],
  ['3. Fontes externas (serviços e dados de terceiros)',
    'Para calcular trajetos, estimar pedágios e combustível e encontrar endereços, o aplicativo utiliza dados de fontes públicas e de serviços de terceiros, como provedores de mapas, bases oficiais e bases abertas. A lista das fontes, com licenças, fica no menu "Sobre e avisos legais", na parte "Créditos e fontes".',
    'Essas informações podem estar incompletas, desatualizadas ou erradas. O aplicativo confere e filtra o que parece errado, mas o Grupo DK² não controla essas fontes e não garante sua exatidão, atualização, disponibilidade ou integridade, isentando-se de responsabilidade por:',
    ['TRAJETOS E VIAS: divergências entre a rota sugerida e as condições reais das estradas, como obras, bloqueios, desvios, vias não pavimentadas, áreas de risco ou alterações de sentido. O aplicativo não informa as condições do trânsito em tempo real.',
      'TARIFAS E PEDÁGIOS: diferenças entre os valores exibidos e os valores efetivamente cobrados, incluindo reajustes recentes, tarifas diferentes por categoria de veículo, eixos adicionais, cobranças em sistemas de livre passagem (free flow) e descontos de tags de pagamento automático.',
      'LOCAIS E ESTABELECIMENTOS: dados de cidades, postos, hospedagens, restaurantes, mercados e pontos turísticos, como existência, endereço, horário, preço, regras de aceitação e qualidade do serviço.',
      'DISPONIBILIDADE: instabilidades, falhas técnicas ou limites de uso dos serviços externos utilizados pelo aplicativo.']],
  ['4. Conteúdo e links de terceiros',
    'Os botões "Abrir no Google Maps" e "Abrir no Waze", os links da parte "Créditos e fontes" e outros links abrem sites e serviços de terceiros, que têm termos e políticas próprios. Ao tocar nos botões do Google Maps e do Waze, as coordenadas do caminho são enviadas a essas empresas. O aplicativo não copia nem guarda o conteúdo exibido nesses serviços. O Grupo DK² não responde pelo conteúdo, pelos preços, pelas avaliações nem pela disponibilidade desses serviços.'],
  ['5. Armazenamento local, uso sem internet e perda de dados',
    'Nesta versão, o aplicativo não exige cadastro nem login e não armazena dados do usuário em servidores próprios. Viagens, rotas, passageiros (incluindo nomes e datas de nascimento), veículos, valores e checklists ficam guardados exclusivamente no armazenamento local do navegador ou do aparelho do próprio usuário. O Grupo DK² não tem acesso a esses dados.',
    'O aplicativo salva a viagem automaticamente enquanto ela é preenchida. Também guarda no aparelho as bases de preços, pedágios e regras baixadas, os arquivos para uso sem internet das viagens preparadas e até três cópias de segurança internas, para evitar perdas. Esses dados ficam no aparelho até o usuário apagá-los (menu "Salvar, Importar ou Restaurar") ou até a limpeza dos dados do navegador. Os dados guardados podem estar desatualizados.',
    'O arquivo de cópia exportado pelo usuário não é criptografado: quem tiver o arquivo pode ler o seu conteúdo. Guarde-o em local seguro.',
    'O Grupo DK² se isenta de responsabilidade pela perda, exclusão, desatualização ou corrupção de dados decorrente de limpeza de cache ou de dados do navegador, atualizações do aplicativo ou do sistema operacional, falta de espaço, troca, perda ou defeito do aparelho.',
    'Se futuras versões oferecerem login, estes Termos e o Aviso de Privacidade serão atualizados antes, e o login dependerá de novo aceite do usuário.'],
  ['6. Privacidade e localização',
    'Para calcular rotas e buscar endereços, o aplicativo envia os endereços pesquisados e as coordenadas dos pontos da viagem a serviços públicos de mapa e de busca. Nomes, datas de nascimento, placa, checklists e documentos nunca saem do aparelho. O uso da localização (GPS) depende da permissão do usuário, que pode desligá-la a qualquer momento nas configurações do aparelho ou do navegador. Os detalhes estão no Aviso de Privacidade, no menu "Sobre e avisos legais".'],
  ['7. Dados informados pelo usuário',
    'O usuário é o único responsável pelos dados que digita ou seleciona, como passageiros, datas de nascimento, veículo, placa, combustível, destinos, paradas e valores. Erros, omissões e resultados causados por esses dados são de responsabilidade do usuário.'],
  ['8. Crianças e adolescentes',
    'Os avisos do aplicativo sobre documentos, autorização de viagem e cadeirinha para menores de 18 anos são apenas lembretes. Cumprir o Estatuto da Criança e do Adolescente (Lei nº 8.069/1990) e as regras de trânsito, providenciar autorizações e documentos e garantir que cada menor viaje e se hospede com um responsável é dever do usuário e do responsável indicado. A aceitação do hóspede é decisão do estabelecimento.'],
  ['9. Responsabilidade exclusiva e segurança do usuário',
    'O uso das informações fornecidas ocorre por conta e risco exclusivos do usuário, cabendo a ele:',
    ['PROIBIÇÃO DE USO AO DIRIGIR: o condutor não deve manusear o aplicativo enquanto dirige. Segurar ou manusear o celular ao dirigir é infração gravíssima pelo Código de Trânsito Brasileiro (Lei nº 9.503/1997, art. 252, parágrafo único). Ajustes, marcações no checklist e consultas devem ser feitos com o veículo estacionado em local seguro ou por um passageiro. O usuário é o único responsável por infrações, multas ou acidentes decorrentes da distração ao volante.',
      'CONFERÊNCIA PRÉVIA: verificar diretamente com as concessionárias, os órgãos de trânsito e os estabelecimentos os valores, as tarifas, as regras e as condições das rodovias antes de iniciar a viagem.',
      'SINALIZAÇÃO VIÁRIA: obedecer às leis de trânsito e à sinalização local, que sempre prevalecem sobre qualquer orientação do aplicativo.',
      'CHECKLIST E PREPARAÇÃO: a lista de verificação é apenas um guia sugestivo e personalizável. O usuário é o único responsável por conferir a documentação obrigatória, os itens de segurança exigidos por lei e as condições mecânicas do veículo.',
      'DECISÃO FINAL: toda decisão de viagem, gasto, hospedagem, trajeto e condução é tomada pelo usuário, por sua conta e risco.']],
  ['10. Funcionamento e contato',
    'O aplicativo pode funcionar com falhas, interrupções, atrasos de atualização ou sem conexão com a internet. Ele é oferecido gratuitamente, no estado em que se encontra, sem suporte ou atendimento individual.',
    `Dúvidas sobre estes Termos e pedidos sobre dados pessoais podem ser enviados pela página do projeto: ${CONTATO}. Essa página é pública: não escreva nela nomes, datas de nascimento, placas ou outros dados pessoais.`],
  ['11. Limitação de responsabilidade por danos',
    'Por se tratar de uma ferramenta gratuita de apoio informativo, na extensão máxima permitida pela lei, o Grupo DK² não será responsabilizado por danos diretos, indiretos ou incidentais, prejuízos financeiros, gastos extras com combustível, pedágios, hospedagem ou alimentação, multas, atrasos, acidentes ou qualquer outro transtorno decorrente do uso ou da impossibilidade de uso do aplicativo.'],
  ['12. Modificações e encerramento',
    'O Grupo DK² pode alterar, limitar, suspender ou encerrar o funcionamento do aplicativo e alterar estes Termos a qualquer momento, sem obrigação de continuidade. Quando os Termos mudarem, a nova versão será mostrada no aplicativo, com a data da atualização, e o uso continuará somente após novo aceite.'],
  ['13. Independência das cláusulas',
    'Se qualquer cláusula ou trecho destes Termos for considerado inválido ou inaplicável, as demais cláusulas continuam válidas e em pleno vigor.'],
  ['14. Lei aplicável',
    'Estes Termos são regidos pelas leis da República Federativa do Brasil.'],
];

export const PRIVACIDADE = [
  ['Quem é o responsável', 'Grupo DK², que desenvolve e mantém o Planejar Rotas com Checklist. O aplicativo é gratuito, não tem anúncios, não tem login e não vende dados.'],
  ['O que fica só no seu aparelho',
    'Viagens, passageiros (nomes e datas de nascimento), veículo, placa, valores, checklists, documentos e cópias de segurança ficam no armazenamento do navegador ou do aparelho. O Grupo DK² não recebe nem guarda esses dados.'],
  ['O que é enviado, e para quem',
    ['Endereços pesquisados: Photon (komoot) e Nominatim (OpenStreetMap), um como reserva do outro.',
      'Coordenadas dos pontos da viagem, para calcular o caminho: OSRM e Valhalla (servidores públicos da FOSSGIS) e, se estes falharem, o servidor público do projeto OSRM.',
      'Ao abrir o aplicativo e baixar atualizações de preços, pedágios e regras: o site do aplicativo, hospedado no GitHub Pages.',
      'Só quando você toca nos botões: Google Maps ou Waze, que recebem as coordenadas do caminho.'],
    'Esses serviços recebem o endereço de internet (IP) do aparelho, como em qualquer acesso a um site, e seguem as políticas próprias. Nomes, datas de nascimento, placa e checklists nunca são enviados.'],
  ['Localização', 'O GPS só é usado quando você toca em "Usar onde estou agora" ou "Abasteci agora, onde estou", e depende da sua permissão. A posição serve para achar o endereço ou o ponto do caminho, fica só no seu aparelho e não é recebida pelo Grupo DK².'],
  ['Seus direitos (LGPD)',
    'Como os dados ficam no seu aparelho, você mesmo pode vê-los, corrigi-los, exportá-los e apagá-los a qualquer momento, no menu "Salvar, Importar ou Restaurar". Dúvidas e pedidos: ' + CONTATO + ' (página pública: não escreva dados pessoais nela).'],
];

/** Monta o texto (Termos ou Privacidade) como elementos da página. */
export function textoJuridico(secoes) {
  return el('div', { class: 'texto-juridico' }, ...secoes.map(([titulo, ...partes]) => el('section', {},
    titulo ? el('h3', {}, titulo) : null,
    ...partes.map((p) => (Array.isArray(p) ? el('ul', {}, ...p.map((i) => el('li', {}, i))) : el('p', {}, p))))));
}
