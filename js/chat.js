/**
 * Asistente conversacional opcional.
 *
 * Consume POST /v1/chat con SSE usando fetch + ReadableStream. Muestra solo la
 * respuesta en lenguaje natural y una línea de confianza al final. Si el
 * asistente no está corriendo, el error queda contenido en este popup.
 */

import {
  ASSISTANT_BASE_URL,
  CHAT_LOCATION_RADIUS_KM,
} from './config.js';
import {
  loadChatAnchors,
  loadUserId,
  saveChatAnchor,
} from './storage.js';

const TOOL_LABELS = {
  get_current_weather: 'Consultando el clima actual…',
  get_forecast: 'Consultando el pronóstico…',
  get_umbrella_advice: 'Evaluando si necesitás paraguas…',
  get_clothing_advice: 'Evaluando qué ropa llevar…',
  get_watering_advice: 'Evaluando si conviene regar…',
  get_activity_advice: 'Evaluando la actividad…',
  find_best_day: 'Buscando el mejor día…',
};

const CONFIDENCE_LABELS = {
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

const CONFIDENCE_RANK = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Cantidad máxima de mensajes que se guardan por conversación. */
const MAX_CHAT_MESSAGES = 40;

/** Radio para reconocer que un clic volvió a una conversación guardada. */
const ANCHOR_MATCH_KM = 0.5;

/** @type {object | null} Última ubicación elegida en el mapa o buscador. */
let currentLocation = null;

/** @type {object | null} Ubicación donde empezó la conversación actual. */
let conversationLocation = null;

/** @type {string | null} Sesión devuelta por el backend. */
let sessionId = null;

/** @type {string | null} Identificador anónimo del navegador. */
let userId = null;

/** @type {Array<{ role: 'user' | 'assistant', text: string, confidence?: string }>} */
let conversationMessages = [];

/** @type {number} Identificador del último envío para descartar respuestas viejas. */
let requestId = 0;

/** @type {boolean} Evita enviar dos mensajes al mismo tiempo. */
let isStreaming = false;

/** @type {AbortController | null} Permite cancelar el stream activo. */
let activeController = null;

/** @type {object | null} Elementos del DOM del chat. */
let elements = null;

/** @type {((panel: HTMLElement) => boolean) | null} Abre el popup en el mapa. */
let openPopup = null;

/** @type {(() => void) | null} Avisa que cambiaron los puntos guardados. */
let onAnchorsChanged = null;

/**
 * Inicializa el formulario y el botón que abre la ventana emergente.
 *
 * @param {{ openPopup?: (panel: HTMLElement) => boolean, onAnchorsChanged?: () => void }} [options]
 */
export function initChat({
  openPopup: openPopupCallback,
  onAnchorsChanged: anchorsChangedCallback,
} = {}) {
  openPopup = openPopupCallback ?? null;
  onAnchorsChanged = anchorsChangedCallback ?? null;
  userId = loadUserId();
  elements = {
    panel: document.querySelector('#chat-panel'),
    open: document.querySelector('#chat-open'),
    form: document.querySelector('#chat-form'),
    input: document.querySelector('#chat-input'),
    send: document.querySelector('#chat-send'),
    messages: document.querySelector('#chat-messages'),
    status: document.querySelector('#chat-status'),
    location: document.querySelector('#chat-location'),
  };

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = elements.input.value.trim();
    if (text) {
      sendMessage(text);
    }
  });

  elements.open.addEventListener('click', openChatWindow);
  updateLocationLabel();
  elements.open.hidden = !currentLocation;
}

/**
 * Actualiza la ubicación activa y decide si la conversación sigue vigente.
 *
 * @param {{ lat: number, lon: number, label?: string | null } | null} location
 */
export function setChatLocation(location) {
  if (!location) {
    currentLocation = null;
    if (elements) {
      updateLocationLabel();
      elements.open.hidden = true;
    }
    return;
  }

  let wasReset = false;
  if (
    sessionId &&
    conversationLocation &&
    distanceKm(conversationLocation, location) > CHAT_LOCATION_RADIUS_KM
  ) {
    rememberAnchor();
    resetConversation();
    wasReset = true;
  }

  const savedAnchor = findAnchorForLocation(location);
  if (savedAnchor && savedAnchor.session_id !== sessionId) {
    resumeConversation(savedAnchor);
    currentLocation = {
      ...location,
      label: location.label ?? savedAnchor.label ?? null,
    };
    if (elements) {
      updateLocationLabel();
      elements.open.hidden = false;
    }
    return;
  }

  currentLocation = location;
  if (
    sessionId &&
    conversationLocation &&
    !conversationLocation.label &&
    location.label &&
    distanceKm(conversationLocation, location) <= CHAT_LOCATION_RADIUS_KM
  ) {
    conversationLocation = { ...conversationLocation, label: location.label };
    rememberAnchor();
  }

  if (elements) {
    updateLocationLabel();
    elements.open.hidden = false;
    if (wasReset) {
      showStatus(
        'Nueva ubicación: la conversación anterior quedó guardada en el mapa.',
      );
    }
  }
}

/**
 * Retoma una conversación marcada en el mapa.
 *
 * @param {{ session_id: string, lat: number, lon: number, label?: string | null }} anchor
 */
export function resumeConversation(anchor) {
  rememberAnchor();
  cancelActiveStream();
  sessionId = anchor.session_id;
  currentLocation = {
    lat: anchor.lat,
    lon: anchor.lon,
    label: anchor.label ?? null,
  };
  conversationLocation = { ...currentLocation };
  conversationMessages = normalizeMessages(anchor.messages);

  if (elements) {
    elements.messages.replaceChildren();
    renderConversationMessages();
    elements.open.hidden = false;
    updateLocationLabel();
    showStatus('Conversación retomada. Podés seguir preguntando.');
  }
}

/**
 * Abre el panel del chat como popup anclado al marcador.
 */
export function openChatWindow() {
  if (!elements || !currentLocation || !openPopup) {
    return;
  }

  elements.panel.hidden = false;
  if (!openPopup(elements.panel)) {
    elements.panel.hidden = true;
    return;
  }
  elements.input.focus();
}

/**
 * Envía un mensaje al asistente y procesa el stream SSE.
 *
 * @param {string} text
 */
async function sendMessage(text) {
  if (!elements || isStreaming) {
    return;
  }

  const message = text.trim();
  if (!message) {
    return;
  }

  if (!currentLocation) {
    showStatus('Primero elegí una ubicación en el mapa o buscá una ciudad.', true);
    return;
  }

  if (!conversationLocation) {
    conversationLocation = { ...currentLocation };
  }

  const myRequest = ++requestId;
  isStreaming = true;
  setBusy(true);
  showStatus('Pensando…');

  conversationMessages.push({ role: 'user', text: message });
  appendMessage('user', message);
  elements.input.value = '';
  const assistant = appendAssistantMessage();

  let rawText = '';
  let hasContent = false;
  let confidence = null;
  let adviceKind = null;
  let completed = false;
  let succeeded = false;

  try {
    const controller = new AbortController();
    activeController = controller;
    const response = await postChat(
      {
        message,
        location: {
          lat: currentLocation.lat,
          lon: currentLocation.lon,
          ...(currentLocation.label ? { label: currentLocation.label } : {}),
        },
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(userId ? { user_id: userId } : {}),
      },
      controller.signal,
    );

    if (!response.ok) {
      throw new ChatError(await readErrorDetail(response), response.status);
    }
    if (!response.body) {
      throw new ChatError('El asistente no devolvió un stream válido.', 0);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (myRequest !== requestId) {
        await reader.cancel();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) {
          continue;
        }

        const result = handleEvent(parsed.event, parsed.data, {
          textEl: assistant.text,
          appendText: (fragment) => {
            rawText += fragment;
            renderRichText(assistant.text, rawText);
          },
          markContent: () => {
            hasContent = true;
          },
          addConfidence: (value) => {
            confidence = mergeConfidence(confidence, value);
          },
          setAdviceKind: (value) => {
            adviceKind = value;
          },
          saveAnchor: rememberAnchor,
        });

        if (result === 'done') {
          completed = true;
          succeeded = true;
          await reader.cancel();
          break;
        }
        if (result === 'error') {
          completed = true;
          await reader.cancel();
          break;
        }
      }

      if (completed || myRequest !== requestId) {
        break;
      }
    }

    if (myRequest === requestId && !completed) {
      showStatus('La respuesta se cortó antes de terminar.', true);
    }
    if (myRequest === requestId && !hasContent) {
      assistant.message.remove();
    } else if (myRequest === requestId && succeeded) {
      const finalText = rawText.trim();
      if (finalText) {
        conversationMessages.push({
          role: 'assistant',
          text: finalText,
          ...(confidence ? { confidence } : {}),
        });
        rememberAnchor();
      }
      if (confidence) {
        appendConfidence(assistant, confidence);
      }
      if (adviceKind === 'clothing') {
        appendFeedbackControls(assistant);
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    if (!hasContent) {
      assistant.message.remove();
    }
    showStatus(messageForError(error), true);
  } finally {
    if (myRequest === requestId) {
      isStreaming = false;
      activeController = null;
      setBusy(false);
      if (elements.status.dataset.state !== 'error') {
        hideStatus();
      }
    }
  }
}

/**
 * Hace el POST; si la sesión venció, reintenta una vez con una sesión nueva.
 *
 * @param {object} payload
 * @param {AbortSignal} signal
 * @returns {Promise<Response>}
 */
async function postChat(payload, signal) {
  let response = await fetch(`${ASSISTANT_BASE_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (response.status === 404 && payload.session_id) {
    sessionId = null;
    response = await fetch(`${ASSISTANT_BASE_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, session_id: undefined }),
      signal,
    });
  }

  return response;
}

/**
 * Procesa un evento SSE.
 *
 * @param {string} event
 * @param {object} data
 * @param {object} state
 * @returns {'done' | 'error' | null}
 */
function handleEvent(event, data, state) {
  if (event === 'session') {
    if (data.session_id) {
      sessionId = data.session_id;
      state.saveAnchor();
    }
    return null;
  }

  if (event === 'tool_call') {
    showStatus(TOOL_LABELS[data.name] ?? 'Consultando datos…');
    return null;
  }

  if (event === 'advice') {
    state.addConfidence(confidenceFromAdvice(data));
    state.setAdviceKind(data.kind);
    return null;
  }

  if (event === 'token') {
    const fragment = data.text ?? '';
    if (fragment) {
      state.textEl.hidden = false;
      state.appendText(fragment);
      state.markContent();
      hideStatus();
      scrollMessages();
    }
    return null;
  }

  if (event === 'done') {
    if (data.session_id) {
      sessionId = data.session_id;
    }
    hideStatus();
    return 'done';
  }

  if (event === 'error') {
    showStatus(data.detail ?? 'El asistente devolvió un error.', true);
    return 'error';
  }

  return null;
}

/**
 * Guarda el punto de la conversación actual en localStorage.
 */
function rememberAnchor() {
  const location = conversationLocation ?? currentLocation;
  if (!sessionId || !location) {
    return;
  }

  saveChatAnchor({
    session_id: sessionId,
    lat: location.lat,
    lon: location.lon,
    label: location.label ?? null,
    messages: conversationMessages.slice(-MAX_CHAT_MESSAGES),
    updated_at: new Date().toISOString(),
  });
  onAnchorsChanged?.();
}

/**
 * Busca una conversación guardada en la misma zona.
 *
 * @param {{ lat: number, lon: number }} location
 * @returns {object | null}
 */
function findAnchorForLocation(location) {
  return (
    loadChatAnchors().find(
      (anchor) => distanceKm(anchor, location) <= ANCHOR_MATCH_KM,
    ) ?? null
  );
}

/**
 * Normaliza los mensajes guardados antes de restaurarlos.
 *
 * @param {unknown} messages
 * @returns {Array<{ role: 'user' | 'assistant', text: string, confidence?: string }>}
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message?.text === 'string' &&
        message.text.trim(),
    )
    .slice(-MAX_CHAT_MESSAGES)
    .map((message) => ({
      role: message.role,
      text: message.text,
      ...(message.confidence ? { confidence: message.confidence } : {}),
    }));
}

/**
 * Vuelve a dibujar los mensajes de una conversación restaurada.
 */
function renderConversationMessages() {
  for (const message of conversationMessages) {
    if (message.role === 'user') {
      appendMessage('user', message.text);
      continue;
    }

    const assistant = appendAssistantMessage();
    assistant.text.hidden = false;
    renderRichText(assistant.text, message.text);
    if (message.confidence) {
      appendConfidence(assistant, message.confidence);
    }
  }
  scrollMessages();
}

/**
 * Parsea un bloque SSE completo.
 *
 * @param {string} block
 * @returns {{ event: string, data: object } | null}
 */
function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

/**
 * Renderiza negritas simples (**texto**) sin inyectar HTML del servidor.
 *
 * @param {HTMLElement} element
 * @param {string} text
 */
function renderRichText(element, text) {
  element.replaceChildren();
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      element.append(strong);
    } else if (part) {
      element.append(document.createTextNode(part));
    }
  }
}

/**
 * Crea y agrega una burbuja de mensaje.
 *
 * @param {'user' | 'assistant'} role
 * @param {string} text
 */
function appendMessage(role, text) {
  const message = document.createElement('div');
  message.className = `chat__message chat__message--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat__bubble';
  bubble.textContent = text;

  message.append(bubble);
  elements.messages.append(message);
  scrollMessages();
}

/**
 * Crea la burbuja vacía del asistente.
 *
 * @returns {{ message: HTMLElement, text: HTMLElement }}
 */
function appendAssistantMessage() {
  const message = document.createElement('div');
  message.className = 'chat__message chat__message--assistant';

  const bubble = document.createElement('div');
  bubble.className = 'chat__bubble';

  const text = document.createElement('p');
  text.className = 'chat__text';
  text.hidden = true;

  bubble.append(text);
  message.append(bubble);
  elements.messages.append(message);
  scrollMessages();

  return { message, text };
}

/**
 * Agrega la línea de confianza al final del mensaje.
 *
 * @param {{ message: HTMLElement }} assistant
 * @param {'high' | 'medium' | 'low'} confidence
 */
function appendConfidence(assistant, confidence) {
  const label = CONFIDENCE_LABELS[confidence];
  if (!label) {
    return;
  }

  const line = document.createElement('p');
  line.className = 'chat__confidence';
  line.textContent = `Confianza: ${label}`;
  assistant.message.append(line);
  scrollMessages();
}

/**
 * Agrega los botones de feedback después de un consejo de ropa.
 *
 * @param {{ message: HTMLElement }} assistant
 */
function appendFeedbackControls(assistant) {
  if (!userId) {
    return;
  }

  const container = document.createElement('div');
  container.className = 'chat__feedback';

  const label = document.createElement('span');
  label.className = 'chat__feedback-label';
  label.textContent = '¿Cómo te sentiste con esta recomendación?';

  const options = [
    ['cold', 'Tuve frío'],
    ['just_right', 'Estuve justo'],
    ['hot', 'Tuve calor'],
  ];

  const buttons = options.map(([value, text]) => {
    const button = document.createElement('button');
    button.className = 'chat__feedback-button';
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', () => {
      sendFeedback(value, container, buttons);
    });
    return button;
  });

  container.append(label, ...buttons);
  assistant.message.append(container);
  scrollMessages();
}

/**
 * Envía el feedback de comodidad al backend.
 *
 * @param {string} feedback
 * @param {HTMLElement} container
 * @param {HTMLButtonElement[]} buttons
 */
async function sendFeedback(feedback, container, buttons) {
  for (const button of buttons) {
    button.disabled = true;
  }

  try {
    const response = await fetch(`${ASSISTANT_BASE_URL}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        feedback,
      }),
    });

    if (!response.ok) {
      throw new Error('feedback');
    }

    const saved = document.createElement('p');
    saved.className = 'chat__feedback-done';
    saved.textContent = 'Preferencia guardada.';
    container.replaceChildren(saved);
  } catch {
    for (const button of buttons) {
      button.disabled = false;
    }
    const error = document.createElement('span');
    error.className = 'chat__feedback-error';
    error.textContent = 'No se pudo guardar el feedback.';
    container.append(error);
  }
}

/**
 * Extrae una confianza del evento advice, si existe.
 *
 * @param {object} data
 * @returns {'high' | 'medium' | 'low' | null}
 */
function confidenceFromAdvice(data) {
  if (data?.confidence) {
    return data.confidence;
  }

  if (data?.kind === 'best_day') {
    return data.ranking?.[0]?.confidence ?? null;
  }

  if (data?.kind === 'watering') {
    return 'high';
  }

  if (data?.kind === 'umbrella' || data?.kind === 'clothing') {
    return confidenceForDate(data.target_date);
  }

  return null;
}

/**
 * Calcula una confianza aproximada según el horizonte de la fecha.
 *
 * @param {string | undefined} isoDate
 * @returns {'high' | 'medium' | 'low' | null}
 */
function confidenceForDate(isoDate) {
  if (!isoDate) {
    return null;
  }

  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 86400000);

  if (days <= 2) {
    return 'high';
  }
  if (days <= 6) {
    return 'medium';
  }
  return 'low';
}

/**
 * Combina dos niveles de confianza y devuelve el más conservador.
 *
 * @param {'high' | 'medium' | 'low' | null} current
 * @param {'high' | 'medium' | 'low' | null} next
 * @returns {'high' | 'medium' | 'low' | null}
 */
function mergeConfidence(current, next) {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return CONFIDENCE_RANK[next] < CONFIDENCE_RANK[current] ? next : current;
}

/**
 * Distancia aproximada entre dos coordenadas usando la fórmula de Haversine.
 *
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @returns {number} Kilómetros.
 */
function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

/**
 * Actualiza el texto de la ubicación del chat.
 */
function updateLocationLabel() {
  if (!elements) {
    return;
  }
  if (!currentLocation) {
    elements.location.textContent = 'Sin ubicación seleccionada.';
    return;
  }
  const label =
    currentLocation.label ??
    `${currentLocation.lat.toFixed(4)}, ${currentLocation.lon.toFixed(4)}`;
  elements.location.textContent = `Ubicación: ${label}`;
}

/**
 * Habilita o deshabilita los controles mientras se espera una respuesta.
 *
 * @param {boolean} busy
 */
function setBusy(busy) {
  elements.input.disabled = busy;
  elements.send.disabled = busy;
}

/**
 * Cancela el stream activo y descarta sus actualizaciones.
 */
function cancelActiveStream() {
  requestId += 1;
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  isStreaming = false;
  if (elements) {
    setBusy(false);
  }
}

/**
 * Limpia la conversación actual sin borrar los puntos guardados.
 */
function resetConversation() {
  cancelActiveStream();
  sessionId = null;
  conversationLocation = null;
  conversationMessages = [];
  if (elements) {
    elements.messages.replaceChildren();
    hideStatus();
  }
}

/**
 * Muestra un estado debajo de los mensajes.
 *
 * @param {string} text
 * @param {boolean} [isError]
 */
function showStatus(text, isError = false) {
  elements.status.hidden = false;
  elements.status.textContent = text;
  elements.status.classList.toggle('chat__status--error', isError);
  elements.status.dataset.state = isError ? 'error' : 'info';
  scrollMessages();
}

/**
 * Oculta el estado.
 */
function hideStatus() {
  elements.status.hidden = true;
  elements.status.textContent = '';
  elements.status.classList.remove('chat__status--error');
  elements.status.dataset.state = '';
}

/**
 * Lleva el scroll al final de la conversación.
 */
function scrollMessages() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

/**
 * Lee el detalle de error del cuerpo JSON.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readErrorDetail(response) {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') {
      return body.detail;
    }
  } catch {
    // El cuerpo no era JSON: se usa el mensaje genérico.
  }
  return `El asistente respondió con error ${response.status}.`;
}

/**
 * Traduce un error a un mensaje mostrable.
 *
 * @param {unknown} error
 * @returns {string}
 */
function messageForError(error) {
  if (error instanceof ChatError) {
    if (error.status === 429) {
      return 'Demasiadas solicitudes. Esperá un minuto y probá de nuevo.';
    }
    if (error.status === 503) {
      return 'El asistente no tiene el LLM configurado.';
    }
    return error.message;
  }
  return 'No se pudo conectar con el asistente. El dashboard sigue funcionando sin él.';
}

/** Error con código HTTP opcional. */
class ChatError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
  }
}
