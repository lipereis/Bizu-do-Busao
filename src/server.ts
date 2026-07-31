import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estaticos da pasta 'public'
app.use(express.static(path.join(__dirname, '../public')));

const PORT = 3000;

// Rota para entregar a interface web
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 1. Listar todas as linhas ativas
app.get('/api/linhas', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT linha_codigo, COUNT(DISTINCT ordem_veiculo) as total_onibus
      FROM gps_posicoes
      WHERE data_hora_sinal >= NOW() - INTERVAL 1 HOUR
        AND linha_codigo != 'N/A'
      GROUP BY linha_codigo
      ORDER BY total_onibus DESC
    `);

    res.json({
      total_linhas: (rows as any[]).length,
      linhas: rows
    });
  } catch (error: any) {
    res.status(500).json({ erro: 'Erro ao listar linhas', detalhe: error.message });
  }
});

// 2. Buscar última posição dos ônibus de uma linha específica
app.get('/api/onibus/:linha', async (req, res) => {
  const { linha } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT g.ordem_veiculo, g.linha_codigo, g.latitude, g.longitude, g.velocidade, g.data_hora_sinal
      FROM gps_posicoes g
      INNER JOIN (
        SELECT ordem_veiculo, MAX(data_hora_sinal) as max_data
        FROM gps_posicoes
        WHERE linha_codigo = ?
          AND data_hora_sinal >= NOW() - INTERVAL 1 HOUR
        GROUP BY ordem_veiculo
      ) ultimos ON g.ordem_veiculo = ultimos.ordem_veiculo AND g.data_hora_sinal = ultimos.max_data
      WHERE g.linha_codigo = ?
      ORDER BY g.data_hora_sinal DESC
    `, [linha, linha]);

    res.json({
      linha,
      total_veiculos_ativos: (rows as any[]).length,
      veiculos: rows
    });
  } catch (error: any) {
    res.status(500).json({ erro: 'Erro ao buscar ônibus da linha', detalhe: error.message });
  }
});

// 3. Radar de proximidade em KM
app.get('/api/radar', async (req, res) => {
  const { lat, lng, raio } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ 
      erro: 'Informe lat e lng na URL. Ex: /api/radar?lat=-22.9068&lng=-43.1729&raio=5' 
    });
  }

  const raioKm = Number(raio) || 5.0;
  const latNum = Number(lat);
  const lngNum = Number(lng);

  try {
    const [rows] = await pool.query(`
      SELECT g.ordem_veiculo, g.linha_codigo, g.latitude, g.longitude, g.velocidade, g.data_hora_sinal,
        ROUND(
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(?)) * cos(radians(g.latitude)) 
              * cos(radians(g.longitude) - radians(?)) 
              + sin(radians(?)) * sin(radians(g.latitude))
            ))
          ), 2
        ) AS distancia_km
      FROM gps_posicoes g
      INNER JOIN (
        SELECT ordem_veiculo, MAX(data_hora_sinal) as max_data
        FROM gps_posicoes
        WHERE data_hora_sinal >= NOW() - INTERVAL 1 HOUR
        GROUP BY ordem_veiculo
      ) ultimos ON g.ordem_veiculo = ultimos.ordem_veiculo AND g.data_hora_sinal = ultimos.max_data
      HAVING distancia_km <= ?
      ORDER BY distancia_km ASC
      LIMIT 100
    `, [latNum, lngNum, latNum, raioKm]);

    res.json({
      radar: 'Bizu no Busão Radar 📡',
      raio_km: raioKm,
      total_encontrados: (rows as any[]).length,
      onibus: rows
    });
  } catch (error: any) {
    res.status(500).json({ erro: 'Erro ao processar radar de ônibus', detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bizu no Busão Web & API rodando em http://localhost:${PORT}`);
});