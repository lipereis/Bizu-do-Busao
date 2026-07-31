import axios from 'axios';
import { pool } from './db.js';

interface VeiculoRio {
  ordem?: string;
  linha?: string;
  latitude?: string | number;
  longitude?: string | number;
  velocidade?: string | number;
  datahora?: string | number;
  datahoraenvio?: string | number;
}

function parseNumeroRio(valor: any): number {
  if (valor === undefined || valor === null) return 0;
  // Se for string com virgula ("-22,9181"), troca a virgula por ponto antes de converter
  if (typeof valor === 'string') {
    return parseFloat(valor.replace(',', '.'));
  }
  return Number(valor);
}

function formatarDataMySQL(timestampRaw: any): string {
  const ts = Number(timestampRaw);
  
  if (!ts || isNaN(ts)) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  
  const data = new Date(ts);
  if (isNaN(data.getTime())) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  
  return data.toISOString().slice(0, 19).replace('T', ' ');
}

async function limparDadosAntigos() {
  try {
    const [result]: any = await pool.query(`
      DELETE FROM gps_posicoes 
      WHERE data_hora_sinal < NOW() - INTERVAL 2 HOUR
    `);
    if (result.affectedRows > 0) {
      console.log(`🧹 Limpeza: ${result.affectedRows} registros antigos removidos.`);
    }
  } catch (error: any) {
    console.error('⚠️ Erro ao limpar dados antigos:', error.message);
  }
}

async function buscarESalvarGPS() {
  try {
    console.log('🔄 Buscando posições de GPS da API do Rio...');

    const response = await axios.get<VeiculoRio[]>('https://dados.mobilidade.rio/gps/sppo', {
      timeout: 15000,
      headers: { 'Accept-Encoding': 'gzip,deflate,compress' }
    });

    const veiculos = response.data;

    if (!Array.isArray(veiculos) || veiculos.length === 0) {
      console.log('⚠️ Nenhum dado retornado da API neste momento.');
      return;
    }

    const dadosValidos: any[][] = [];

    for (const v of veiculos) {
      const lat = parseNumeroRio(v.latitude);
      const lng = parseNumeroRio(v.longitude);
      const vel = parseNumeroRio(v.velocidade);
      const dataFormatada = formatarDataMySQL(v.datahora || v.datahoraenvio);

      // Valida latitude e longitude reais do Rio de Janeiro (~ -22.x e -43.x)
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        dadosValidos.push([
          v.ordem || 'DESCONHECIDO',
          v.linha || 'N/A',
          lat,
          lng,
          vel,
          dataFormatada,
        ]);
      }
    }

    if (dadosValidos.length === 0) {
      console.log('⚠️ Nenhum registro passou no filtro de coordenadas válidas.');
      return;
    }

    const TAMANHO_LOTE = 2000;
    let totalInserido = 0;

    const sql = `
      INSERT INTO gps_posicoes 
      (ordem_veiculo, linha_codigo, latitude, longitude, velocidade, data_hora_sinal) 
      VALUES ?
    `;

    for (let i = 0; i < dadosValidos.length; i += TAMANHO_LOTE) {
      const lote = dadosValidos.slice(i, i + TAMANHO_LOTE);
      const [result]: any = await pool.query(sql, [lote]);
      totalInserido += result.affectedRows;
    }

    console.log(`🚀 ${totalInserido} posições salvas com sucesso no MySQL!`);
    await limparDadosAntigos();
    console.log('');

  } catch (error: any) {
    console.error('❌ Erro na ingestão de dados:', error.message);
  }
}

buscarESalvarGPS();
setInterval(buscarESalvarGPS, 30000);