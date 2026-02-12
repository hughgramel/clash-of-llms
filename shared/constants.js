const LLM_CONFIG = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    color: '#10a37f',
    icon: 'GPT',
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai/new',
    color: '#d97706',
    icon: 'C',
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.com/',
    color: '#1d9bf0',
    icon: 'G',
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    color: '#4285f4',
    icon: 'G',
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    color: '#20b2aa',
    icon: 'P',
  },
};

const MSG = {
  START_DEBATE: 'START_DEBATE',
  STOP_DEBATE: 'STOP_DEBATE',
  GET_STATUS: 'GET_STATUS',
  PING: 'PING',
  IS_READY: 'IS_READY',
  SEND_MESSAGE: 'SEND_MESSAGE',
  GET_LATEST_RESPONSE: 'GET_LATEST_RESPONSE',
  IS_STREAMING: 'IS_STREAMING',
  WAIT_FOR_RESPONSE: 'WAIT_FOR_RESPONSE',
  DEBATE_UPDATE: 'DEBATE_UPDATE',
  DEBATE_COMPLETE: 'DEBATE_COMPLETE',
  DEBATE_ERROR: 'DEBATE_ERROR',
  GET_AVAILABLE_MODELS: 'GET_AVAILABLE_MODELS',
  SELECT_MODEL: 'SELECT_MODEL',
  MODELS_AVAILABLE: 'MODELS_AVAILABLE',
  PRELOAD_IFRAMES: 'PRELOAD_IFRAMES',
};

const DEFAULT_LEFT = 'chatgpt';
const DEFAULT_RIGHT = 'claude';
