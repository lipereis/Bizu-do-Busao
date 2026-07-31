# 🚌 Bizu no Busão — Rio de Janeiro em Tempo Real

O **Bizu no Busão** é uma aplicação Full-Stack desenvolvida para rastrear a frota de ônibus urbanos do Rio de Janeiro em tempo real. O sistema consome a API de dados abertos da prefeitura, processa centenas de milhares de coordenadas via Worker assíncrono, armazena em banco MySQL e exibe tudo em um mapa interativo e intuitivo.

---

## 🚀 Funcionalidades

- **Ingestão em Tempo Real:** Worker em Node.js/TypeScript que consome e trata dados de GPS a cada 30 segundos.
- **Limpeza Automática (Purge Job):** Manutenção contínua do banco de dados removendo posições antigas (com mais de 2 horas) para otimização de espaço e performance.
- **Tratamento de Dados:** Filtros para correção de coordenadas malformadas, timestamps nulos e parsing de formatos da API.
- **API RESTful:** Endpoints em Express para listar linhas ativas, consultar a posição mais recente de veículos e realizar buscas por radar.
- **Radar de Proximidade:** Cálculo da distância Haversine em SQL para encontrar os ônibus mais próximos do GPS do usuário.
- **Front-End Interativo:** Interface limpa com Leaflet.js e OpenStreetMap, mostrando ícones dinâmicos, popups de velocidade/horário e auto-refresh.

---

## 🛠️ Tecnologias Utilizadas

### Backend

- **Node.js** + **TypeScript**
- **Express** (API REST e servidor de estáticos)
- **MySQL** (banco de dados relacional com queries espaciais/matemáticas)
- **Axios** (cliente HTTP para consumo da API pública)
- **dotenv** (gerenciamento de variáveis de ambiente)

### Frontend

- **HTML5 / CSS3 / JavaScript (ES6+)**
- **Leaflet.js** (renderização de mapas interativos)
- **FontAwesome** (iconografia)

---

## ⚙️ Pré-requisitos

Antes de começar, certifique-se de ter instalado em sua máquina:

- [Node.js](https://nodejs.org/) (v18+)
- [MySQL Server](https://www.mysql.com/) e [MySQL Workbench](https://www.mysql.com/products/workbench/)
- [Git](https://git-scm.com/)

---

## 📦 Como Rodar o Projeto

### 1. Clonar o repositório

```bash
git clone [https://github.com/SEU_USUARIO/bizu-no-busao.git](https://github.com/SEU_USUARIO/bizu-no-busao.git)
cd bizu-no-busao
```
