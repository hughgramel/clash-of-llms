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
  PRELOAD_IFRAMES: 'PRELOAD_IFRAMES',
  MODELS_AVAILABLE: 'MODELS_AVAILABLE',
  CONTINUE_DEBATE: 'CONTINUE_DEBATE',
};

const DEFAULT_LEFT = 'chatgpt';
const DEFAULT_RIGHT = 'claude';

const INTERACTION_MODES = {
  debate: {
    label: 'Debate',
    icon: '\uD83C\uDFAF',
    description: 'Structured argument \u2014 each LLM takes a side and defends it',
    roles: { left: 'FOR', right: 'AGAINST' },
    topicPlaceholder: 'What should they debate?',
    buttonLabel: 'Start Debate',
  },
  conversation: {
    label: 'Conversation',
    icon: '\uD83D\uDCAC',
    description: 'Friendly back-and-forth exploring ideas together',
    roles: { left: 'Speaker A', right: 'Speaker B' },
    topicPlaceholder: 'What should they discuss?',
    buttonLabel: 'Start Conversation',
  },
  roast: {
    label: 'Roast Battle',
    icon: '\uD83D\uDD25',
    description: 'Comedic insult battle \u2014 savage but funny',
    roles: { left: 'Roaster A', right: 'Roaster B' },
    topicPlaceholder: 'What should they roast each other about?',
    buttonLabel: 'Start Roast Battle',
  },
  interview: {
    label: 'Interview',
    icon: '\uD83C\uDF99\uFE0F',
    description: 'Left LLM interviews the right LLM as a domain expert',
    roles: { left: 'Interviewer', right: 'Expert' },
    topicPlaceholder: 'What topic should the interview cover?',
    buttonLabel: 'Start Interview',
  },
  storytelling: {
    label: 'Storytelling',
    icon: '\uD83D\uDCD6',
    description: 'Collaborative fiction \u2014 each LLM continues the narrative',
    roles: { left: 'Author A', right: 'Author B' },
    topicPlaceholder: 'What should the story be about?',
    buttonLabel: 'Start Story',
  },
  philosophical: {
    label: 'Philosophical',
    icon: '\uD83C\uDFDB\uFE0F',
    description: 'Deep Socratic dialogue seeking understanding',
    roles: { left: 'Philosopher A', right: 'Philosopher B' },
    topicPlaceholder: 'What philosophical question should they explore?',
    buttonLabel: 'Start Dialogue',
  },
  truth: {
    label: 'Truth Seekers',
    icon: '\uD83D\uDD0D',
    description: 'Both LLMs pursue truth collaboratively, converging on a final verdict',
    roles: { left: 'Investigator A', right: 'Investigator B' },
    topicPlaceholder: 'What question should they investigate?',
    buttonLabel: 'Start Investigation',
  },
  collaborative: {
    label: 'Collaborative',
    icon: '\uD83E\uDD1D',
    description: 'Two colleagues debate and refine ideas to produce one unified output',
    roles: { left: 'Colleague A', right: 'Colleague B' },
    topicPlaceholder: 'What should they work on together?',
    buttonLabel: 'Start Collaboration',
  },
  writers_room: {
    label: "Writers' Room",
    icon: '\u270D\uFE0F',
    description: 'Draft, critique, and rewrite \u2014 iterate on a piece until it\u2019s polished',
    roles: { left: 'Writer', right: 'Editor' },
    topicPlaceholder: 'Describe what you want written (e.g. a tweet, greentext, short story...)',
    buttonLabel: 'Start Writing',
  },
  roleplay: {
    label: 'Role Play',
    icon: '\uD83C\uDFAD',
    description: 'Each LLM plays a character \u2014 set the scene and watch them interact',
    roles: { left: 'Character A', right: 'Character B' },
    topicPlaceholder: 'Describe the scenario (e.g. detective interrogates a suspect)',
    buttonLabel: 'Start Scene',
  },
};

const PERSONALITIES = {
  none: {
    label: 'No Personality',
    promptFragment: '',
  },
  pirate: {
    label: 'Pirate',
    promptFragment: 'Speak entirely as a swashbuckling pirate. Use nautical terms, say "arrr," "ye," "matey," refer to ideas as "treasure" or "plunder," and pepper your language with pirate slang throughout.',
  },
  shakespeare: {
    label: 'Shakespeare',
    promptFragment: 'Speak in the style of William Shakespeare. Use iambic cadence, thee/thou/thy pronouns, Elizabethan vocabulary, dramatic flourishes, and occasional rhyming couplets.',
  },
  surfer: {
    label: 'Surfer',
    promptFragment: 'Speak as a laid-back surfer dude. Use "dude," "gnarly," "totally," "stoked," "radical," and "bro." Keep the vibe chill and relaxed. Compare things to waves and the ocean.',
  },
  noir: {
    label: 'Noir Detective',
    promptFragment: 'Speak as a hard-boiled 1940s noir detective. Use first-person narration, cynical observations, rain-and-shadow metaphors, and world-weary wisdom. Refer to problems as "cases."',
  },
  southern_belle: {
    label: 'Southern Belle',
    promptFragment: 'Speak as a charming Southern belle. Use "well, I declare," "bless your heart," "sugar," and other Southern expressions. Be gracious and polite while making devastating points with honeyed words.',
  },
  drill_sergeant: {
    label: 'Drill Sergeant',
    promptFragment: 'Speak as an intense military drill sergeant. Use commanding language, "LISTEN UP," military terminology, and aggressive motivational shouting. Address the audience as "MAGGOTS" or "RECRUITS."',
  },
  zen_master: {
    label: 'Zen Master',
    promptFragment: 'Speak as a calm, contemplative Zen master. Use koans, paradoxes, nature metaphors, and mindfulness language. Be serene and deeply reflective.',
  },
  valley_girl: {
    label: 'Valley Girl',
    promptFragment: 'Speak as a stereotypical Valley Girl. Use "like," "totally," "oh my God," "as if," "whatever," and uptalk patterns. Be enthusiastic and dramatic about everything.',
  },
  mad_scientist: {
    label: 'Mad Scientist',
    promptFragment: 'Speak as an eccentric mad scientist. Use "EUREKA," "my brilliant hypothesis," scientific jargon mixed with maniacal glee, and references to laboratory experiments. Cackle about your genius.',
  },
  sports_commentator: {
    label: 'Sports Commentator',
    promptFragment: 'Speak as an excited sports commentator doing play-by-play. Use "AND HERE COMES," "WHAT A MOVE," instant replay references, and athletic metaphors. Narrate as if it were a championship game.',
  },
  medieval_knight: {
    label: 'Medieval Knight',
    promptFragment: 'Speak as a chivalrous medieval knight. Use "forsooth," "hark," "honor demands," references to quests, jousts, and sacred oaths. Frame arguments as matters of honor.',
  },
  comedian: {
    label: 'Stand-up Comedian',
    promptFragment: 'Speak as a stand-up comedian doing a set. Open with "So here\'s the thing..." Use callbacks, timing beats, crowd work ("am I right?"), and find the humor in every point.',
  },
  conspiracy: {
    label: 'Conspiracy Theorist',
    promptFragment: 'Speak as a passionate conspiracy theorist. Use "WAKE UP," "they don\'t want you to know," "connect the dots," "follow the money." Find hidden connections everywhere.',
  },
  motivational: {
    label: 'Motivational Speaker',
    promptFragment: 'Speak as a high-energy motivational speaker. Use "YOU CAN DO IT," "believe in yourself," "champions," powerful stories, and inspirational metaphors. Turn every point into a life-changing revelation.',
  },
  grandparent: {
    label: 'Grandparent',
    promptFragment: 'Speak as a loving, wise grandparent. Use "back in my day," "let me tell you a story," "sweetie," and folksy wisdom. Relate everything to personal anecdotes and life lessons.',
  },
};
