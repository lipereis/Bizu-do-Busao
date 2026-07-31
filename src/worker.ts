import axios from 'axios';
import { pool } from './db.js';

// URL da API de dados abertos de GPS do Rio de Janeiro
const API_URL = 'https://dados.mobilidade.rio/gps/sppo';

async function processarGPS() {
  console.log('🔄 [Worker] Buscando GPS da API do Rio...');

  try {
    // Timeout aumentado para 25 segundos para evitar estouros em momentos de pico da API
    const response = await axios.get(API_URL, { timeout: 25000 });
    const dados = response.data;

    const posicoes = Array.isArray(dados) 
      ? dados 
      : (dados.veiculos || dados.dados || []);

    if (posicoes.length === 0) {
      console.log('⚠️ [Worker] Nenhum dado retornado pela API neste ciclo.');
      return;
    }

    let inseridos = 0;

    for (const pos of posicoes) {
      const ordem = pos.ordem || pos.ordem_veiculo || pos.id;
      const linha = pos.linha || pos.linha_codigo || 'N/A';
      const lat = parseFloat(pos.latitude);
      const lng = parseFloat(pos.longitude);
      const vel = parseFloat(pos.velocidade) || 0;

      const rawData = pos.datahora || pos.dataHora || pos.data_hora || pos.timestamp;
      let dataHoraValidada: Date;

      if (rawData) {
        const parsedDate = new Date(rawData);
        dataHoraValidada = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
      } else {
        dataHoraValidada = new Date();
      }

      if (ordem && !isNaN(lat) && !isNaN(lng) && lat !== 0) {
        await pool.query(
          `INSERT INTO gps_posicoes (ordem_veiculo, linha_codigo, latitude, longitude, velocidade, data_hora_sinal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ordem, String(linha), lat, lng, vel, dataHoraValidada]
        );
        inseridos++;
      }
    }

    console.log(`✅ [Worker] Sucesso! ${inseridos} posições de GPS salvas no banco.`);

    // --- PURGE JOB (Limpeza de dados com mais de 2 horas) ---
    const [result]: any = await pool.query(
      `DELETE FROM gps_posicoes WHERE data_hora_sinal < NOW() - INTERVAL 2 HOUR`
    );
    
    if (result && result.affectedRows > 0) {
      console.log(`🧹 [Purge] ${result.affectedRows} registros antigos removidos do banco.`);
    }

  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      console.warn('⏱️ [Worker] A API do Rio demorou para responder (Timeout). Tentando novamente no próximo ciclo...');
    } else {
      console.error('❌ [Worker] Erro ao buscar/salvar GPS:', error.message);
    }
  }
}

// Execução inicial
processarGPS();

// Executa em loop a cada 30 segundos
setInterval(processarGPS, 30000);