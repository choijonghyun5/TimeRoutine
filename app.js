/* =========================================================
   그린노트 - 1단계 스크립트
   범위: 시간대 반영 창문, 먼지 연출, 화분 배치/드래그/저장,
        하단 탭 자리표시, 화분 클릭 시 안내 시트
   추후 단계에서 확장: 식물 성장, 공부 타이머, 상점, 도감 등
   ========================================================= */

const STORE_KEY = "greennote.pots.v1";
const COIN_KEY = "greennote.coin.v1";
const WEATHER_KEY = "greennote.weather.v1";
const LOCATION_KEY = "greennote.location.v1";
const ENV_KEY = "greennote.env.v1";
const DEVICE_POS_KEY = "greennote.devicePos.v1";

const potsZone = document.getElementById("potsZone");
const toastEl = document.getElementById("toast");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const sheetBody = document.getElementById("sheetBody");
const coinValueEl = document.getElementById("coinValue");

/* ---------------------------------------------------------
   1. 시간대 -> 창문 하늘빛 / 조명 반영
   --------------------------------------------------------- */
const TIME_PROFILES = [
  { name: "낮",   key: "day",    from: 6,  to: 17, top: "#8FCBEA", bottom: "#EAF4E3", light: 0.85, icon: "☀️" },
  { name: "노을", key: "sunset", from: 17, to: 19, top: "#E9985F", bottom: "#F8CFA0", light: 0.6,  icon: "🌇" },
  { name: "밤",   key: "night",  from: 19, to: 24, top: "#1F2A44", bottom: "#4A3F5C", light: 0.12, icon: "🌙" },
  { name: "밤",   key: "night",  from: 0,  to: 6,  top: "#1F2A44", bottom: "#4A3F5C", light: 0.12, icon: "🌙" },
];

function getTimeProfile(hour) {
  return TIME_PROFILES.find(p => hour >= p.from && hour < p.to) || TIME_PROFILES[0];
}

/* ---- 날씨 한글 라벨 -> 사진 파일명에 쓰이는 영문 key ---- */
const WEATHER_KEY_EN = { "맑음": "clear", "흐림": "gloomy", "비": "rain", "눈": "snow" };

/* ---- 🧪 테스트용 고정 배경 스위치 ----
   지금은 true 로 켜져 있어서, 시간/날씨가 뭐든 항상 assets/day.png(새로 넣은 사진) 하나만 보여줍니다.
   원래대로 시간대별·날씨별 사진(day_clear_on.png 등)이 자동으로 바뀌게 하려면
   아래 값을 false 로 바꾸면 됩니다. ---- */
const TEST_STATIC_BACKGROUND = true;
const TEST_STATIC_BACKGROUND_FILE = "day.png";

/* ---- 사진 파일명 규칙: {시간}_{날씨}_{on|off}.png
   예) night_rain_on.png, sunset_snow_off.png, day_clear_on.png ---- */
function applyBackgroundImage(timeKey, weatherLabel, lightOn) {
  const weatherKey = WEATHER_KEY_EN[weatherLabel] || "clear";
  const file = TEST_STATIC_BACKGROUND ? TEST_STATIC_BACKGROUND_FILE : `${timeKey}_${weatherKey}_${lightOn ? "on" : "off"}.png`;
  const appEl = document.getElementById("app");
  if (!appEl) return;
  const url = `assets/${file}`;
  const img = new Image();
  img.onload = () => { appEl.style.backgroundImage = `url("${url}")`; };
  img.onerror = () => {
    console.warn(
      `[그린노트] 배경 이미지를 불러오지 못했어요: ${url}\n` +
      `→ index.html과 같은 폴더 안에 "assets" 폴더가 있고, 그 안에 ${file} 파일이 있는지 확인해주세요.`
    );
  };
  img.src = url;
}

/* ---- 시간대 · 날씨 · 조명 상태를 조합해 "장면 색보정" 필터를 계산합니다.
   화분 사진(및 플레이스홀더 화분)에 이 필터를 그대로 씌우면, 사진이 그
   순간의 배경 조명 속에 있는 것처럼 밝기/채도/색온도가 자연스럽게 맞춰집니다.
   → 새 사진 에셋을 추가로 만들 필요 없이 CSS filter 만으로 처리합니다. ---- */
const SCENE_TIME_BASE = {
  day:    { brightness: 1.00, warmth: 0,   sat: 1.00, contrast: 1.00 },
  sunset: { brightness: 0.90, warmth: 10,  sat: 0.95, contrast: 0.98 },
  night:  { brightness: 0.42, warmth: -14, sat: 0.55, contrast: 0.94 },
};
const SCENE_WEATHER_ADJ = {
  "맑음": { brightness: 1.00, sat: 1.05, warmth: 0 },
  "흐림": { brightness: 1.00, sat: 1.05, warmth: 0 },
  "비":   { brightness: 1.00, sat: 1.05, warmth: 0 },
  "눈":   { brightness: 1.00, sat: 1.05, warmth: 0 },
};

function computeSceneBrightness(timeKey, weatherLabel, lightOn) {
  const base = SCENE_TIME_BASE[timeKey] || SCENE_TIME_BASE.day;
  const w = SCENE_WEATHER_ADJ[weatherLabel] || SCENE_WEATHER_ADJ["맑음"];
  let brightness = base.brightness * w.brightness;
  if (lightOn) brightness = brightness + (1 - brightness) * 0.55;
  return Math.max(0.35, Math.min(1.08, brightness));
}

function computeSceneFilter(timeKey, weatherLabel, lightOn) {
  const base = SCENE_TIME_BASE[timeKey] || SCENE_TIME_BASE.day;
  const w = SCENE_WEATHER_ADJ[weatherLabel] || SCENE_WEATHER_ADJ["맑음"];

  const brightness = computeSceneBrightness(timeKey, weatherLabel, lightOn);
  let sat = base.sat * w.sat;
  let warmth = base.warmth + w.warmth;
  const contrast = base.contrast;

  // 조명이 켜져 있으면 실내등 아래에 있는 것처럼 채도/색온도도 함께 끌어올립니다.
  if (lightOn) {
    sat = sat + (1 - sat) * 0.35;
    warmth += 9;
  }
  sat = Math.max(0.4, Math.min(1.15, sat));

  // warmth(+ 따뜻함 / - 차가움)를 hue-rotate·sepia로 변환합니다.
  const hue = -warmth * 0.6;
  const sepiaAmt = Math.max(0, Math.min(0.35, warmth > 0 ? warmth / 40 : 0));

  return `brightness(${brightness.toFixed(2)}) saturate(${sat.toFixed(2)}) contrast(${contrast.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) sepia(${sepiaAmt.toFixed(2)})`;
}

function applySceneFilter(timeKey, weatherLabel, lightOn) {
  document.documentElement.style.setProperty(
    "--scene-filter",
    computeSceneFilter(timeKey, weatherLabel, lightOn)
  );
}

/* ---- 배경 24종(시간 3 x 날씨 4 x 조명 2) 전부에 대응하는 UI 시인성 처리 ----
   화분 사진 색보정(computeSceneBrightness)과는 별도로, 글자 시인성 판단만을 위한
   기준을 둡니다. 실제 비 오는 사진은 계산상의 밝기보다 훨씬 칙칙하게 보여서
   (예: 비 오는 낮에도 갈색 글자가 잘 안 보임) 날씨별로 따로 가중치를 둡니다. */
const UI_WEATHER_BRIGHTNESS = {
  "맑음": 1.00,
  "흐림": 0.65,
  "비":   0.40,
  "눈":   0.95,
};
function computeUiBrightness(timeKey, weatherLabel, lightOn) {
  const base = (SCENE_TIME_BASE[timeKey] || SCENE_TIME_BASE.day).brightness;
  const w = UI_WEATHER_BRIGHTNESS[weatherLabel] ?? 1.00;
  let brightness = base * w;
  if (lightOn) brightness = brightness + (1 - brightness) * 0.55;
  return Math.max(0.30, Math.min(1.08, brightness));
}

const UI_DARK_THEME_THRESHOLD = 0.75;
function applyUiTheme(timeKey, weatherLabel, lightOn) {
  const brightness = computeUiBrightness(timeKey, weatherLabel, lightOn);
  document.documentElement.classList.toggle("is-dark-scene", brightness < UI_DARK_THEME_THRESHOLD);
}

function applyTimeOfDay() {
  const hour = new Date().getHours();
  const profile = getTimeProfile(hour);
  const root = document.documentElement.style;
  root.setProperty("--sky-top", profile.top);
  root.setProperty("--sky-bottom", profile.bottom);
  root.setProperty("--light-strength", profile.light);
  document.getElementById("timeIcon").textContent = profile.icon;
  const lightOn = loadCafeEnv().lightOn;
  document.getElementById("lamp").classList.toggle("is-on", lightOn);
  applyBackgroundImage(profile.key, currentWeatherLabel(), lightOn);
  applySceneFilter(profile.key, currentWeatherLabel(), lightOn);
  applyUiTheme(profile.key, currentWeatherLabel(), lightOn);
  return profile;
}
applyTimeOfDay();
setInterval(() => { applyTimeOfDay(); renderEnvStrip(); }, 5 * 60 * 1000); // 5분마다 갱신

/* ---------------------------------------------------------
   1-0. 상단바 실시간 날짜/시각 표시
   --------------------------------------------------------- */
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById("clockDate");
  const timeEl = document.getElementById("clockTime");
  if (dateEl) dateEl.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 (${WEEKDAY_KO[now.getDay()]})`;
  if (timeEl) {
    let h = now.getHours();
    const ampm = h < 12 ? "오전" : "오후";
    h = h % 12; if (h === 0) h = 12;
    const m = String(now.getMinutes()).padStart(2, "0");
    timeEl.textContent = `${ampm} ${h}:${m}`;
  }
}
updateClock();
setInterval(updateClock, 30 * 1000); // 30초마다 갱신

/* ---------------------------------------------------------
   1-1. 실시간 날씨 + 계절 + 광합성/습도 시스템
   실내 카페이므로 비가 와도 자동으로 물을 주지 않으며,
   창밖 풍경/실내 분위기와 광합성·습도 수치에만 영향을 줍니다.
   --------------------------------------------------------- */
const WEATHER_META = {
  "맑음": { icon: "☀️", lightMult: 1.0, humidityDelta: 0, css: "w-clear" },
  "흐림": { icon: "☁️", lightMult: 0.7, humidityDelta: 5, css: "w-cloudy" },
  "비":   { icon: "🌧️", lightMult: 0.5, humidityDelta: 25, css: "w-rain" },
  "눈":   { icon: "❄️", lightMult: 0.6, humidityDelta: 10, css: "w-snow" },
};

function mapWeatherCode(code) {
  if (code === 0) return "맑음";
  if (code === 1) return "맑음";
  if (code === 2 || code === 3) return "흐림";
  if (code === 45 || code === 48) return "흐림"; // 안개 코드는 흐림으로 대체
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code)) return "비";
  return "맑음";
}

function loadWeather() {
  try { return JSON.parse(localStorage.getItem(WEATHER_KEY)); } catch (e) { return null; }
}
function saveWeather(w) { localStorage.setItem(WEATHER_KEY, JSON.stringify(w)); }

function loadCafeEnv() {
  try {
    const saved = JSON.parse(localStorage.getItem(ENV_KEY));
    if (saved) return saved;
  } catch (e) { /* fall through to default */ }
  const hour = new Date().getHours();
  const defaultLightOn = !(hour >= 6 && hour < 17); // 낮 시간대(6~17시)가 아니면 기본적으로 조명 on
  return { lightOn: defaultLightOn, humidifierOn: false, dehumidifierOn: false };
}
function saveCafeEnv(env) { localStorage.setItem(ENV_KEY, JSON.stringify(env)); }

function getSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return { name: "봄", lightMult: 1.0, humidityBase: 55 };
  if (m >= 6 && m <= 8) return { name: "여름", lightMult: 1.1, humidityBase: 70 };
  if (m >= 9 && m <= 11) return { name: "가을", lightMult: 0.9, humidityBase: 50 };
  return { name: "겨울", lightMult: 0.75, humidityBase: 35 };
}

function loadSavedLocation() {
  try { return JSON.parse(localStorage.getItem(LOCATION_KEY)); } catch (e) { return null; }
}
function saveLocation(loc) { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); }

/* 브라우저 GPS/Wi-Fi 기반 위치 (가장 정확) */
function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("no geolocation api")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        source: "gps",
      }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/* GPS 권한이 없거나(권한 거부, file:// 등 비보안 컨텍스트) 실패했을 때의 대체 수단:
   접속 IP 기반 대략적인 위치. 별도 권한 요청 없이 동작합니다. */
async function getIpLocation() {
  const res = await fetch("https://ipwho.is/");
  const data = await res.json();
  if (!data || data.success === false || typeof data.latitude !== "number") {
    throw new Error("ip location failed");
  }
  return { latitude: data.latitude, longitude: data.longitude, source: "ip", city: data.city };
}

/* GPS → IP 위치 → 이전에 저장해둔 위치 순으로 시도해서 최대한 실제 위치를 확보합니다. */
async function resolveLocation() {
  try {
    const loc = await getBrowserLocation();
    saveLocation({ ...loc, updatedAt: Date.now() });
    return loc;
  } catch (e) {
    try {
      const loc = await getIpLocation();
      saveLocation({ ...loc, updatedAt: Date.now() });
      return loc;
    } catch (e2) {
      return loadSavedLocation();
    }
  }
}

async function refreshWeather() {
  const loc = await resolveLocation();
  if (!loc) {
    applyWeatherVisual("맑음");
    return;
  }
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`);
    const data = await res.json();
    const label = mapWeatherCode(data.current_weather.weathercode);
    const temp = Math.round(data.current_weather.temperature);
    saveWeather({ label, temp, updatedAt: Date.now() });
    applyWeatherVisual(label, temp);
  } catch (e) {
    applyWeatherVisual("맑음");
  }
}

let snowSpawnHandle = null;
function applyWeatherVisual(label, temp) {
  const meta = WEATHER_META[label] || WEATHER_META["맑음"];
  const layer = document.getElementById("weatherLayer");
  layer.className = "weather-layer active " + meta.css;

  const topTempEl = document.getElementById("topTemp");
  if (topTempEl) {
    const t = typeof temp === "number" ? temp : (loadWeather() || {}).temp;
    topTempEl.textContent = typeof t === "number" ? `${t}°` : "–°";
  }

  layer.querySelectorAll(".snowflake").forEach(el => el.remove());
  clearInterval(snowSpawnHandle);
  if (label === "눈") {
    snowSpawnHandle = setInterval(() => spawnSnowflake(layer), 220);
  }
  const timeKey = getTimeProfile(new Date().getHours()).key;
  const lightOn = loadCafeEnv().lightOn;
  applyBackgroundImage(timeKey, label, lightOn);
  applySceneFilter(timeKey, label, lightOn);
  applyUiTheme(timeKey, label, lightOn);
  renderEnvPanelIfOpen();
}
function spawnSnowflake(layer) {
  const f = document.createElement("div");
  f.className = "snowflake";
  f.style.left = Math.random() * 100 + "%";
  f.style.animationDuration = (4 + Math.random() * 3) + "s";
  f.style.opacity = 0.5 + Math.random() * 0.5;
  layer.appendChild(f);
  setTimeout(() => f.remove(), 7000);
}

function currentWeatherLabel() {
  const w = loadWeather();
  return (w && w.label) || "맑음";
}

/* ---- 기기(조명/가습기/제습기)를 켜고 끌 때 수치가 즉시 바뀌지 않고,
   몇 분에 걸쳐 서서히 목표치까지 변하도록 만드는 램프(ramp) 설정입니다.
   offMs 를 onMs 보다 크게 두어, 끌 때는 "원상태로" 더 느리게 돌아가게 했습니다. ---- */
const DEVICE_RAMP_CONFIG = {
  light:        { onMs: 3  * 60 * 1000, offMs: 7  * 60 * 1000, delta: 25 },
  humidifier:   { onMs: 5  * 60 * 1000, offMs: 12 * 60 * 1000, delta: 20 },
  dehumidifier: { onMs: 5  * 60 * 1000, offMs: 12 * 60 * 1000, delta: -20 },
};

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* 기기의 "현재 효과 비율"(0=완전히 꺼진 상태, 1=완전히 켜진 상태)을
   토글된 시각(startedAt)로부터 흐른 시간을 기준으로 계산합니다. */
function getDeviceRatio(env, name, now) {
  const isOn = !!env[name + "On"];
  const target = isOn ? 1 : 0;
  const ramp = env[name + "Ramp"];
  if (!ramp) return target; // 전환 기록이 없으면 이미 목표 상태에 도달한 것으로 간주
  const cfg = DEVICE_RAMP_CONFIG[name];
  const duration = isOn ? cfg.onMs : cfg.offMs;
  const elapsed = now - ramp.startedAt;
  if (duration <= 0 || elapsed >= duration) return target;
  const t = clamp(elapsed / duration, 0, 1);
  const eased = easeInOutCubic(t);
  return ramp.fromValue + (target - ramp.fromValue) * eased;
}

/* 기기를 토글할 때: 지금 순간의 효과 비율을 그대로 이어받아
   새로운 목표(켜짐/꺼짐)를 향해 처음부터 다시 서서히 변하도록 기록합니다. */
function toggleDeviceCommon(env, name, now) {
  const beforeRatio = getDeviceRatio(env, name, now);
  env[name + "On"] = !env[name + "On"];
  env[name + "Ramp"] = { startedAt: now, fromValue: beforeRatio };
}

function computeEnvironment() {
  const timeProfile = getTimeProfile(new Date().getHours());
  const weatherLabel = currentWeatherLabel();
  const weatherMeta = WEATHER_META[weatherLabel] || WEATHER_META["맑음"];
  const season = getSeason();
  const env = loadCafeEnv();
  const now = Date.now();

  const lightRatio = getDeviceRatio(env, "light", now);
  const humidifierRatio = getDeviceRatio(env, "humidifier", now);
  const dehumidifierRatio = getDeviceRatio(env, "dehumidifier", now);

  let light = timeProfile.light * 100 * weatherMeta.lightMult * season.lightMult;
  light += DEVICE_RAMP_CONFIG.light.delta * lightRatio;
  light = clamp(light, 0, 100);

  let humidity = season.humidityBase + weatherMeta.humidityDelta;
  humidity += DEVICE_RAMP_CONFIG.humidifier.delta * humidifierRatio;
  humidity += DEVICE_RAMP_CONFIG.dehumidifier.delta * dehumidifierRatio;
  humidity = clamp(humidity, 0, 100);

  const alerts = [];
  if (light < 35) alerts.push({ msg: "햇빛이 부족하여 성장이 느려지고 있습니다.", tip: "조명을 켜보세요." });
  if (humidity > 75) alerts.push({ msg: "습도가 높아 과습 위험이 있습니다.", tip: "제습기를 가동해보세요." });
  if (humidity < 30) alerts.push({ msg: "습도가 낮아 잎 끝이 마를 수 있어요.", tip: "가습기를 가동해보세요." });
  if (alerts.length === 0) alerts.push({ msg: "지금 카페 환경은 식물이 지내기 좋아요 🌿", tip: "" });

  return { timeProfile, weatherLabel, weatherMeta, season, light: Math.round(light), humidity: Math.round(humidity), alerts, env };
}

function renderEnvPanelIfOpen() {
  if (sheetBackdrop.classList.contains("show") && sheetBody.dataset.kind === "env") openEnvPanel();
  renderEnvStrip();
}

/* ---- 홈 화면 상단에 항상 떠 있는 카페 환경 스트립 ---- */
function renderEnvStrip() {
  const e = computeEnvironment();
  document.getElementById("envStripWeatherIcon").textContent = e.weatherMeta.icon;
  document.getElementById("envStripWeatherText").textContent = e.weatherLabel;
  document.getElementById("envStripLight").textContent = `${e.light}%`;
  document.getElementById("envStripHumidity").textContent = `${e.humidity}%`;

  document.getElementById("envStripLampDot").classList.toggle("is-on", !!e.env.lightOn);
  document.getElementById("envStripHumidifierDot").classList.toggle("is-on", !!e.env.humidifierOn);
  document.getElementById("envStripDehumidifierDot").classList.toggle("is-on", !!e.env.dehumidifierOn);

  const alertEl = document.getElementById("envStripAlert");
  const warning = e.alerts.find(a => a.tip); // 실제로 주의가 필요한 경우만 표시
  if (warning) {
    alertEl.textContent = `⚠️ ${warning.msg}`;
    alertEl.classList.add("show");
  } else {
    alertEl.textContent = "";
    alertEl.classList.remove("show");
  }
}

document.getElementById("envStrip").addEventListener("click", openEnvPanel);
document.getElementById("envStripWeatherBtn").addEventListener("click", openEnvPanel);
renderEnvStrip();
setInterval(renderEnvPanelIfOpen, 15 * 1000); // 15초마다 갱신 - 기기 on/off 시 수치가 서서히 변하는 모습을 보여줌

/* ---- 조명/가습기/제습기 공용 토글 로직 (홈 화면 아이콘 + 환경 패널에서 공유) ----
   기기를 켜면 목표치까지 서서히 올라가고, 끄면 (더 느린 속도로) 서서히 원상태로
   돌아갑니다. 가습기/제습기는 동시에 켤 수 없으므로, 한쪽을 켜면 반대쪽도
   즉시 꺼지는 대신 자연스럽게 램프 다운되도록 처리합니다. */
function toggleLightDevice() {
  const env = loadCafeEnv();
  const now = Date.now();
  toggleDeviceCommon(env, "light", now);
  saveCafeEnv(env);
  applyTimeOfDay();
  updateDeviceVisuals();
  renderEnvPanelIfOpen();
}
function toggleHumidifierDevice() {
  const env = loadCafeEnv();
  const now = Date.now();
  toggleDeviceCommon(env, "humidifier", now);
  if (env.humidifierOn && env.dehumidifierOn) {
    toggleDeviceCommon(env, "dehumidifier", now); // 제습기는 서서히 꺼짐
  }
  saveCafeEnv(env);
  updateDeviceVisuals();
  renderEnvPanelIfOpen();
}
function toggleDehumidifierDevice() {
  const env = loadCafeEnv();
  const now = Date.now();
  toggleDeviceCommon(env, "dehumidifier", now);
  if (env.dehumidifierOn && env.humidifierOn) {
    toggleDeviceCommon(env, "humidifier", now); // 가습기는 서서히 꺼짐
  }
  saveCafeEnv(env);
  updateDeviceVisuals();
  renderEnvPanelIfOpen();
}

function updateDeviceVisuals() {
  const env = loadCafeEnv();
  document.getElementById("humidifierDevice").classList.toggle("is-on", env.humidifierOn);
  document.getElementById("dehumidifierDevice").classList.toggle("is-on", env.dehumidifierOn);
}

document.getElementById("lamp").addEventListener("click", toggleLightDevice);
document.getElementById("humidifierDevice").addEventListener("click", (e) => {
  if (consumeDeviceDragFlag(e.currentTarget)) return;
  toggleHumidifierDevice();
});
document.getElementById("dehumidifierDevice").addEventListener("click", (e) => {
  if (consumeDeviceDragFlag(e.currentTarget)) return;
  toggleDehumidifierDevice();
});
updateDeviceVisuals();

/* ---------------------------------------------------------
   가습기 / 제습기 좌우 드래그 배치
   선반 맨 위 칸(세로 top:40% 고정)에서 좌우로만 움직일 수 있게 합니다.
   ✏️ 이동 가능한 가로 범위를 바꾸고 싶다면 DEVICE_SHELF 값만 조정하면 됩니다.
   --------------------------------------------------------- */
const DEVICE_SHELF = { y: 0.40, xMin: 0.15, xMax: 0.75 };
const DEVICE_WIDTH_PX = 25; // 실제 아이콘 폭(34px) + 여유 간격
const DEVICE_IDS = ["humidifierDevice", "dehumidifierDevice"];

function loadDevicePositions() {
  try {
    const raw = localStorage.getItem(DEVICE_POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}
function saveDevicePositions(pos) {
  try { localStorage.setItem(DEVICE_POS_KEY, JSON.stringify(pos)); } catch (e) {}
}

let devicePositions = loadDevicePositions();
if (devicePositions.humidifierDevice == null) devicePositions.humidifierDevice = 0.23;
if (devicePositions.dehumidifierDevice == null) devicePositions.dehumidifierDevice = 0.28;

function getDeviceMinGapFraction(zoneRect) {
  return DEVICE_WIDTH_PX / zoneRect.width;
}

// 다른 기기와 겹치지 않는 범위까지만 이동을 허용합니다.
function getDeviceNeighborBounds(id, nx, zoneRect) {
  const minGap = getDeviceMinGapFraction(zoneRect);
  let lower = DEVICE_SHELF.xMin;
  let upper = DEVICE_SHELF.xMax;
  DEVICE_IDS.forEach((otherId) => {
    if (otherId === id) return;
    const otherX = devicePositions[otherId];
    if (otherX <= nx) lower = Math.max(lower, otherX + minGap);
    if (otherX >= nx) upper = Math.min(upper, otherX - minGap);
  });
  return { lower, upper };
}

// 드래그 직후의 클릭 이벤트에서 켜기/끄기 토글이 실행되지 않도록 막습니다.
function consumeDeviceDragFlag(el) {
  if (el.dataset.dragged === "1") { el.dataset.dragged = "0"; return true; }
  return false;
}

function makeDeviceDraggable(id) {
  const el = document.getElementById(id);
  const zone = document.getElementById("app");
  el.style.left = (devicePositions[id] * 100) + "%";

  let startX, origX, moved = false;

  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    startX = e.clientX;
    origX = devicePositions[id];
    moved = false;
    el.style.zIndex = 50;
  });

  el.addEventListener("pointermove", (e) => {
    if (e.buttons === 0) return;
    if (startX === undefined) return;
    const zoneRect = zone.getBoundingClientRect();
    const dxRatio = (e.clientX - startX) / zoneRect.width;
    if (Math.abs(dxRatio) > 0.005) moved = true;

    // 세로(y)는 선반 높이로 고정되어 있고, 가로(x)만 이동합니다.
    let nx = clamp(origX + dxRatio, DEVICE_SHELF.xMin, DEVICE_SHELF.xMax);
    const bounds = getDeviceNeighborBounds(id, nx, zoneRect);
    nx = clamp(nx, bounds.lower, bounds.upper);

    devicePositions[id] = nx;
    el.style.left = (nx * 100) + "%";
  });

  el.addEventListener("pointerup", () => {
    el.style.zIndex = "";
    if (moved) {
      el.dataset.dragged = "1";
      saveDevicePositions(devicePositions);
      showToast("기기 위치를 저장했어요");
    }
    startX = undefined;
  });
}

DEVICE_IDS.forEach(makeDeviceDraggable);

function openEnvPanel() {
  const e = computeEnvironment();
  sheetBody.dataset.kind = "env";
  sheetBody.innerHTML = `
    <h3>오늘의 카페 환경</h3>
    <div class="env-grid">
      <div class="env-stat"><div class="env-stat-label">시간대 · 날씨</div>
        <div class="env-stat-value">${e.timeProfile.name} · ${e.weatherMeta.icon}${e.weatherLabel}</div></div>
      <div class="env-stat"><div class="env-stat-label">계절</div>
        <div class="env-stat-value">${e.season.name}</div></div>
      <div class="env-stat"><div class="env-stat-label">광합성량</div>
        <div class="env-stat-value">${e.light}%</div></div>
      <div class="env-stat"><div class="env-stat-label">습도</div>
        <div class="env-stat-value">${e.humidity}%</div></div>
    </div>
    ${e.alerts.map(a => `<div class="env-alert">🪴 <div>${a.msg}${a.tip ? ` <span class="tip">${a.tip}</span>` : ""}</div></div>`).join("")}
    <div class="env-toggles">
      <button class="env-toggle ${e.env.lightOn ? "is-on" : ""}" id="toggleLight">💡 조명</button>
      <button class="env-toggle ${e.env.humidifierOn ? "is-on" : ""}" id="toggleHumidifier">💧 가습기</button>
      <button class="env-toggle ${e.env.dehumidifierOn ? "is-on" : ""}" id="toggleDehumidifier">🌬️ 제습기</button>
    </div>
    <button class="sheet-btn" id="sheetClose">닫기</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("toggleLight").addEventListener("click", () => { toggleLightDevice(); openEnvPanel(); });
  document.getElementById("toggleHumidifier").addEventListener("click", () => { toggleHumidifierDevice(); openEnvPanel(); });
  document.getElementById("toggleDehumidifier").addEventListener("click", () => { toggleDehumidifierDevice(); openEnvPanel(); });
}

refreshWeather();
setInterval(refreshWeather, 30 * 60 * 1000); // 30분마다 갱신

/* ---------------------------------------------------------
   2. 창가 먼지 입자 생성
   --------------------------------------------------------- */
function spawnDust() {
  const layer = document.getElementById("dustLayer");
  const count = 14;
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "dust";
    const startX = Math.random() * 100;
    const startY = 20 + Math.random() * 60;
    const dx = (Math.random() - 0.5) * 60;
    const dy = -40 - Math.random() * 60;
    d.style.left = startX + "%";
    d.style.top = startY + "%";
    d.style.setProperty("--dx", dx + "px");
    d.style.setProperty("--dy", dy + "px");
    d.style.animationDuration = 9 + Math.random() * 10 + "s";
    d.style.animationDelay = -Math.random() * 15 + "s";
    layer.appendChild(d);
  }
}
spawnDust();

/* ---------------------------------------------------------
   3. 코인 (표시만, 지급 로직은 다음 단계에서 연결)
   --------------------------------------------------------- */
function loadCoin() {
  if (localStorage.getItem(COIN_KEY) === null) {
    localStorage.setItem(COIN_KEY, "300"); // 처음 방문 보너스 - 상점을 바로 체험해볼 수 있도록
  }
  const v = parseInt(localStorage.getItem(COIN_KEY) || "0", 10);
  coinValueEl.textContent = v;
}
loadCoin();

/* ---------------------------------------------------------
   3-1. 코인 지급 / 통계
   --------------------------------------------------------- */
const STATS_KEY = "greennote.stats.v1";

function addCoin(amount) {
  const v = parseInt(localStorage.getItem(COIN_KEY) || "0", 10) + amount;
  localStorage.setItem(COIN_KEY, String(v));
  coinValueEl.textContent = v;
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { totalSeconds: 0, sessions: 0, coinsEarned: 0 };
  } catch (e) {
    return { totalSeconds: 0, sessions: 0, coinsEarned: 0 };
  }
}
function saveStats(s) { localStorage.setItem(STATS_KEY, JSON.stringify(s)); }

/* ---- 오늘 하루 집중 시간 (집중 시작 CTA 배너에 표시) ---- */
const DAILY_KEY = "greennote.daily.v1";
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadDailyFocus() {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_KEY));
    if (d && d.date === todayKey()) return d.seconds || 0;
    return 0;
  } catch (e) { return 0; }
}
function addDailyFocus(seconds) {
  const current = loadDailyFocus();
  localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayKey(), seconds: current + seconds }));
}
function renderFocusCta() {
  const subEl = document.getElementById("focusCtaSub");
  if (!subEl) return;
  const seconds = loadDailyFocus();
  if (seconds < 60) {
    subEl.textContent = "오늘 아직 집중 기록이 없어요";
  } else {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    subEl.textContent = `오늘 집중 시간 ${h > 0 ? `${h}시간 ` : ""}${m}분`;
  }
}
renderFocusCta();

/* ---------------------------------------------------------
   3-2. 공부(집중) 타이머
   보상: 코인 = 분당 2
   --------------------------------------------------------- */
const FOCUS_KEY = "greennote.focus.v1";
const COIN_PER_MIN = 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

const focusOverlay = document.getElementById("focusOverlay");
const focusTimeDisplay = document.getElementById("focusTimeDisplay");
const ringProgress = document.getElementById("ringProgress");
const btnFocusStart = document.getElementById("btnFocusStart");
const btnFocusPause = document.getElementById("btnFocusPause");
const btnFocusStop = document.getElementById("btnFocusStop");
const customMinutesInput = document.getElementById("customMinutes");
const focusHint = document.getElementById("focusHint");

let focusState = {
  status: "idle",        // idle | running | paused
  targetSeconds: 25 * 60,
  accumulatedSeconds: 0, // 일시정지 포함, 실제로 흐른 시간
  startedAt: null,       // 마지막 재생 시작 시각(ms)
};
let focusTickHandle = null;

function persistFocus() { localStorage.setItem(FOCUS_KEY, JSON.stringify(focusState)); }
function restoreFocus() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_KEY));
    if (saved) focusState = saved;
  } catch (e) {}
}
restoreFocus();

function currentElapsedSeconds() {
  if (focusState.status === "running" && focusState.startedAt) {
    return focusState.accumulatedSeconds + (Date.now() - focusState.startedAt) / 1000;
  }
  return focusState.accumulatedSeconds;
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

function updateFocusUI() {
  const elapsed = currentElapsedSeconds();
  const remaining = Math.max(0, focusState.targetSeconds - elapsed);
  focusTimeDisplay.textContent = formatTime(remaining);
  const progress = clamp(elapsed / focusState.targetSeconds, 0, 1);
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  const isRunning = focusState.status === "running";
  const isPaused = focusState.status === "paused";
  btnFocusStart.hidden = isRunning || isPaused;
  btnFocusPause.hidden = !isRunning;
  btnFocusStop.hidden = focusState.status === "idle";
  btnFocusPause.textContent = isRunning ? "일시정지" : "이어하기";
  focusHint.textContent = isRunning
    ? "집중하는 동안에는 방해 요소가 모두 잠시 멈춰요 🌿"
    : isPaused
    ? "잠시 쉬어가도 괜찮아요. 준비되면 이어해보세요"
    : "원하는 시간을 고르고 집중을 시작해보세요";

  document.querySelectorAll(".preset-btn").forEach(b => b.disabled = isRunning || isPaused);
  customMinutesInput.disabled = isRunning || isPaused;

  if (isRunning && elapsed >= focusState.targetSeconds) {
    completeFocus(focusState.targetSeconds);
  }
}

function startTick() {
  clearInterval(focusTickHandle);
  focusTickHandle = setInterval(updateFocusUI, 1000);
}
function stopTick() { clearInterval(focusTickHandle); }

function openFocusOverlay() {
  focusOverlay.classList.add("show");
  if (focusState.status === "running") startTick();
  updateFocusUI();
}
document.getElementById("focusClose").addEventListener("click", () => {
  focusOverlay.classList.remove("show");
});

document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    if (btn.dataset.min === "custom") {
      customMinutesInput.classList.add("show");
      customMinutesInput.focus();
    } else {
      customMinutesInput.classList.remove("show");
      focusState.targetSeconds = parseInt(btn.dataset.min, 10) * 60;
      persistFocus();
      updateFocusUI();
    }
  });
});
customMinutesInput.addEventListener("input", () => {
  const mins = clamp(parseInt(customMinutesInput.value || "0", 10), 1, 180);
  if (mins) {
    focusState.targetSeconds = mins * 60;
    persistFocus();
    updateFocusUI();
  }
});

btnFocusStart.addEventListener("click", () => {
  focusState.status = "running";
  focusState.startedAt = Date.now();
  persistFocus();
  startTick();
  updateFocusUI();
});
btnFocusPause.addEventListener("click", () => {
  if (focusState.status === "running") {
    focusState.accumulatedSeconds = currentElapsedSeconds();
    focusState.status = "paused";
    focusState.startedAt = null;
    stopTick();
  } else if (focusState.status === "paused") {
    focusState.status = "running";
    focusState.startedAt = Date.now();
    startTick();
  }
  persistFocus();
  updateFocusUI();
});
btnFocusStop.addEventListener("click", () => {
  const elapsed = currentElapsedSeconds();
  if (elapsed < 30) {
    resetFocus();
    updateFocusUI();
    return;
  }
  completeFocus(elapsed, true);
});

function resetFocus() {
  stopTick();
  focusState.status = "idle";
  focusState.accumulatedSeconds = 0;
  focusState.startedAt = null;
  persistFocus();
}

function completeFocus(elapsedSeconds, isEarlyStop) {
  stopTick();
  const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
  const coinsEarned = minutes * COIN_PER_MIN;

  addCoin(coinsEarned);

  const s = loadStats();
  s.totalSeconds += Math.round(elapsedSeconds);
  s.sessions += 1;
  s.coinsEarned += coinsEarned;
  saveStats(s);
  addDailyFocus(Math.round(elapsedSeconds));
  renderFocusCta();

  const grownCount = growPlantsFromFocus(minutes);

  resetFocus();
  renderPots();
  updateFocusUI();
  focusOverlay.classList.remove("show");

  sheetBody.dataset.kind = "focus-result";
  sheetBody.innerHTML = `
    <h3>${isEarlyStop ? "여기까지도 잘했어요" : "집중을 마쳤어요 🌿"}</h3>
    <p>${minutes}분 동안 집중했어요.</p>
    <p>🪙 코인 +${coinsEarned}</p>
    <p style="color:var(--ink-faint); font-size:12.5px;">${grownCount > 0 ? `🌱 화분 ${grownCount}개가 조금 더 자랐어요.` : "심어둔 화분이 있으면 집중할 때마다 함께 자라나요."}</p>
    <button class="sheet-btn" id="sheetClose">좋아요</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
}

// 새로고침 후에도 진행 중이던 타이머 이어가기
if (focusState.status === "running" || focusState.status === "paused") {
  document.getElementById("customMinutes").value =
    focusState.targetSeconds % 60 === 0 && ![15, 25, 50].includes(focusState.targetSeconds / 60)
      ? focusState.targetSeconds / 60 : "";
}

/* ---------------------------------------------------------
   3-3. 백색소음 믹서
   --------------------------------------------------------- */
const MIX_KEY = "greennote.mix.v1";
const PRESET_KEY = "greennote.presets.v1";

const AMBIENT_SOUNDS = [
  { id: "cafe", name: "카페", icon: "☕️" },
  { id: "library", name: "도서관", icon: "📚" },
  { id: "rain", name: "빗소리", icon: "🌧️" },
  { id: "forest", name: "숲", icon: "🌲" },
  { id: "waves", name: "파도", icon: "🌊" },
  { id: "wind", name: "바람", icon: "💨" },
  { id: "fireplace", name: "장작", icon: "🔥" },
  { id: "white", name: "백색소음", icon: "🌫️" },
];
const EFFECT_SOUNDS = [
  { id: "pencil", name: "연필 소리", icon: "✏️" },
  { id: "pageTurn", name: "책 넘김", icon: "📖" },
  { id: "keyboard", name: "키보드", icon: "⌨️" },
  { id: "mouseClick", name: "마우스 클릭", icon: "🖱️" },
  { id: "bird", name: "새소리", icon: "🐦" },
];
const ALL_SOUNDS = [...AMBIENT_SOUNDS, ...EFFECT_SOUNDS];

function loadMix() {
  try { return JSON.parse(localStorage.getItem(MIX_KEY)) || {}; } catch (e) { return {}; }
}
function saveMix(mix) { localStorage.setItem(MIX_KEY, JSON.stringify(mix)); }
let currentMix = loadMix();

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || []; } catch (e) { return []; }
}
function savePresets(list) { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); }

function renderMixerRows() {
  const ambientList = document.getElementById("mixerAmbientList");
  const effectList = document.getElementById("mixerEffectList");
  ambientList.innerHTML = "";
  effectList.innerHTML = "";
  ALL_SOUNDS.forEach(s => {
    const isEffect = EFFECT_SOUNDS.some(e => e.id === s.id);
    const row = document.createElement("div");
    row.className = "mixer-row";
    row.dataset.id = s.id;
    const val = currentMix[s.id] || 0;
    row.innerHTML = `
      <span class="mixer-icon">${s.icon}</span>
      <span class="mixer-name">${s.name}</span>
      <input type="range" class="mixer-slider" min="0" max="100" value="${val}" />
      <span class="mixer-value">${val}</span>`;
    const slider = row.querySelector(".mixer-slider");
    const valueLabel = row.querySelector(".mixer-value");
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      valueLabel.textContent = v;
      currentMix[s.id] = v;
      saveMix(currentMix);
      SoundEngine.setVolume(s.id, v / 100);
    });
    (isEffect ? effectList : ambientList).appendChild(row);
  });
}

function renderPresetChips() {
  const wrap = document.getElementById("mixerPresets");
  const addBtn = document.getElementById("btnSavePreset");
  wrap.querySelectorAll(".preset-chip:not(.is-add)").forEach(el => el.remove());
  loadPresets().forEach((preset, idx) => {
    const chip = document.createElement("button");
    chip.className = "preset-chip";
    chip.innerHTML = `${preset.name} <span class="chip-del" data-idx="${idx}">×</span>`;
    chip.addEventListener("click", (e) => {
      if (e.target.classList.contains("chip-del")) {
        e.stopPropagation();
        const list = loadPresets();
        list.splice(idx, 1);
        savePresets(list);
        renderPresetChips();
        return;
      }
      applyPreset(preset);
    });
    wrap.insertBefore(chip, addBtn.nextSibling);
  });
}

function applyPreset(preset) {
  ALL_SOUNDS.forEach(s => {
    const v = preset.mix[s.id] || 0;
    currentMix[s.id] = v;
    SoundEngine.setVolume(s.id, v / 100);
  });
  saveMix(currentMix);
  renderMixerRows();
  showToast(`"${preset.name}" 프리셋을 불러왔어요`);
}

document.getElementById("btnSavePreset").addEventListener("click", () => {
  const hasSound = Object.values(currentMix).some(v => v > 0);
  if (!hasSound) { showToast("먼저 소리를 조합해보세요"); return; }
  const name = prompt("이 조합을 어떤 이름으로 저장할까요?", "나의 집중 사운드");
  if (!name) return;
  const list = loadPresets();
  list.push({ name: name.slice(0, 16), mix: { ...currentMix } });
  savePresets(list);
  renderPresetChips();
  showToast("프리셋을 저장했어요");
});

function openMixer() {
  SoundEngine.ensureContext();
  ALL_SOUNDS.forEach(s => {
    const v = currentMix[s.id] || 0;
    if (v > 0) SoundEngine.setVolume(s.id, v / 100);
  });
  document.getElementById("mixerOverlay").classList.add("show");
}
function closeMixer() {
  document.getElementById("mixerOverlay").classList.remove("show");
}
document.getElementById("btnMixer").addEventListener("click", openMixer);
document.getElementById("focusMixerBtn").addEventListener("click", openMixer);
document.getElementById("mixerClose").addEventListener("click", closeMixer);

renderMixerRows();
renderPresetChips();

/* ---------------------------------------------------------
   4. 화분 데이터 모델 + 렌더링
      { id, x(0~1 비율), y(0~1 비율),
        plantId, growthUnits, health, plantedAt, lastWateredAt, name }
      plantId 가 null 이면 빈 화분입니다.
   --------------------------------------------------------- */
function loadPots() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function savePots(pots) {
  localStorage.setItem(STORE_KEY, JSON.stringify(pots));
}

let pots = loadPots();

/* ---------------------------------------------------------
   4-1. 식물 도감 데이터 (2단계: 심기 + 성장 시스템)
   에셋 교체를 쉽게 하기 위해 아이콘은 이모지 플레이스홀더를 사용하며,
   추후 art 값에 실제 이미지 경로만 채워 넣으면 교체되도록 구조를 잡아둡니다.
   --------------------------------------------------------- */
const PLANT_CATALOG = {
  /* ---- 상단 선반 ---- */
  pothos: {
    id: "pothos", name: "스킨답서스", category: "관엽식물", icon: "🌿", price: 70,
    difficulty: "쉬움", totalNeeded: 100, waterIntervalDays: 6, rarity: 1, shelfTier: "top",
    lightMin: 40, lightMax: 80, humidityMin: 40, humidityMax: 70,
    hasFlower: false, hasFruit: false, art: null,
  },
  peacelily: {
    id: "peacelily", name: "스파티필름", category: "꽃", icon: "🪴", price: 140,
    difficulty: "보통", totalNeeded: 170, waterIntervalDays: 4, rarity: 2, shelfTier: "top",
    lightMin: 30, lightMax: 65, humidityMin: 55, humidityMax: 80,
    hasFlower: true, bloomIcon: "🤍", hasFruit: false, art: null,
  },
  cherrytomato: {
    id: "cherrytomato", name: "방울토마토", category: "과일", icon: "🍅", price: 220,
    difficulty: "보통", totalNeeded: 210, waterIntervalDays: 3, rarity: 2, shelfTier: "top",
    lightMin: 65, lightMax: 100, humidityMin: 45, humidityMax: 65,
    hasFlower: true, bloomIcon: "🌼", hasFruit: true, fruitIcon: "🍅", fruitPrice: 45, art: null,
  },
  tulip: {
    id: "tulip", name: "튤립", category: "꽃", icon: "🌷", price: 170,
    difficulty: "보통", totalNeeded: 160, waterIntervalDays: 4, rarity: 2, shelfTier: "top",
    lightMin: 65, lightMax: 95, humidityMin: 35, humidityMax: 60,
    hasFlower: true, bloomIcon: "🌷", hasFruit: false, art: null,
  },
  sunflower: {
    id: "sunflower", name: "해바라기", category: "꽃", icon: "🌻", price: 200,
    difficulty: "보통", totalNeeded: 200, waterIntervalDays: 3, rarity: 2, shelfTier: "top",
    lightMin: 75, lightMax: 100, humidityMin: 30, humidityMax: 55,
    hasFlower: true, bloomIcon: "🌻", hasFruit: false, art: null,
  },
  strawberry: {
    id: "strawberry", name: "딸기", category: "과일", icon: "🍓", price: 180,
    difficulty: "보통", totalNeeded: 190, waterIntervalDays: 3, rarity: 2, shelfTier: "top",
    lightMin: 60, lightMax: 90, humidityMin: 45, humidityMax: 70,
    hasFlower: true, bloomIcon: "🤍", hasFruit: true, fruitIcon: "🍓", fruitPrice: 40, art: null,
  },
  blueberry: {
    id: "blueberry", name: "블루베리", category: "과일", icon: "🫐", price: 300,
    difficulty: "어려움", totalNeeded: 280, waterIntervalDays: 4, rarity: 3, shelfTier: "top",
    lightMin: 65, lightMax: 95, humidityMin: 50, humidityMax: 75,
    hasFlower: true, bloomIcon: "🤍", hasFruit: true, fruitIcon: "🫐", fruitPrice: 65, art: null,
  },

  /* ---- 중간 선반 ---- */
  ivy: {
    id: "ivy", name: "아이비", category: "관엽식물", icon: "🍃", price: 80,
    difficulty: "쉬움", totalNeeded: 120, waterIntervalDays: 5, rarity: 1, shelfTier: "middle",
    lightMin: 35, lightMax: 70, humidityMin: 40, humidityMax: 65,
    hasFlower: false, hasFruit: false, art: null,
  },
  rose: {
    id: "rose", name: "장미", category: "꽃", icon: "🌹", price: 260,
    difficulty: "어려움", totalNeeded: 240, waterIntervalDays: 3, rarity: 3, shelfTier: "middle",
    lightMin: 65, lightMax: 95, humidityMin: 40, humidityMax: 60,
    hasFlower: true, bloomIcon: "🌹", hasFruit: false, art: null,
  },
  basil: {
    id: "basil", name: "바질", category: "허브", icon: "🌱", price: 60,
    difficulty: "쉬움", totalNeeded: 110, waterIntervalDays: 2, rarity: 1, shelfTier: "middle",
    lightMin: 50, lightMax: 85, humidityMin: 40, humidityMax: 65,
    hasFlower: false, hasFruit: false, art: null,
  },
  mint: {
    id: "mint", name: "민트", category: "허브", icon: "🍀", price: 65,
    difficulty: "쉬움", totalNeeded: 100, waterIntervalDays: 3, rarity: 1, shelfTier: "middle",
    lightMin: 50, lightMax: 85, humidityMin: 45, humidityMax: 70,
    hasFlower: false, hasFruit: false, art: null,
  },
  hydrangea: {
    id: "hydrangea", name: "수국", category: "꽃", icon: "🌿", price: 210,
    difficulty: "어려움", totalNeeded: 230, waterIntervalDays: 3, rarity: 3, shelfTier: "middle",
    lightMin: 55, lightMax: 85, humidityMin: 55, humidityMax: 80,
    hasFlower: true, bloomIcon: "💙", hasFruit: false, art: null,
  },
  rosemary: {
    id: "rosemary", name: "로즈마리", category: "허브", icon: "🌾", price: 130,
    difficulty: "보통", totalNeeded: 140, waterIntervalDays: 5, rarity: 2, shelfTier: "middle",
    lightMin: 65, lightMax: 100, humidityMin: 30, humidityMax: 55,
    hasFlower: false, hasFruit: false, art: null,
  },
  lavender: {
    id: "lavender", name: "라벤더", category: "허브", icon: "🪻", price: 150,
    difficulty: "보통", totalNeeded: 150, waterIntervalDays: 4, rarity: 2, shelfTier: "middle",
    lightMin: 65, lightMax: 100, humidityMin: 25, humidityMax: 50,
    hasFlower: true, bloomIcon: "💜", hasFruit: false, art: null,
  },

  /* ---- 하단 선반 ---- */
  monstera: {
    id: "monstera", name: "몬스테라", category: "관엽식물", icon: "🌿", price: 120,
    difficulty: "쉬움", totalNeeded: 220, waterIntervalDays: 5, rarity: 1, shelfTier: "bottom",
    lightMin: 55, lightMax: 90, humidityMin: 50, humidityMax: 75,
    hasFlower: false, hasFruit: false, art: null,
  },
  rubbertree: {
    id: "rubbertree", name: "수채화 고무나무", category: "관엽식물", icon: "🌳", price: 160,
    difficulty: "쉬움", totalNeeded: 230, waterIntervalDays: 6, rarity: 2, shelfTier: "bottom",
    lightMin: 50, lightMax: 85, humidityMin: 40, humidityMax: 65,
    hasFlower: false, hasFruit: false, art: null,
  },
  birdofparadise: {
    id: "birdofparadise", name: "극락조", category: "관엽식물", icon: "🌴", price: 320,
    difficulty: "어려움", totalNeeded: 260, waterIntervalDays: 6, rarity: 3, shelfTier: "bottom",
    lightMin: 60, lightMax: 90, humidityMin: 55, humidityMax: 80,
    hasFlower: false, hasFruit: false, art: null,
  },
  arecapalm: {
    id: "arecapalm", name: "아레카야자", category: "관엽식물", icon: "🌴", price: 260,
    difficulty: "보통", totalNeeded: 220, waterIntervalDays: 5, rarity: 2, shelfTier: "bottom",
    lightMin: 50, lightMax: 85, humidityMin: 50, humidityMax: 75,
    hasFlower: false, hasFruit: false, art: null,
  },
  olivetree: {
    id: "olivetree", name: "올리브나무", category: "과일", icon: "🫒", price: 300,
    difficulty: "어려움", totalNeeded: 250, waterIntervalDays: 7, rarity: 3, shelfTier: "bottom",
    lightMin: 75, lightMax: 100, humidityMin: 25, humidityMax: 50,
    hasFlower: false, hasFruit: true, fruitIcon: "🫒", fruitPrice: 60, art: null,
  },
  lemon: {
    id: "lemon", name: "레몬", category: "과일", icon: "🍋", price: 280,
    difficulty: "어려움", totalNeeded: 240, waterIntervalDays: 4, rarity: 3, shelfTier: "bottom",
    lightMin: 70, lightMax: 100, humidityMin: 45, humidityMax: 70,
    hasFlower: true, bloomIcon: "🤍", hasFruit: true, fruitIcon: "🍋", fruitPrice: 55, art: null,
  },
};
function getPlantDef(plantId) { return PLANT_CATALOG[plantId] || null; }

/* ---------------------------------------------------------
   4-1-A. 선반 배치 시스템 (상단 / 중간 / 하단)
   =========================================================
   ✏️ 선반 위치를 직접 수정하고 싶다면 아래 SHELF_TIERS_DESKTOP / SHELF_TIERS_MOBILE 값만 바꾸면 됩니다.

   - y : 화면 세로 위치 비율 (0 = 화면 맨 위, 1 = 화면 맨 아래)
         화분은 이 y값에 "고정"되고, 위/아래로는 움직이지 않습니다.
   - xMin / xMax : 화분이 좌우로 움직일 수 있는 가로 범위 비율
         (0 = 화면 맨 왼쪽, 1 = 화면 맨 오른쪽)
   - label : 안내 문구에 쓰일 선반 이름 ("~에 배치해주세요")

   예) 위 선반을 사진보다 살짝 아래로 내리고 싶다면
       top.y 값을 0.34 → 0.37 처럼 살짝 키우면 됩니다.
       왼쪽으로 더 이동 가능하게 하려면 xMin을 더 작게(예: 0.10) 하면 됩니다.
   --------------------------------------------------------- */
/* 데스크톱(넓은 창)에서 쓰는 선반 높이.
   .app 은 배경사진을 cover 로 채우기 때문에, 창의 가로세로 비율이 달라지면
   사진이 잘리는 위치도 달라져서 실제 선반이 화면에 보이는 높이(%)가 달라집니다. */
const SHELF_TIERS_DESKTOP = {
  top:    { key: "top",    label: "위 선반",   y: 0.49, xMin: 0.32, xMax: 0.72 },
  middle: { key: "middle", label: "중간 선반", y: 0.62, xMin: 0.16, xMax: 0.84 },
  bottom: { key: "bottom", label: "아래 선반", y: 0.90, xMin: 0.16, xMax: 0.60 },
};

/* 모바일(좁은 창, 세로로 긴 화면)에서 쓰는 선반 높이.
   ✏️ 폰에서 열었을 때 화분이 실제 선반 사진보다 위/아래로 어긋나 보이면
      아래 y 값만 살짝 조정하면 됩니다. (0 = 화면 맨 위, 1 = 화면 맨 아래)
   지금은 데스크톱과 동일한 값으로 시작하니, 폰에서 확인하면서 숫자를 바꿔보세요. */
const SHELF_TIERS_MOBILE = {
  top:    { key: "top",    label: "위 선반",   y: 0.49, xMin: 0.32, xMax: 0.72 },
  middle: { key: "middle", label: "중간 선반", y: 0.62, xMin: 0.16, xMax: 0.84 },
  bottom: { key: "bottom", label: "아래 선반", y: 0.90, xMin: 0.16, xMax: 0.60 },
};

// styles.css 의 `@media (min-width: 640px)` 분기와 기준을 맞춥니다.
const MOBILE_BREAKPOINT_QUERY = "(max-width: 639px)";
function isMobileViewport() {
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}
function getShelfTiers() {
  return isMobileViewport() ? SHELF_TIERS_MOBILE : SHELF_TIERS_DESKTOP;
}

// 식물 종(species)이 속한 선반 정보를 돌려줍니다. 없으면 기본값(중간 선반)으로 처리합니다.
function getShelfTierForPlant(plantId) {
  const def = getPlantDef(plantId);
  const key = (def && def.shelfTier) || "middle";
  const tiers = getShelfTiers();
  return tiers[key] || tiers.middle;
}

// 화분(pot)이 현재 배치돼야 할 선반 정보를 돌려줍니다. (아직 안 심은 빈 화분은 저장된 tier 값을 그대로 사용)
function getShelfTierForPot(pot) {
  if (pot.plantId) return getShelfTierForPlant(pot.plantId);
  const tiers = getShelfTiers();
  return tiers[pot.shelfTier] || tiers.middle;
}

// x는 해당 선반의 가로 범위 안으로, y는 해당 선반의 고정 높이로 맞춰줍니다.
function snapPotToShelf(pot) {
  const tier = getShelfTierForPot(pot);
  pot.shelfTier = tier.key;
  pot.x = clamp(pot.x == null ? (tier.xMin + tier.xMax) / 2 : pot.x, tier.xMin, tier.xMax);
  pot.y = tier.y;
  return pot;
}

/* 성장 단계 - 11단계 파이프라인 (씨앗 → … → 완전 성장)
   pct 는 해당 식물의 totalNeeded 대비 누적 성장치 비율 기준입니다. */
const STAGES = [
  { key: "seed",       label: "씨앗",         pct: 0  },
  { key: "germinate",  label: "발아",         pct: 6  },
  { key: "sprout",     label: "새싹",         pct: 14 },
  { key: "stem",       label: "줄기 성장",     pct: 24 },
  { key: "leaf",       label: "잎 생성",       pct: 36 },
  { key: "leafGrow",   label: "잎이 커짐",     pct: 50 },
  { key: "stemThick",  label: "줄기가 굵어짐", pct: 64 },
  { key: "branch",     label: "가지 생성",     pct: 76 },
  { key: "bud",        label: "꽃봉오리",      pct: 86 },
  { key: "bloom",      label: "개화",         pct: 95 },
  { key: "mature",     label: "완전 성장",     pct: 100 },
];

function getStageInfo(pot) {
  const def = getPlantDef(pot.plantId);
  if (!def) return { index: 0, label: "씨앗", pct: 0 };
  const pct = clamp((pot.growthUnits / def.totalNeeded) * 100, 0, 100);
  let index = 0;
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (pct >= STAGES[i].pct) { index = i; break; }
  }
  const label = (STAGES[index].key === "mature" && def.hasFruit && pct >= 97) ? "열매" : STAGES[index].label;
  return { index, label, pct };
}

/* ---------------------------------------------------------
   4-2. 사진 기반 성장 단계 (몬스테라 전용, 1차 적용)
   식물마다 실제 촬영/합성한 사진을 단계별로 준비해두면 여기 등록만
   해서 바로 적용됩니다. 아직 사진이 없는 식물은 등록하지 않으면
   기존처럼 CSS 플레이스홀더(잎 도형)로 자동 표시됩니다.
   stageToImage 는 STAGES 배열의 인덱스(0~10)를 사진 번호(1~files.length)에
   매핑합니다 - 사진 수보다 성장 단계가 많아도 자연스럽게 이어지도록
   여러 단계가 같은 사진을 공유할 수 있습니다.
   --------------------------------------------------------- */
const PLANT_IMAGE_STAGES = {
  monstera: {
    basePath: "assets/plants/monstera/",
    files: ["step_1.png", "step_2.png", "step_3.png", "step_4.png", "step_5.png", "step_6.png"],
    // STAGES: 씨앗,발아,새싹,줄기성장,잎생성,잎이커짐,줄기굵어짐,가지생성,꽃봉오리,개화,완전성장
    stageToImage: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  },
  rubbertree: {
    basePath: "assets/plants/rubbertree/",
    files: ["step_1.png", "step_2.png", "step_3.png", "step_4.png", "step_5.png", "step_6.png"],
    // STAGES: 씨앗,발아,새싹,줄기성장,잎생성,잎이커짐,줄기굵어짐,가지생성,꽃봉오리,개화,완전성장
    stageToImage: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  },
};

function getPlantImageSrc(plantId, stageIndex) {
  const cfg = PLANT_IMAGE_STAGES[plantId];
  if (!cfg) return null;
  const map = cfg.stageToImage;
  const num = map[clamp(stageIndex, 0, map.length - 1)];
  return cfg.basePath + cfg.files[num - 1];
}

// 카페 화면/확대뷰/사진찍기에서 반복 사용할 <img> 엘리먼트를 미리 만들어 캐싱합니다.
const plantImageCache = {};
function getPlantImageEl(src) {
  if (!plantImageCache[src]) {
    const img = new Image();
    img.src = src;
    plantImageCache[src] = img;
  }
  return plantImageCache[src];
}
function preloadPlantImages() {
  Object.values(PLANT_IMAGE_STAGES).forEach((cfg) => {
    cfg.files.forEach((file) => getPlantImageEl(cfg.basePath + file));
  });
}
preloadPlantImages();

/* ---------------------------------------------------------
   4-1-1. 도감(Dex) 시스템
   식물을 처음 심으면 도감에 등록되고, 성장 과정에서 도달한
   가장 높은 단계와 완전 성장(수확) 횟수를 함께 기록합니다.
   --------------------------------------------------------- */
const DEX_KEY = "greennote.dex.v1";

function loadDex() {
  try { return JSON.parse(localStorage.getItem(DEX_KEY)) || {}; } catch (e) { return {}; }
}
function saveDex(dex) { localStorage.setItem(DEX_KEY, JSON.stringify(dex)); }

function unlockDexEntry(plantId) {
  const dex = loadDex();
  if (!dex[plantId]) {
    dex[plantId] = { discoveredAt: Date.now(), bestStageIndex: 0, matureCount: 0 };
    saveDex(dex);
    return true; // 새로 발견함
  }
  return false;
}

function updateDexProgress(pot) {
  if (!pot.plantId) return;
  const dex = loadDex();
  const entry = dex[pot.plantId] || { discoveredAt: Date.now(), bestStageIndex: 0, matureCount: 0 };
  const stage = getStageInfo(pot);
  let changed = false;
  if (stage.index > entry.bestStageIndex) { entry.bestStageIndex = stage.index; changed = true; }
  if (stage.index === STAGES.length - 1 && !pot.matureCounted) {
    entry.matureCount = (entry.matureCount || 0) + 1;
    pot.matureCounted = true;
    changed = true;
  }
  if (changed) {
    dex[pot.plantId] = entry;
    saveDex(dex);
  }
}

function dexCompletionRatio() {
  const dex = loadDex();
  const total = Object.keys(PLANT_CATALOG).length;
  const unlocked = Object.keys(dex).length;
  return { unlocked, total, pct: total ? Math.round((unlocked / total) * 100) : 0 };
}

/* ---------------------------------------------------------
   4-6-1. 업적 시스템
   조건은 이미 기록 중인 통계/도감 데이터를 기준으로 판정하며,
   달성 시 1회만 토스트로 축하 메시지를 보여줍니다.
   --------------------------------------------------------- */
const ACH_KEY = "greennote.achievements.v1";

const ACHIEVEMENTS = [
  { id: "firstPlant", icon: "🌱", title: "첫 식물", desc: "화분에 씨앗을 처음 심어보세요.",
    check: () => Object.keys(loadDex()).length >= 1 },
  { id: "firstBloom", icon: "🌸", title: "첫 개화", desc: "식물을 꽃봉오리 단계 이상으로 키워보세요.",
    check: () => Object.values(loadDex()).some((e) => e.bestStageIndex >= 9) },
  { id: "firstHarvest", icon: "🍅", title: "완전 성장", desc: "식물 하나를 완전 성장까지 키워보세요.",
    check: () => Object.values(loadDex()).some((e) => (e.matureCount || 0) >= 1) },
  { id: "harvest10", icon: "🧺", title: "작은 수확가", desc: "열매를 10번 수확해보세요.",
    check: () => (loadStats().totalHarvests || 0) >= 10 },
  { id: "study10h", icon: "⏱️", title: "공부 10시간", desc: "누적 공부 시간 10시간을 달성해보세요.",
    check: () => (loadStats().totalSeconds || 0) >= 10 * 3600 },
  { id: "study100h", icon: "📚", title: "공부 100시간", desc: "누적 공부 시간 100시간을 달성해보세요.",
    check: () => (loadStats().totalSeconds || 0) >= 100 * 3600 },
  { id: "water50", icon: "💧", title: "정성 가득 물주기", desc: "물을 총 50회 주어보세요.",
    check: () => (loadStats().totalWaterings || 0) >= 50 },
  { id: "dexComplete", icon: "📖", title: "도감 완성", desc: "보유한 모든 식물 종을 심어보세요.",
    check: () => dexCompletionRatio().pct >= 100 },
  { id: "firstPhoto", icon: "📸", title: "첫 기록", desc: "화분을 확대해서 사진을 찍어보세요.",
    check: () => (loadStats().totalPhotos || 0) >= 1 },
];

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch (e) { return {}; }
}
function saveAchievements(a) { localStorage.setItem(ACH_KEY, JSON.stringify(a)); }

function checkAchievements() {
  const unlocked = loadAchievements();
  let newlyUnlocked = [];
  ACHIEVEMENTS.forEach((a) => {
    if (unlocked[a.id]) return;
    if (a.check()) {
      unlocked[a.id] = Date.now();
      newlyUnlocked.push(a);
    }
  });
  if (newlyUnlocked.length > 0) {
    saveAchievements(unlocked);
    newlyUnlocked.forEach((a, i) => {
      setTimeout(() => showToast(`🏆 업적 달성: ${a.title}`), i * 1600);
    });
  }
}

/* ---------------------------------------------------------
   4-2. 관리 정보 계산 (물/광합성/습도/건강도)
   --------------------------------------------------------- */
function computeCareStatus(pot) {
  const def = getPlantDef(pot.plantId);
  const env = computeEnvironment();
  const now = Date.now();
  const daysSinceWater = (now - pot.lastWateredAt) / 86400000;
  const waterLevel = clamp(100 - (daysSinceWater / def.waterIntervalDays) * 100, 0, 100);
  const overdueDays = Math.max(0, daysSinceWater - def.waterIntervalDays);
  const lightOk = env.light >= def.lightMin && env.light <= def.lightMax;
  const humidityOk = env.humidity >= def.humidityMin && env.humidity <= def.humidityMax;
  const health = clamp(
    (pot.health || 100) - overdueDays * 6 - (humidityOk ? 0 : 6),
    0, 100
  );

  const alerts = [];
  if (waterLevel < 25) alerts.push({ msg: `${def.name}이(가) 목말라해요.`, tip: "물뿌리개로 물을 주세요." });
  if (!lightOk && env.light < def.lightMin) alerts.push({ msg: "햇빛이 부족하여 성장이 느려지고 있습니다.", tip: "조명을 켜보세요." });
  if (!humidityOk && env.humidity > def.humidityMax) alerts.push({ msg: "습도가 높아 과습 위험이 있습니다.", tip: "제습기를 가동해보세요." });
  if (!humidityOk && env.humidity < def.humidityMin) alerts.push({ msg: "습도가 낮아 잎 끝이 마를 수 있어요.", tip: "가습기를 가동해보세요." });
  if (alerts.length === 0) alerts.push({ msg: "지금은 잘 자라고 있어요 🌿", tip: "" });

  return {
    def, env, waterLevel, overdueDays, lightOk, humidityOk, health, alerts, daysSinceWater,
    needsAttention: waterLevel < 25 || !lightOk || !humidityOk,
  };
}

/* ---------------------------------------------------------
   4-3. 심기 / 물주기 / 집중 성장 반영
   --------------------------------------------------------- */
/* 이전 버전에서 만들어진 "빈 화분"이 남아있는 경우를 위한 호환용 함수.
   보유한 씨앗 화분(inv.seedPots)을 사용해 빈 화분에 바로 심습니다. */
function plantSeed(pot, plantId) {
  const inv = loadInventory();
  if (!inv.seedPots[plantId] || inv.seedPots[plantId] <= 0) { showToast("씨앗 화분이 없어요"); return; }
  const def = getPlantDef(plantId);
  if (!def) return;
  inv.seedPots[plantId] -= 1;
  saveInventory(inv);
  pot.plantId = plantId;
  pot.growthUnits = 0;
  pot.health = 100;
  pot.plantedAt = Date.now();
  pot.lastWateredAt = Date.now();
  pot.name = null;
  pot.matureCounted = false;
  savePots(pots);

  const isNew = unlockDexEntry(plantId);
  const s = loadStats();
  s.totalPlanted = (s.totalPlanted || 0) + 1;
  saveStats(s);

  renderPots();
  closeSheet();
  showToast(isNew ? `${def.name}을(를) 도감에 새로 등록했어요 📖` : `${def.name} 씨앗을 심었어요 🌱`);
}

function waterPot(pot) {
  const care = computeCareStatus(pot);
  const hoursSince = (Date.now() - pot.lastWateredAt) / 3600000;
  if (hoursSince < 4) {
    showToast("아직 촉촉해요. 조금 더 기다려주세요 🌿");
    return;
  }
  pot.lastWateredAt = Date.now();
  pot.health = clamp(care.health + 12, 0, 100);
  const def = care.def;
  if (pot.growthUnits < def.totalNeeded) {
    const gain = Math.round(def.totalNeeded * 0.03);
    pot.growthUnits = clamp(pot.growthUnits + gain, 0, def.totalNeeded);
  }
  const s = loadStats();
  s.totalWaterings = (s.totalWaterings || 0) + 1;
  saveStats(s);
  savePots(pots);
  renderPots();
  spawnWaterEffect(pot);
  spawnWaterEffectZoom();
  showToast("물을 주었어요 💧");
  openPotZoom(pot);
}

/* ---- 물주기 이펙트: 물방울이 떨어지고 화분 위에 잔물결이 퍼지는 연출 ---- */
function spawnWaterEffect(pot) {
  const el = potsZone.querySelector(`[data-id="${pot.id}"]`);
  if (!el) return;
  const fx = document.createElement("div");
  fx.className = "water-fx";
  fx.innerHTML = `
    <div class="water-drop d1"></div>
    <div class="water-drop d2"></div>
    <div class="water-drop d3"></div>
    <div class="water-splash"></div>
    <div class="water-sparkle">✨</div>
  `;
  el.appendChild(fx);
  setTimeout(() => fx.remove(), 1100);
}

/* ---- 화분 확대 화면(potZoomOverlay)에서 물주기 이펙트를 재생합니다.
   물뿌리개가 기울어지고 물방울이 떨어져 화분 위에 잔물결이 퍼지는 연출로,
   확대 화면이 열려 있는 동안 물 주기 버튼을 눌렀을 때 바로 눈에 보이도록 합니다. ---- */
function spawnWaterEffectZoom() {
  const host = document.getElementById("potZoomWaterFx");
  if (!host) return;
  const fx = document.createElement("div");
  fx.innerHTML = `
    <span class="zoomfx-can">🚿</span>
    <div class="zoomfx-drop d1"></div>
    <div class="zoomfx-drop d2"></div>
    <div class="zoomfx-drop d3"></div>
    <div class="zoomfx-splash"></div>
    <div class="zoomfx-sparkle s1">✨</div>
    <div class="zoomfx-sparkle s2">✨</div>
    <div class="zoomfx-sparkle s3">✨</div>
  `;
  while (fx.firstChild) host.appendChild(fx.firstChild);
  setTimeout(() => { host.innerHTML = ""; }, 1300);
}

function growPlantsFromFocus(minutes) {
  const env = computeEnvironment();
  let grownCount = 0;
  pots.forEach((pot) => {
    if (!pot.plantId) return;
    const def = getPlantDef(pot.plantId);
    if (!def || pot.growthUnits >= def.totalNeeded) return;
    const lightOk = env.light >= def.lightMin && env.light <= def.lightMax;
    const humidityOk = env.humidity >= def.humidityMin && env.humidity <= def.humidityMax;
    let mult = 1;
    if (!lightOk) mult *= 0.5;
    if (!humidityOk) mult *= 0.7;
    const gain = Math.round(minutes * 0.9 * mult);
    if (gain > 0) {
      pot.growthUnits = clamp(pot.growthUnits + gain, 0, def.totalNeeded);
      grownCount++;
    }
  });
  if (grownCount > 0) savePots(pots);
  return grownCount;
}

/* ---------------------------------------------------------
   4-4. 인벤토리 + 상점 시스템 (3단계)
   이제 상점에서는 "빈 씨앗"이 아니라 "씨앗이 담긴 화분"을 구매합니다.
   구매한 화분은 인벤토리(seedPots)에 보관되고, 카페의 "화분 놓기"로
   바로 심어진 상태의 화분을 카페에 배치하게 됩니다. 조명·가습기·
   제습기는 처음부터 기본 제공되어 홈 화면에서 바로 켜고 끌 수 있습니다.
   --------------------------------------------------------- */
const INVENTORY_KEY = "greennote.inventory.v1";

function loadInventory() {
  try {
    const inv = JSON.parse(localStorage.getItem(INVENTORY_KEY));
    if (inv) {
      // 이전 버전 호환: "씨앗(seeds)" 인벤토리를 "씨앗 화분(seedPots)"으로 이전
      if (inv.seeds && !inv.seedPots) inv.seedPots = inv.seeds;
      inv.seedPots = inv.seedPots || {};
      delete inv.seeds;
      inv.potSlots = inv.potSlots || 9;
      inv.fertilizer = inv.fertilizer || 0;
      delete inv.devices; // 조명·가습기·제습기는 이제 기본 제공되어 더 이상 소유 여부를 추적하지 않음
      return inv;
    }
  } catch (e) {}
  // 첫 방문 시 기본 지급: 바질 씨앗 화분 1개, 비료 1개로 바로 체험해볼 수 있어요.
  return { seedPots: { basil: 1 }, fertilizer: 1, potSlots: 9 };
}
function saveInventory(inv) { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)); }
function getCoinValue() { return parseInt(localStorage.getItem(COIN_KEY) || "0", 10); }

const TOOL_ITEMS = [
  { id: "fertilizer", name: "비료", icon: "🌿", price: 80, desc: "화분 하나의 성장치를 즉시 조금 늘려줘요." },
];
function potSlotPrice(slots) { return 150 + (slots - 9) * 60; }

function buyItem(price, onSuccess) {
  if (getCoinValue() < price) { showToast("코인이 부족해요 🪙"); return; }
  addCoin(-price);
  onSuccess();
}
function buySeedPot(plantId) {
  const def = getPlantDef(plantId);
  buyItem(def.price, () => {
    const inv = loadInventory();
    inv.seedPots[plantId] = (inv.seedPots[plantId] || 0) + 1;
    saveInventory(inv);
    showToast(`${def.name} 씨앗 화분을 구매했어요 · 화분 놓기로 카페에 놓아보세요`);
    renderShopCategory("seeds");
  });
}
function buyFertilizer() {
  const item = TOOL_ITEMS[0];
  buyItem(item.price, () => {
    const inv = loadInventory();
    inv.fertilizer = (inv.fertilizer || 0) + 1;
    saveInventory(inv);
    showToast("비료를 구매했어요");
    renderShopCategory("tools");
  });
}
function buyPotSlot() {
  const inv = loadInventory();
  const price = potSlotPrice(inv.potSlots);
  buyItem(price, () => {
    inv.potSlots += 1;
    saveInventory(inv);
    showToast("화분 자리가 늘어났어요 🪴");
    renderShopCategory("pots");
  });
}
/* ---------------------------------------------------------
   4-3-1. 수확 및 판매
   열매를 맺는 식물이 완전 성장(열매) 단계에 도달하면 수확할 수 있어요.
   수확하면 코인을 얻고, 식물은 다시 열매를 맺을 수 있도록
   개화 단계로 살짝 되돌아가 자연스럽게 재성장합니다.
   --------------------------------------------------------- */
function canHarvest(pot) {
  const def = getPlantDef(pot.plantId);
  if (!def || !def.hasFruit) return false;
  return getStageInfo(pot).index === STAGES.length - 1;
}

function harvestPot(pot) {
  const def = getPlantDef(pot.plantId);
  if (!canHarvest(pot)) { showToast("아직 수확할 열매가 없어요"); return; }

  const rarityMult = 1 + (def.rarity - 1) * 0.4;
  const isBumper = Math.random() < 0.1; // 10% 확률로 풍작
  const payout = Math.round(def.fruitPrice * rarityMult * (isBumper ? 2 : 1));

  addCoin(payout);

  const s = loadStats();
  s.coinsEarned = (s.coinsEarned || 0) + payout;
  s.totalHarvests = (s.totalHarvests || 0) + 1;
  s.totalHarvestCoins = (s.totalHarvestCoins || 0) + payout;
  saveStats(s);

  // 개화 단계(index 9)로 되돌려 다시 열매를 맺도록 재성장 시작
  const bloomStagePct = STAGES[9].pct;
  pot.growthUnits = Math.round(def.totalNeeded * (bloomStagePct / 100));
  savePots(pots);
  renderPots();

  showToast(isBumper
    ? `${def.fruitIcon} 풍작이에요! 🪙 ${payout}코인을 얻었어요`
    : `${def.fruitIcon} 수확했어요! 🪙 ${payout}코인을 얻었어요`);
  closeSheet();
  openPotZoom(pot);
  checkAchievements();
}

/* ---------------------------------------------------------
   4-3-2. 열매 수확 시 판매/번식 선택
   열매를 맺는 식물이 완전 성장하면 코인으로 판매하거나,
   대신 씨앗 2개를 얻는 번식을 선택할 수 있어요.
   --------------------------------------------------------- */
function openHarvestChoiceSheet(pot) {
  if (!canHarvest(pot)) { showToast("아직 수확할 열매가 없어요"); return; }
  const def = getPlantDef(pot.plantId);
  sheetBody.dataset.kind = "harvest-choice";
  sheetBody.innerHTML = `
    <h3>${def.fruitIcon} 잘 익었어요!</h3>
    <p style="font-size:13px; color:var(--ink-faint); margin:-4px 0 4px;">열매를 어떻게 할까요?</p>
    <button class="sheet-btn harvest" id="btnSellHarvest">🪙 판매하기 (약 ${Math.round(def.fruitPrice * (1 + (def.rarity - 1) * 0.4))}코인~)</button>
    <button class="sheet-btn" id="btnBreedHarvest">🌱 번식하기 (씨앗 2개)</button>
    <button class="sheet-btn ghost-btn" id="sheetClose">닫기</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("btnSellHarvest").addEventListener("click", () => harvestPot(pot));
  document.getElementById("btnBreedHarvest").addEventListener("click", () => breedPlant(pot));
}

/* ---------------------------------------------------------
   4-3-3. 번식 (씨앗 2개 획득)
   열매를 맺지 않는 식물은 완전 성장하면 이 함수로 바로 번식하며,
   열매를 맺는 식물은 위의 선택 시트에서 번식을 고르면 실행됩니다.
   --------------------------------------------------------- */
function canBreedNow(pot) {
  const def = getPlantDef(pot.plantId);
  if (!def || def.hasFruit) return false;
  return getStageInfo(pot).index === STAGES.length - 1;
}

function breedPlant(pot) {
  const def = getPlantDef(pot.plantId);
  if (!def) return;

  const inv = loadInventory();
  inv.seedPots[pot.plantId] = (inv.seedPots[pot.plantId] || 0) + 2;
  saveInventory(inv);

  const s = loadStats();
  s.totalBreeds = (s.totalBreeds || 0) + 1;
  s.totalBreedSeeds = (s.totalBreedSeeds || 0) + 2;
  saveStats(s);

  // 개화(혹은 그에 준하는) 단계로 되돌려 다시 완전 성장까지 자랄 수 있게 함
  const bloomStagePct = STAGES[9].pct;
  pot.growthUnits = Math.round(def.totalNeeded * (bloomStagePct / 100));
  savePots(pots);
  renderPots();

  showToast(`🌱 ${def.name} 씨앗을 2개 얻었어요!`);
  closeSheet();
  openPotZoom(pot);
  checkAchievements();
}

function useFertilizer(pot) {
  const inv = loadInventory();
  if (!inv.fertilizer) { showToast("비료가 없어요. 상점에서 구매해보세요"); return; }
  const def = getPlantDef(pot.plantId);
  if (pot.growthUnits >= def.totalNeeded) { showToast("이미 다 자란 식물이에요"); return; }
  inv.fertilizer -= 1;
  saveInventory(inv);
  pot.growthUnits = clamp(pot.growthUnits + Math.round(def.totalNeeded * 0.08), 0, def.totalNeeded);
  savePots(pots);
  renderPots();
  showToast("비료를 사용했어요 🌿");
  openPotZoom(pot);
}

const SEASON_RECOMMEND = {
  "봄":   ["basil", "lavender", "strawberry"],
  "여름": ["sunflower", "cherrytomato", "blueberry"],
  "가을": ["rosemary", "lavender", "monstera"],
  "겨울": ["peacelily", "monstera", "rose"],
};
const SEASON_ICON = { "봄": "🌸", "여름": "☀️", "가을": "🍂", "겨울": "❄️" };

function seasonRecoHtml() {
  const season = getSeason();
  const ids = SEASON_RECOMMEND[season.name] || [];
  const cards = ids.map((id) => {
    const def = getPlantDef(id);
    if (!def) return "";
    return `
      <button class="season-card" data-buy="seedPot" data-id="${def.id}">
        <span class="season-card-icon">${def.icon}</span>
        <span class="season-card-name">${def.name} 화분</span>
        <span class="season-card-diff">난이도 ${def.difficulty}</span>
        <span class="season-card-meta">☀️ ${def.lightMin}~${def.lightMax}% · 💧 ${def.waterIntervalDays}일 · 💦 ${def.humidityMin}~${def.humidityMax}%</span>
        <span class="season-card-buy">🪙 ${def.price}</span>
      </button>`;
  }).join("");
  return `
    <div class="season-reco">
      <p class="season-reco-title">${SEASON_ICON[season.name] || "🌱"} 지금은 ${season.name}, 이런 식물이 잘 자라요</p>
      <div class="season-reco-row">${cards}</div>
    </div>`;
}

let activeShopCat = "seeds";
const SEED_CATEGORIES = ["전체", "관엽식물", "꽃", "과일", "허브"];
let activeSeedCat = "전체";
function renderShopCategory(cat) {
  activeShopCat = cat;
  document.querySelectorAll(".shop-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.cat === cat));
  document.getElementById("shopCoinValue").textContent = getCoinValue();
  const inv = loadInventory();
  const scroll = document.getElementById("shopScroll");

  if (cat === "seeds") {
    const filtered = Object.values(PLANT_CATALOG).filter(
      (def) => activeSeedCat === "전체" || def.category === activeSeedCat
    );
    scroll.innerHTML = `${seasonRecoHtml()}
      <div class="seed-cat-filters">${SEED_CATEGORIES.map((c) => `
        <button class="seed-cat-chip${c === activeSeedCat ? " is-active" : ""}" data-seedcat="${c}">${c}</button>`).join("")}</div>
      <div class="shop-grid">${filtered.map((def) => `
      <div class="shop-card">
        <span class="sc-icon">${def.icon}</span>
        <span class="sc-name">${def.name} 화분</span>
        <span class="sc-meta">보유 ${inv.seedPots[def.id] || 0}개 · 난이도 ${def.difficulty}</span>
        <button class="sc-buy" data-buy="seedPot" data-id="${def.id}">🪙 ${def.price}</button>
      </div>`).join("") || `<p class="shop-soon">이 분류에는 아직 식물이 없어요.</p>`}</div>`;
  } else if (cat === "tools") {
    scroll.innerHTML = `<div class="shop-grid">${TOOL_ITEMS.map((item) => `
      <div class="shop-card">
        <span class="sc-icon">${item.icon}</span>
        <span class="sc-name">${item.name}</span>
        <span class="sc-meta">보유 ${inv.fertilizer || 0}개 · ${item.desc}</span>
        <button class="sc-buy" data-buy="fertilizer" data-id="${item.id}">🪙 ${item.price}</button>
      </div>`).join("")}</div>`;
  } else if (cat === "pots") {
    const price = potSlotPrice(inv.potSlots);
    scroll.innerHTML = `<div class="shop-grid">
      <div class="shop-card">
        <span class="sc-icon">🪴</span>
        <span class="sc-name">화분 자리 확장</span>
        <span class="sc-meta">현재 ${inv.potSlots}자리 → ${inv.potSlots + 1}자리</span>
        <button class="sc-buy" data-buy="potSlot">🪙 ${price}</button>
      </div>
    </div>`;
  }

  if (cat === "seeds") {
    scroll.querySelectorAll("[data-seedcat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSeedCat = btn.dataset.seedcat;
        renderShopCategory("seeds");
      });
    });
  }

  scroll.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.buy;
      if (kind === "seedPot") buySeedPot(btn.dataset.id);
      else if (kind === "fertilizer") buyFertilizer();
      else if (kind === "potSlot") buyPotSlot();
    });
  });
}

function openShop() {
  renderShopCategory(activeShopCat);
  document.getElementById("shopOverlay").classList.add("show");
}
function closeShop() {
  document.getElementById("shopOverlay").classList.remove("show");
}
document.getElementById("shopClose").addEventListener("click", closeShop);
document.querySelectorAll(".shop-tab").forEach((t) => t.addEventListener("click", () => renderShopCategory(t.dataset.cat)));

/* ---------------------------------------------------------
   4-5. 도감 오버레이
   --------------------------------------------------------- */
function renderDex() {
  const dex = loadDex();
  const { unlocked, total } = dexCompletionRatio();
  document.getElementById("dexProgress").textContent = `${unlocked} / ${total}`;
  const scroll = document.getElementById("dexScroll");
  scroll.innerHTML = `<div class="dex-grid">${Object.values(PLANT_CATALOG).map((def) => {
    const entry = dex[def.id];
    const stars = "⭐".repeat(def.rarity || 1);
    if (!entry) {
      return `
        <div class="dex-card is-locked">
          <span class="dex-lock-badge">🔒</span>
          <span class="dex-icon">❔</span>
          <span class="dex-name">???</span>
          <span class="dex-meta">아직 심어보지 않았어요</span>
        </div>`;
    }
    const stageLabel = STAGES[entry.bestStageIndex].label;
    const stagePct = Math.round((entry.bestStageIndex / (STAGES.length - 1)) * 100);
    return `
      <div class="dex-card">
        <span class="dex-icon">${def.icon}</span>
        <span class="dex-name">${def.name}<span class="dex-star">${stars}</span></span>
        <span class="dex-meta">${def.category} · 최고 단계 ${stageLabel}${entry.matureCount ? ` · 완전 성장 ${entry.matureCount}회` : ""}</span>
        <div class="dex-stage-track"><div class="dex-stage-fill" style="width:${stagePct}%"></div></div>
      </div>`;
  }).join("")}</div>`;
}
function openDex() {
  renderDex();
  document.getElementById("dexOverlay").classList.add("show");
}
function closeDex() { document.getElementById("dexOverlay").classList.remove("show"); }
document.getElementById("dexClose").addEventListener("click", closeDex);

/* ---------------------------------------------------------
   4-6. 통계 대시보드 오버레이
   --------------------------------------------------------- */
function formatHM(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h <= 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}
function longestKeptPot() {
  const planted = pots.filter((p) => p.plantId);
  if (planted.length === 0) return null;
  return planted.reduce((a, b) => (a.plantedAt < b.plantedAt ? a : b));
}
function renderStats() {
  const s = loadStats();
  const dexInfo = dexCompletionRatio();
  const totalPlanted = s.totalPlanted || 0;
  const currentlyPlanted = pots.filter((p) => p.plantId).length;
  const survivalPct = totalPlanted > 0 ? Math.min(100, Math.round((currentlyPlanted / totalPlanted) * 100)) : 100;
  const longest = longestKeptPot();
  const longestLabel = longest
    ? `${(getPlantDef(longest.plantId) || {}).name || "식물"} · ${Math.max(0, Math.floor((Date.now() - longest.plantedAt) / 86400000))}일째`
    : "아직 없어요";

  document.getElementById("statsScroll").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card-label">총 공부 시간</div>
        <div class="stat-card-value">${formatHM(s.totalSeconds || 0)}</div>
        <div class="stat-card-sub">세션 ${s.sessions || 0}회</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">총 코인 획득</div>
        <div class="stat-card-value">🪙 ${s.coinsEarned || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">총 물 준 횟수</div>
        <div class="stat-card-value">💧 ${s.totalWaterings || 0}회</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">식물 생존율</div>
        <div class="stat-card-value">${survivalPct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">총 수확 횟수</div>
        <div class="stat-card-value">🧺 ${s.totalHarvests || 0}회</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">수확으로 번 코인</div>
        <div class="stat-card-value">🪙 ${s.totalHarvestCoins || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">번식으로 얻은 씨앗</div>
        <div class="stat-card-value">🌱 ${s.totalBreedSeeds || 0}개</div>
      </div>
      <div class="stat-card wide">
        <div class="stat-card-label">가장 오래 키운 식물</div>
        <div class="stat-card-value">${longestLabel}</div>
      </div>
      <div class="stat-card wide">
        <div class="stat-card-label">도감 완성률</div>
        <div class="stat-card-value">${dexInfo.pct}%</div>
        <div class="stat-card-sub">${dexInfo.unlocked} / ${dexInfo.total}종 발견</div>
      </div>
    </div>`;
}
function renderAchievements() {
  const unlocked = loadAchievements();
  const doneCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  document.getElementById("statsScroll").innerHTML = `
    <p class="ach-progress">${doneCount} / ${ACHIEVEMENTS.length} 달성</p>
    <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
      const done = !!unlocked[a.id];
      return `
        <div class="ach-card ${done ? "is-unlocked" : ""}">
          <span class="ach-icon">${done ? a.icon : "🔒"}</span>
          <span class="ach-title">${a.title}</span>
          <span class="ach-desc">${a.desc}</span>
        </div>`;
    }).join("")}</div>`;
}

let activeStatsTab = "stats";
function renderStatsPanel() {
  if (activeStatsTab === "ach") renderAchievements();
  else renderStats();
}
document.querySelectorAll('#statsTabs .shop-tab').forEach((t) => {
  t.addEventListener("click", () => {
    activeStatsTab = t.dataset.stab;
    document.querySelectorAll('#statsTabs .shop-tab').forEach((b) => b.classList.toggle("is-active", b === t));
    renderStatsPanel();
  });
});

function openStats() {
  renderStatsPanel();
  document.getElementById("statsOverlay").classList.add("show");
}
function closeStats() { document.getElementById("statsOverlay").classList.remove("show"); }
document.getElementById("statsClose").addEventListener("click", closeStats);

function renderPots() {
  potsZone.innerHTML = "";
  pots.forEach(pot => renderPot(pot));
  checkAchievements();
}

function renderPlantVisual(def, stage, pot) {
  const photoSrc = getPlantImageSrc(def.id, stage.index);
  if (photoSrc) {
    return `<img class="plant-photo" src="${photoSrc}" alt="${def.name} · ${stage.label}" draggable="false" />`;
  }
  if (stage.index === 0) {
    return `<div class="plant" style="--stage:0"><div class="seed-dot"></div></div>`;
  }
  const leafCount = Math.min(5, 1 + Math.floor(stage.index / 2));
  let leaves = "";
  for (let i = 0; i < leafCount; i++) leaves += `<div class="leaf"></div>`;

  let bloom = "";
  if (def.hasFruit && stage.index >= 10) {
    bloom = `<div class="bloom">${def.fruitIcon || "🍅"}</div>`;
  } else if (def.hasFlower && stage.index >= 9) {
    bloom = `<div class="bloom">${def.bloomIcon || "🌸"}</div>`;
  } else if (def.hasFlower && stage.index === 8) {
    bloom = `<div class="bloom bud"></div>`;
  }
  return `<div class="plant" style="--stage:${stage.index}">${leaves}${bloom}</div>`;
}

function renderPot(pot) {
  const el = document.createElement("div");
  const planted = !!pot.plantId;
  el.className = "pot" + (!planted ? " is-empty" : "");
  // y(선반 높이)는 항상 "현재 화면"의 선반 기준으로 다시 계산합니다.
  // (같은 데이터를 데스크톱/모바일에서 번갈아 열어도 선반 위치가 어긋나지 않도록)
  const tier = getShelfTierForPot(pot);
  const renderX = clamp(pot.x, tier.xMin, tier.xMax);
  el.style.left = (renderX * 100) + "%";
  el.style.top = (tier.y * 100) + "%";
  el.dataset.id = pot.id;

  if (!planted) {
    el.innerHTML = `
      <div class="pot-sprout"></div>
      <div class="pot-body"></div>
      <div class="pot-label">빈 화분</div>
    `;
  } else {
    const def = getPlantDef(pot.plantId);
    const stage = getStageInfo(pot);
    const care = computeCareStatus(pot);
    updateDexProgress(pot);
    const hasPhoto = !!getPlantImageSrc(pot.plantId, stage.index);
    if (hasPhoto) el.classList.add("pot-photo");
    el.innerHTML = `
      ${renderPlantVisual(def, stage, pot)}
      ${hasPhoto ? "" : `<div class="pot-body"></div>`}
      ${canHarvest(pot) ? `<div class="pot-harvest-badge" title="수확할 수 있어요">🧺</div>` : ""}
      ${canBreedNow(pot) ? `<div class="pot-harvest-badge" title="번식할 수 있어요">🌱</div>` : ""}
      ${care.needsAttention ? `<div class="pot-alert" title="관리가 필요해요">⚠️</div>` : ""}
      <div class="pot-label">${pot.name || def.name} · ${stage.label}</div>
    `;
  }

  makeDraggable(el, pot, potsZone, () => { savePots(pots); showToast("화분 위치를 저장했어요"); });
  el.addEventListener("click", (e) => {
    if (el.dataset.dragged === "1") { el.dataset.dragged = "0"; return; }
    openPotSheet(pot);
  });

  potsZone.appendChild(el);
}

/* ---------------------------------------------------------
   4-7. 화분 확대 보기 + 사진 촬영
   화분을 탭하면 그 화분 하나만 크게 볼 수 있는 전체화면 뷰를 열고,
   그 안에서 물주기 등 관리 작업을 모두 처리합니다.
   캔버스에 화분+식물을 직접 그려서(외부 이미지 없이) 오프라인에서도
   동작하며, 그 캔버스를 그대로 사진으로 저장할 수 있게 합니다.
   --------------------------------------------------------- */
const potZoomOverlay = document.getElementById("potZoomOverlay");
const potZoomCanvas = document.getElementById("potZoomCanvas");
const potZoomInfo = document.getElementById("potZoomInfo");
const potZoomActions = document.getElementById("potZoomActions");

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function potBodyPath(ctx, x, y, w, h, rTop, rBottom) {
  ctx.beginPath();
  ctx.moveTo(x + rTop, y);
  ctx.lineTo(x + w - rTop, y);
  ctx.arcTo(x + w, y, x + w, y + rTop, rTop);
  ctx.lineTo(x + w, y + h - rBottom);
  ctx.arcTo(x + w, y + h, x + w - rBottom, y + h, rBottom);
  ctx.lineTo(x + rBottom, y + h);
  ctx.arcTo(x, y + h, x, y + h - rBottom, rBottom);
  ctx.lineTo(x, y + rTop);
  ctx.arcTo(x, y, x + rTop, y, rTop);
  ctx.closePath();
}

/* 화분 위 식물을 캔버스에 그림 (styles.css 의 .plant / .leaf / .bloom 을 참고한 근사치) */
function drawPlantOnCanvas(ctx, cx, baseY, stage, def) {
  if (!def || stage.index === 0) {
    ctx.fillStyle = "#5C4430";
    ctx.beginPath();
    ctx.arc(cx, baseY - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    return baseY - 12;
  }
  const leafCount = Math.min(5, 1 + Math.floor(stage.index / 2));
  const leafW = 9 + stage.index * 3.4;
  const leafH = 13 + stage.index * 4.6;
  const offsets = [0, -14, 14, -26, 26];

  for (let i = 0; i < leafCount; i++) {
    const dx = offsets[i] * (leafW / 22);
    ctx.save();
    ctx.translate(cx + dx, baseY);
    ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.18);
    ctx.fillStyle = i % 2 === 1 ? "#8FAE7C" : "#5B7A54";
    ctx.beginPath();
    ctx.ellipse(0, -leafH / 2, leafW / 2, leafH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const topY = baseY - leafH;
  if (def.hasFruit && stage.index >= 10) {
    ctx.font = (16 + stage.index * 2.4) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(def.fruitIcon || "🍅", cx, topY - 4);
  } else if (def.hasFlower && stage.index >= 9) {
    ctx.font = (16 + stage.index * 2.4) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(def.bloomIcon || "🌸", cx, topY - 4);
  } else if (def.hasFlower && stage.index === 8) {
    ctx.fillStyle = "#C97B4A";
    ctx.beginPath();
    ctx.arc(cx, topY - 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return topY;
}

/* 사진 기반 식물(현재 몬스테라)을 캔버스에 그림.
   이미지가 아직 로딩 중이면 로드가 끝난 뒤 같은 화분이 여전히
   열려있을 때만 다시 그려서 갱신합니다. */
function drawPlantPhotoOnCanvas(canvas, pot, src, cx, baseY) {
  const ctx = canvas.getContext("2d");
  const img = getPlantImageEl(src);
  if (img.complete && img.naturalWidth) {
    const targetW = canvas.width * 0.46;
    const ratio = img.naturalHeight / img.naturalWidth;
    const w = targetW, h = targetW * ratio;
    ctx.drawImage(img, cx - w / 2, baseY - h, w, h);
  } else {
    img.addEventListener("load", () => {
      if (potZoomOverlay.dataset.potId === pot.id) drawPotPortrait(canvas, pot);
    }, { once: true });
  }
}

/* 화분+식물 전체를 캔버스 하나에 그려서, 확대 화면 표시와 사진 저장에 그대로 재사용합니다. */
function drawPotPortrait(canvas, pot) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FBF7EF");
  bg.addColorStop(1, "#ECE3D2");
  ctx.fillStyle = bg;
  roundRectPath(ctx, 0, 0, W, H, W * 0.045);
  ctx.fill();

  const planted = !!pot.plantId;
  const def = planted ? getPlantDef(pot.plantId) : null;
  const stage = planted ? getStageInfo(pot) : { index: 0, label: "빈 화분", pct: 0 };

  const potW = W * 0.34, potH = H * 0.2;
  const potX = W / 2 - potW / 2;
  const potBottomY = H * 0.76;
  const potTopY = potBottomY - potH;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(W / 2, potBottomY + potH * 0.22, potW * 0.66, potH * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(64,48,31,0.14)";
  ctx.fill();
  ctx.restore();

  // 식물은 화분 테두리 뒤에서 자라나오는 것처럼 먼저 그림
  const photoSrc = planted ? getPlantImageSrc(pot.plantId, stage.index) : null;

  if (photoSrc) {
    drawPlantPhotoOnCanvas(canvas, pot, photoSrc, W / 2, potBottomY);
  } else {
    drawPlantOnCanvas(ctx, W / 2, potTopY + potH * 0.12, stage, def);

    const potGrad = ctx.createLinearGradient(0, potTopY, 0, potBottomY);
    potGrad.addColorStop(0, "#C97B4A");
    potGrad.addColorStop(1, "#A85F35");
    ctx.fillStyle = potGrad;
    potBodyPath(ctx, potX, potTopY, potW, potH, potH * 0.14, potH * 0.4);
    ctx.fill();

    ctx.fillStyle = "#A85F35";
    roundRectPath(ctx, potX - potW * 0.08, potTopY - potH * 0.16, potW * 1.16, potH * 0.22, potH * 0.08);
    ctx.fill();

    if (!planted) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = (potH * 0.4) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("＋", W / 2, potBottomY - potH * 0.32);
    }
  }

  ctx.fillStyle = "#3A322A";
  ctx.font = "600 " + Math.round(W * 0.05) + "px 'Gowun Batang', serif";
  ctx.textAlign = "center";
  const label = planted ? `${pot.name || def.name} · ${stage.label}` : "빈 화분";
  ctx.fillText(label, W / 2, H * 0.9);

  ctx.fillStyle = "rgba(58,50,42,0.45)";
  ctx.font = Math.round(W * 0.032) + "px 'Gowun Dodum', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🌿 그린노트", W * 0.05, H * 0.065);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleDateString("ko-KR"), W * 0.95, H * 0.065);
}

/* 화분 확대 화면 열기: 식물이 심어진 화분을 탭했을 때 이 화면이 열리며
   여기서 물주기/비료/수확/번식/사진찍기/제거를 모두 처리합니다. */
function openPotZoom(pot) {
  if (!pot.plantId) { openPlantSelectSheet(pot); return; }
  const def = getPlantDef(pot.plantId);
  const stage = getStageInfo(pot);
  const care = computeCareStatus(pot);
  const pct = Math.round(stage.pct);

  potZoomOverlay.dataset.potId = pot.id;
  potZoomOverlay.classList.add("show");
  drawPotPortrait(potZoomCanvas, pot);

  potZoomInfo.innerHTML = `
    <h3>${def.icon} ${pot.name || def.name}</h3>
    <p class="care-stage">${stage.label} · 성장률 ${pct}%</p>
    <div class="care-bars">
      <div class="care-bar"><span>건강도</span><div class="bar-track"><div class="bar-fill health" style="width:${Math.round(care.health)}%"></div></div></div>
      <div class="care-bar"><span>수분</span><div class="bar-track"><div class="bar-fill water" style="width:${Math.round(care.waterLevel)}%"></div></div></div>
    </div>
    <div class="env-grid">
      <div class="env-stat"><div class="env-stat-label">광합성량</div><div class="env-stat-value">${care.env.light}% ${care.lightOk ? "✅" : "⚠️"}</div></div>
      <div class="env-stat"><div class="env-stat-label">습도</div><div class="env-stat-value">${care.env.humidity}% ${care.humidityOk ? "✅" : "⚠️"}</div></div>
    </div>
    ${care.alerts.map((a) => `<div class="env-alert">🪴 <div>${a.msg}${a.tip ? ` <span class="tip">${a.tip}</span>` : ""}</div></div>`).join("")}
    <p style="font-size:12px; color:var(--ink-faint); margin: 2px 0 0;">
      마지막 물 준 지 ${Math.max(0, Math.floor(care.daysSinceWater))}일 지났어요 · 권장 주기 ${def.waterIntervalDays}일마다
    </p>`;

  potZoomActions.innerHTML = `
    <button class="zoom-btn camera" id="btnZoomPhoto">📸 사진 찍기</button>
    ${canHarvest(pot) ? `<button class="zoom-btn harvest" id="btnZoomHarvest">${def.fruitIcon} 수확하기</button>` : ""}
    ${canBreedNow(pot) ? `<button class="zoom-btn harvest" id="btnZoomBreed">🌱 번식하기</button>` : ""}
    <button class="zoom-btn" id="btnZoomWater">💧 물 주기</button>
    ${loadInventory().fertilizer > 0 ? `<button class="zoom-btn ghost" id="btnZoomFertilize">🌿 비료 사용 (보유 ${loadInventory().fertilizer}개)</button>` : ""}
    <button class="zoom-btn text-danger" id="btnZoomRemove">🗑️ 화분 제거</button>`;

  document.getElementById("btnZoomPhoto").addEventListener("click", () => capturePotPhoto(pot));
  document.getElementById("btnZoomWater").addEventListener("click", () => waterPot(pot));
  const zFert = document.getElementById("btnZoomFertilize");
  if (zFert) zFert.addEventListener("click", () => useFertilizer(pot));
  const zHarvest = document.getElementById("btnZoomHarvest");
  if (zHarvest) zHarvest.addEventListener("click", () => { closeSheet(); openHarvestChoiceSheet(pot); });
  const zBreed = document.getElementById("btnZoomBreed");
  if (zBreed) zBreed.addEventListener("click", () => breedPlant(pot));
  document.getElementById("btnZoomRemove").addEventListener("click", () => openRemovePotConfirm(pot));
}

function closePotZoom() {
  potZoomOverlay.classList.remove("show");
  delete potZoomOverlay.dataset.potId;
}
document.getElementById("potZoomClose").addEventListener("click", closePotZoom);
potZoomOverlay.addEventListener("click", (e) => {
  if (e.target === potZoomOverlay) closePotZoom();
});

/* 화분+식물이 모두 보이는 캔버스를 그대로 사진으로 저장합니다.
   공유 시트를 지원하는 기기에서는 공유/저장 메뉴가 뜨고,
   지원하지 않으면 파일 다운로드로 저장됩니다. */
function capturePotPhoto(pot) {
  const stageEl = document.getElementById("potZoomStage");
  stageEl.classList.add("is-flash");
  setTimeout(() => stageEl.classList.remove("is-flash"), 260);

  potZoomCanvas.toBlob(async (blob) => {
    if (!blob) { showToast("사진을 만들지 못했어요"); return; }
    const def = getPlantDef(pot.plantId);
    const safeName = (pot.name || (def && def.name) || "화분").replace(/\s+/g, "");
    const fname = `greennote_${safeName}_${new Date().toISOString().slice(0, 10)}.png`;

    let saved = false;
    if (navigator.canShare && (() => { try { return navigator.canShare({ files: [new File([blob], fname, { type: "image/png" })] }); } catch (e) { return false; } })()) {
      try {
        const file = new File([blob], fname, { type: "image/png" });
        await navigator.share({ files: [file], title: "그린노트", text: `${def ? def.name : "식물"} 사진` });
        saved = true;
      } catch (e) { /* 사용자가 공유를 취소한 경우 */ }
    }
    if (!saved) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    const s = loadStats();
    s.totalPhotos = (s.totalPhotos || 0) + 1;
    saveStats(s);
    showToast("사진을 저장했어요 📸");
    checkAchievements();
  }, "image/png");
}

/* ---- 같은 선반 화분끼리 겹치지 않도록 하는 헬퍼 ----
   화분 하나의 실제 폭(78px 고정, styles.css .pot 참고) + 여유 간격을 기준으로,
   같은 선반(tier)에 있는 다른 화분들과 최소 거리를 유지하도록 x 이동 범위를 좁힙니다. */
const POT_WIDTH_PX = 78;
const POT_GAP_PX = -30;
function getPotMinGapFraction(zoneRect) {
  return (POT_WIDTH_PX + POT_GAP_PX) / zoneRect.width;
}

// tier.xMin~xMax 범위를, 같은 선반의 다른 화분들과 겹치지 않는 더 좁은 범위로 조여줍니다.
function getNeighborBounds(pot, tier, nx, zoneRect) {
  const minGap = getPotMinGapFraction(zoneRect);
  let lower = tier.xMin;
  let upper = tier.xMax;
  pots.forEach((other) => {
    if (other.id === pot.id) return;
    const otherTier = getShelfTierForPot(other);
    if (otherTier.key !== tier.key) return;
    if (other.x <= nx) lower = Math.max(lower, other.x + minGap);
    if (other.x >= nx) upper = Math.min(upper, other.x - minGap);
  });
  return { lower, upper };
}

// 화분이 같은 선반의 다른 화분과 겹쳐 있는지 검사합니다.
function isOverlappingNeighbor(pot, zoneRect) {
  const tier = getShelfTierForPot(pot);
  const minGap = getPotMinGapFraction(zoneRect);
  return pots.some((other) => {
    if (other.id === pot.id) return false;
    const otherTier = getShelfTierForPot(other);
    if (otherTier.key !== tier.key) return false;
    return Math.abs(other.x - pot.x) < minGap;
  });
}

/* ---------------------------------------------------------
   5. 드래그 배치 (pointer events, 모바일 사파리 대응)
   --------------------------------------------------------- */
function makeDraggable(el, item, zone, onSettle) {
  zone = zone || potsZone;
  let startX, startY, origX, origY, moved = false;
  let warnedThisDrag = false; // 이번 드래그 동안 안내 문구를 한 번만 보여주기 위한 플래그

  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    origX = item.x;
    origY = item.y;
    moved = false;
    warnedThisDrag = false;
    el.style.zIndex = 50;
  });

  el.addEventListener("pointermove", (e) => {
    if (e.buttons === 0) return;
    if (startX === undefined) return;
    const zoneRect = zone.getBoundingClientRect();
    const dxRatio = (e.clientX - startX) / zoneRect.width;
    const dyRatio = (e.clientY - startY) / zoneRect.height;
    if (Math.abs(dxRatio) > 0.005 || Math.abs(dyRatio) > 0.005) moved = true;

    // 화분은 자신이 속한 선반(top/middle/bottom)에서만 움직일 수 있습니다.
    // 세로(y)는 그 선반의 고정 높이로 잠겨 있고, 가로(x)만 그 선반의 범위 안에서 이동합니다.
    const tier = getShelfTierForPot(item);
    let nx = clamp(origX + dxRatio, tier.xMin, tier.xMax);
    // 같은 선반의 다른 화분과 겹치지 않는 범위까지만 이동을 허용합니다.
    const bounds = getNeighborBounds(item, tier, nx, zoneRect);
    nx = clamp(nx, bounds.lower, bounds.upper);
    const ny = tier.y;

    // 사용자가 세로로 크게 움직여 다른 선반으로 옮기려 하면, 안내 문구를 한 번 보여줍니다.
    if (!warnedThisDrag && Math.abs(dyRatio) > 0.06) {
      warnedThisDrag = true;
      showToast(`이곳에 둘 수 없어요. ${tier.label}에 배치해주세요`);
    }

    item.x = nx; item.y = ny;
    el.style.left = (nx * 100) + "%";
    el.style.top = (ny * 100) + "%";
  });

  el.addEventListener("pointerup", (e) => {
    el.style.zIndex = "";
    if (moved) {
      el.dataset.dragged = "1";
      // 선반 규칙을 최종적으로 한 번 더 확실히 맞춰줍니다(x 범위/고정 y).
      snapPotToShelf(item);
      const zoneRect = zone.getBoundingClientRect();
      if (isOverlappingNeighbor(item, zoneRect)) {
        // 그래도 겹치는 경우(예: 빠르게 드래그해 겹친 경우) 원래 자리로 자연스럽게 되돌립니다.
        item.x = origX;
        item.y = origY;
        el.style.transition = "left 0.35s cubic-bezier(.34,1.4,.64,1), top 0.35s cubic-bezier(.34,1.4,.64,1)";
        el.style.left = (origX * 100) + "%";
        el.style.top = (origY * 100) + "%";
        showToast("다른 화분과 겹쳐서 원래 자리로 돌아왔어요");
        setTimeout(() => { el.style.transition = ""; }, 380);
      } else {
        el.style.left = (item.x * 100) + "%";
        el.style.top = (item.y * 100) + "%";
        if (onSettle) onSettle();
      }
    }
    startX = undefined;
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ---------------------------------------------------------
   화분을 놓을 정해진 위치 찾기.
   각 식물 종류는 SHELF_TIERS_DESKTOP/SHELF_TIERS_MOBILE 에 지정된 자기 선반(top/middle/bottom)이 있고,
   그 선반 안에서 이미 놓인 다른 화분과 겹치지 않는 첫 빈 자리를 찾아 놓습니다.
   (더 이상 랜덤 위치가 아니고, 선반도 항상 식물 종류에 맞게 고정됩니다)
   --------------------------------------------------------- */
function findFreeTierSlotX(tier, zoneRect) {
  const minGap = getPotMinGapFraction(zoneRect);
  const samePots = pots.filter((p) => getShelfTierForPot(p).key === tier.key);
  const center = (tier.xMin + tier.xMax) / 2;
  const step = minGap * 0.95;
  const candidates = [center];
  for (let i = 1; i < 24; i++) {
    candidates.push(center + i * step);
    candidates.push(center - i * step);
  }
  for (const cand of candidates) {
    const x = clamp(cand, tier.xMin, tier.xMax);
    if (!samePots.some((p) => Math.abs(p.x - x) < minGap)) return x;
  }
  return clamp(center, tier.xMin, tier.xMax); // 선반이 가득 찬 경우의 대비책
}

/* ---------------------------------------------------------
   6. 화분 추가
   빈 화분에 나중에 씨앗을 심는 방식이 아니라, 상점에서 미리 구매해 둔
   "씨앗이 담긴 화분"(inv.seedPots) 중 하나를 골라 카페에 바로 놓습니다.
   놓는 즉시 씨앗 단계부터 성장이 시작됩니다.
   --------------------------------------------------------- */
document.getElementById("dockAddPot").addEventListener("click", () => {
  const inv = loadInventory();
  if (pots.length >= inv.potSlots) {
    showToast("화분 자리가 가득 찼어요. 상점에서 자리를 늘려보세요 🪴");
    return;
  }
  openSeedPotPlaceSheet();
});

function openSeedPotPlaceSheet() {
  const inv = loadInventory();
  const owned = Object.values(PLANT_CATALOG).filter((def) => (inv.seedPots[def.id] || 0) > 0);
  sheetBody.dataset.kind = "seedpot-place";

  if (owned.length === 0) {
    sheetBody.innerHTML = `
      <h3>씨앗 화분이 없어요</h3>
      <p>상점에서 씨앗이 담긴 화분을 구매하면 카페에 바로 놓을 수 있어요.</p>
      <button class="sheet-btn" id="btnGoShop">🛍️ 상점으로 가기</button>
      <button class="sheet-btn ghost-btn" id="sheetClose">나중에 할게요</button>`;
    sheetBackdrop.classList.add("show");
    document.getElementById("sheetClose").addEventListener("click", closeSheet);
    document.getElementById("btnGoShop").addEventListener("click", () => { closeSheet(); openShop(); renderShopCategory("seeds"); });
    return;
  }

  sheetBody.innerHTML = `
    <h3>어떤 화분을 놓을까요?</h3>
    <p style="margin:-4px 0 4px; font-size:12.5px; color:var(--ink-faint);">보유한 씨앗 화분 중 하나를 골라 카페에 놓아요.</p>
    <div class="plant-grid">${owned.map((def) => plantCardHtml(def, inv.seedPots[def.id])).join("")}</div>
    <button class="sheet-btn ghost-btn" id="sheetClose">나중에 할게요</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  sheetBody.querySelectorAll(".plant-card").forEach((btn) => {
    btn.addEventListener("click", () => placeSeedPot(btn.dataset.plant));
  });
}

function placeSeedPot(plantId) {
  const inv = loadInventory();
  if (!inv.seedPots[plantId] || inv.seedPots[plantId] <= 0) { showToast("씨앗 화분이 없어요"); return; }
  if (pots.length >= inv.potSlots) {
    showToast("화분 자리가 가득 찼어요. 상점에서 자리를 늘려보세요 🪴");
    closeSheet();
    return;
  }
  const def = getPlantDef(plantId);
  if (!def) return;

  inv.seedPots[plantId] -= 1;
  saveInventory(inv);

  const tier = getShelfTierForPlant(plantId);
  const zoneRect = potsZone.getBoundingClientRect();
  const slotX = findFreeTierSlotX(tier, zoneRect);
  const pot = {
    id: "pot_" + Date.now(),
    x: slotX,
    y: tier.y,
    shelfTier: tier.key,
    plantId,
    growthUnits: 0,
    health: 100,
    plantedAt: Date.now(),
    lastWateredAt: Date.now(),
    name: null,
    matureCounted: false,
    createdAt: Date.now(),
  };
  pots.push(pot);
  savePots(pots);
  renderPot(pot);

  const isNew = unlockDexEntry(plantId);
  const s = loadStats();
  s.totalPlanted = (s.totalPlanted || 0) + 1;
  saveStats(s);

  closeSheet();
  showToast(isNew
    ? `${def.name} 화분을 카페에 놓았어요 · 도감에 새로 등록했어요 📖`
    : `${def.name} 화분을 카페에 놓았어요 🌱`);
}

/* ---------------------------------------------------------
   7. 화분 클릭 시 안내 시트 (심기 기능은 다음 단계)
   --------------------------------------------------------- */
function openPotSheet(pot) {
  if (!pot.plantId) openPlantSelectSheet(pot);
  else openPotZoom(pot);
}

function plantCardHtml(def, owned) {
  return `
    <button class="plant-card" data-plant="${def.id}">
      <span class="pc-icon">${def.icon}</span>
      <span class="pc-name">${def.name} <small>(${owned}개)</small></span>
      <span class="pc-meta">
        광량 ${def.lightMin}~${def.lightMax}% · 습도 ${def.humidityMin}~${def.humidityMax}%<br/>
        물주기 ${def.waterIntervalDays}일마다</span>
    </button>`;
}

function openPlantSelectSheet(pot) {
  const inv = loadInventory();
  const ownedSeeds = Object.values(PLANT_CATALOG).filter((def) => (inv.seedPots[def.id] || 0) > 0);
  sheetBody.dataset.kind = "plant-select";

  if (ownedSeeds.length === 0) {
    sheetBody.innerHTML = `
      <h3>씨앗 화분이 없어요</h3>
      <p>상점에서 씨앗이 담긴 화분을 구매하면 이 화분에 심을 수 있어요.</p>
      <button class="sheet-btn" id="btnGoShop">🛍️ 상점으로 가기</button>
      <button class="sheet-btn ghost-btn" id="sheetClose">나중에 할게요</button>
      <button class="sheet-btn text-danger" id="btnRemovePot">🗑️ 화분 제거</button>`;
    sheetBackdrop.classList.add("show");
    document.getElementById("sheetClose").addEventListener("click", closeSheet);
    document.getElementById("btnGoShop").addEventListener("click", () => { closeSheet(); openShop(); renderShopCategory("seeds"); });
    document.getElementById("btnRemovePot").addEventListener("click", () => openRemovePotConfirm(pot));
    return;
  }

  sheetBody.innerHTML = `
    <h3>어떤 씨앗 화분을 심을까요?</h3>
    <p style="margin:-4px 0 4px; font-size:12.5px; color:var(--ink-faint);">보유한 씨앗 화분만 심을 수 있어요.</p>
    <div class="plant-grid">${ownedSeeds.map((def) => plantCardHtml(def, inv.seedPots[def.id])).join("")}</div>
    <button class="sheet-btn ghost-btn" id="sheetClose">나중에 할게요</button>
    <button class="sheet-btn text-danger" id="btnRemovePot">🗑️ 화분 제거</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("btnRemovePot").addEventListener("click", () => openRemovePotConfirm(pot));
  sheetBody.querySelectorAll(".plant-card").forEach((btn) => {
    btn.addEventListener("click", () => plantSeed(pot, btn.dataset.plant));
  });
}

/* ---------------------------------------------------------
   7-1. 화분 제거
   빈 화분/식물이 자라고 있는 화분 모두 제거할 수 있습니다.
   실수로 지우는 것을 막기 위해 한 번 더 확인하는 시트를 보여줍니다.
   --------------------------------------------------------- */
function openRemovePotConfirm(pot) {
  const planted = !!pot.plantId;
  const def = planted ? getPlantDef(pot.plantId) : null;
  sheetBody.dataset.kind = "remove-confirm";
  sheetBody.innerHTML = `
    <h3>🗑️ 화분을 치울까요?</h3>
    <p style="font-size:13px; color:var(--ink-faint);">
      ${planted ? `${pot.name || def.name}${def ? ` ${def.icon}` : ""}의 성장 정보가 함께 사라지고, 되돌릴 수 없어요.` : "빈 화분이 카페에서 치워져요."}
    </p>
    <button class="sheet-btn danger" id="btnConfirmRemove">🗑️ 네, 치울게요</button>
    <button class="sheet-btn ghost-btn" id="btnCancelRemove">취소</button>`;
  sheetBackdrop.classList.add("show");
  document.getElementById("btnConfirmRemove").addEventListener("click", () => removePot(pot));
  document.getElementById("btnCancelRemove").addEventListener("click", () => openPotSheet(pot));
}

function removePot(pot) {
  pots = pots.filter((p) => p.id !== pot.id);
  savePots(pots);
  renderPots();
  closeSheet();
  if (potZoomOverlay.dataset.potId === pot.id) closePotZoom();
  showToast("화분을 치웠어요");
}
function closeSheet() { sheetBackdrop.classList.remove("show"); }
sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === sheetBackdrop) closeSheet();
});

/* ---------------------------------------------------------
   8. 하단 탭 (홈 이외는 자리표시자)
   --------------------------------------------------------- */
document.getElementById("btnFocusCta").addEventListener("click", openFocusOverlay);

document.querySelectorAll(".dock-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "home") return;
    if (tab === "focus") { openFocusOverlay(); return; }
    if (tab === "shop") { openShop(); return; }
    if (tab === "dex") { openDex(); return; }
    if (tab === "stats") { openStats(); return; }
    if (tab === "addpot") return;
    document.querySelectorAll(".dock-item").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    showToast("이 메뉴는 다음 단계에서 만나요 ☕️");
    setTimeout(() => {
      btn.classList.remove("is-active");
      document.querySelector('.dock-item[data-tab="home"]').classList.add("is-active");
    }, 900);
  });
});

/* ---------------------------------------------------------
   9. 토스트 유틸
   --------------------------------------------------------- */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
}

/* ---------------------------------------------------------
   10. 초기 렌더 + 서비스워커 등록(가능한 경우)
   --------------------------------------------------------- */
renderPots();
setInterval(() => { renderPots(); }, 5 * 60 * 1000); // 5분마다 물/건강 상태 갱신

// 모바일 ↔ 데스크톱 너비 경계를 넘나들 때(창 크기 조절, 기기 회전 등) 선반 높이를 다시 계산합니다.
if (window.matchMedia) {
  const mobileBreakpointMql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  const handleBreakpointChange = () => renderPots();
  if (mobileBreakpointMql.addEventListener) {
    mobileBreakpointMql.addEventListener("change", handleBreakpointChange);
  } else if (mobileBreakpointMql.addListener) {
    mobileBreakpointMql.addListener(handleBreakpointChange); // 구형 Safari 호환
  }
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
