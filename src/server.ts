import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;

io.on('connection', (socket: Socket) => {
  console.log(`🔌 Cliente conectado via WebSocket: ${socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Cliente desconectado: ${socket.id}`));
});

export { io };

// --- FUNÇÃO AUXILIAR DE CÁLCULO DE ETA (Estimativa de Chegada em Minutos) ---
function calcularETA(distanciaKm: number, velocidadeAtualKmH: number): number {
  // Se o ônibus estiver parado ou em velocidade muito baixa, assume velocidade média urbana do Rio (20 km/h)
  const velocidadeEfetiva = velocidadeAtualKmH > 5 ? velocidadeAtualKmH : 20;
  
  // Horas = Distância / Velocidade
  const tempoHoras = distanciaKm / velocidadeEfetiva;
  const tempoMinutos = Math.round(tempoHoras * 60);

  return tempoMinutos < 1 ? 1 : tempoMinutos; // Retorna no mínimo 1 minuto
}

// --- ROTAS DA API ---

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

// 2. Buscar ônibus de uma linha específica com cálculo de ETA
app.get('/api/onibus/:linha', async (req, res) => {
  const { linha } = req.params;
  const { lat, lng } = req.query;

  try {
    const [rows]: any = await pool.query(`
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

    let veiculos = rows;

    // Se o cliente forneceu sua coordenada GPS, calcula a distância e ETA para cada ônibus
    if (lat && lng) {
      const userLat = Number(lat);
      const userLng = Number(lng);

      veiculos = rows.map((v: any) => {
        const R = 6371; // Raio da Terra em KM
        const dLat = (v.latitude - userLat) * Math.PI / 180;
        const dLng = (v.longitude - userLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLat * Math.PI / 180) * Math.cos(v.latitude * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = Math.round((R * c) * 100) / 100;

        return {
          ...v,
          distancia_km: dist,
          eta_minutos: calcularETA(dist, v.velocidade)
        };
      });
    }

    res.json({ linha, total_veiculos_ativos: veiculos.length, veiculos });
  } catch (error: any) {
    res.status(500).json({ erro: 'Erro ao buscar ônibus da linha', detalhe: error.message });
  }
});

// 3. Endpoint por Radar de Proximidade com ETA
app.get('/api/radar', async (req, res) => {
  const { lat, lng, raio } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ erro: 'Informe lat e lng na URL.' });
  }

  const raioKm = Number(raio) || 5.0;
  const latNum = Number(lat);
  const lngNum = Number(lng);

  try {
    const [rows]: any = await pool.query(`
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

    const resultadoComETA = rows.map((v: any) => ({
      ...v,
      eta_minutos: calcularETA(v.distancia_km, v.velocidade)
    }));

    res.json({
      radar: 'Bizu no Busão Radar + ETA 📡⏱️',
      raio_km: raioKm,
      total_encontrados: resultadoComETA.length,
      onibus: resultadoComETA
    });
  } catch (error: any) {
    res.status(500).json({ erro: 'Erro no radar', detalhe: error.message });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
// Verifica se o arquivo está sendo executado diretamente (npm run dev)
// evitando abrir a porta 3000 duas vezes quando importado pelo worker
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || 
  process.argv[1].endsWith('server.js')
);

if (isMainModule) {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Bizu no Busão API + Socket.io rodando em http://localhost:${PORT}`);
  });
}