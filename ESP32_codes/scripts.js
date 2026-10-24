const BROKERS_WS = [
  { nome: "HiveMQ", url: "wss://broker.hivemq.com:8884/mqtt" },
  { nome: "Mosquitto", url: "wss://test.mosquitto.org:8081" },
  { nome: "EMQX", url: "wss://broker.emqx.io:8084/mqtt" },
];

const TOPICO_MQTT = "faculdade/meuProjeto/temperatura";
const URL_API_SQLITE = "http://localhost:5000/api/ultima-leitura";

let indiceBroker = 0;
let clienteMqtt = null;
let timerWatchdog = null;
let falhasConsecutivas = 0;
const TIMEOUT_WATCHDOG_MS = 10000;

function atualizarDashboard(dados, viaCanal) {
  document.getElementById("val-temp").innerText = Number(
    dados.temperatura_c,
  ).toFixed(1);
  document.getElementById("val-umid").innerText = Number(
    dados.umidade_ur,
  ).toFixed(1);
  document.getElementById("val-pres").innerText = Number(
    dados.pressao_hpa,
  ).toFixed(1);
  document.getElementById("val-luz").innerText = Number(
    dados.luminosidade_pct,
  ).toFixed(1);
  document.getElementById("val-gas").innerText = Number(
    dados.gases_pct,
  ).toFixed(1);

  const elAr = document.getElementById("val-ar");
  elAr.innerText = dados.qualidade_ar;
  elAr.style.color =
    dados.qualidade_ar === "BOM"
      ? "#22c55e"
      : dados.qualidade_ar === "MODERADO"
        ? "#eab308"
        : "#ef4444";

  document.getElementById("val-device").innerText = dados.device_id || "ESP32";
  document.getElementById("val-broker-esp").innerText =
    dados.broker_ativo || "N/A";
  document.getElementById("val-horario").innerText =
    dados.data_hora || new Date().toLocaleTimeString("pt-BR");
  document.getElementById("info-origem").innerText = `Fonte: ${viaCanal}`;
}

function atualizarStatusVisual(texto, classeCss) {
  const badge = document.getElementById("badge-conexao");
  badge.innerText = texto;
  badge.className = `badge ${classeCss}`;
}

function armarWatchdog() {
  if (timerWatchdog) clearTimeout(timerWatchdog);
  timerWatchdog = setTimeout(() => {
    rotacionarParaProximoBroker();
  }, TIMEOUT_WATCHDOG_MS);
}

function rotacionarParaProximoBroker() {
  falhasConsecutivas++;
  if (falhasConsecutivas >= BROKERS_WS.length) {
    buscarFallbackSQLite();
  }
  indiceBroker = (indiceBroker + 1) % BROKERS_WS.length;
  conectarMqttWeb();
}

function conectarMqttWeb() {
  if (clienteMqtt) clienteMqtt.end(true);
  const brokerAtual = BROKERS_WS[indiceBroker];
  atualizarStatusVisual(`CONECTANDO (${brokerAtual.nome})...`, "conectando");

  clienteMqtt = mqtt.connect(brokerAtual.url, {
    connectTimeout: 4000,
    reconnectPeriod: 0,
  });
  armarWatchdog();

  clienteMqtt.on("connect", () => {
    clienteMqtt.subscribe(TOPICO_MQTT);
  });

  clienteMqtt.on("message", (topico, mensagemBytes) => {
    try {
      falhasConsecutivas = 0;
      armarWatchdog();
      const dadosJson = JSON.parse(mensagemBytes.toString());
      atualizarStatusVisual(`ONLINE (${brokerAtual.nome})`, "online-mqtt");
      atualizarDashboard(dadosJson, `WebSocket (${brokerAtual.nome})`);
    } catch (e) {
      console.error("Erro no JSON", e);
    }
  });
}

async function buscarFallbackSQLite() {
  atualizarStatusVisual("TENTANDO BANCO LOCAL...", "conectando");
  try {
    const resposta = await fetch(URL_API_SQLITE);
    if (resposta.ok) {
      const linha = await resposta.json();
      atualizarStatusVisual("SINCRONIZADO VIA SQLITE", "fallback-sqlite");
      atualizarDashboard(linha, "Banco Local (SQLite)");
    }
  } catch (erro) {
    // Quando estiver no GitHub Pages, o erro cairá aqui bloqueando o HTTP.
    atualizarStatusVisual("SEM SINAL MQTT E LOCAL", "erro");
    document.getElementById("info-origem").innerText =
      "Aguardando retorno do ESP32 ou permissão de rede.";
  }
}

// Inicia a aplicação
conectarMqttWeb();
