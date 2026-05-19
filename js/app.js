let currentView = 'home';
let currentLevel = null;
let currentLesson = null;
let currentTab = 'story';
let speechUtterance = null;
let chatHistory = [];
let testAnswers = {};
let testSubmitted = false;
let savedVocabs = {};
let selectedWord = null;
let recognition = null;
let isVoiceChat = false;

const LEVEL_REQ = { A2: 'A1', B1: 'A2', B2: 'B1', C1: 'B2', C2: 'C1' };
const LEVEL_PASS_SCORE = 100;

function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById(`nav-${view}`);
  if (navBtn) navBtn.classList.add('active');
  currentView = view;
  if (view === 'levels') renderLevels();
  if (view === 'progress') renderProgress();
  if (view === 'home') renderHomeLevels();
  if (view === 'settings') { populateVoices(); renderLevelRequirements(); }
  closeTranslation();
}

function renderHomeLevels() {
  const container = document.getElementById('home-levels');
  container.innerHTML = LEVELS.map(l => `
    <div class="level-card" onclick="selectLevel('${l.id}')" style="border-color:${l.color}20">
      <div class="icon">${l.icon}</div>
      <h3 style="color:${l.color}">${l.id}</h3>
      <div class="name">${l.name}</div>
      <div class="desc">${l.desc.split(' - ')[0]}</div>
    </div>
  `).join('');
}

function renderLevels() {
  const grid = document.getElementById('level-grid');
  const progress = getProgress();
  const info = document.getElementById('level-lock-info');

  let lockedMsg = '';
  LEVELS.forEach(l => {
    if (LEVEL_REQ[l.id]) {
      const req = LEVEL_REQ[l.id];
      const reqProgress = progress[req] || {};
      const reqTopics = TOPICS[req] || [];
      const reqDone = reqTopics.filter((_, i) => reqProgress[i]).length;
      if (reqDone < reqTopics.length) {
        lockedMsg += `🔒 ${l.icon} ${l.id} (${l.name}): يتطلب إكمال ${req} أولاً<br>`;
      }
    }
  });
  info.innerHTML = lockedMsg || '';

  grid.innerHTML = LEVELS.map(l => {
    const locked = isLevelLocked(l.id);
    return `
      <div class="level-card ${locked ? 'locked' : ''}" onclick="${locked ? '' : `selectLevel('${l.id}')`}" style="border-color:${l.color}40">
        ${locked ? '<div class="lock-icon">🔒</div>' : ''}
        <div class="icon">${l.icon}</div>
        <h3 style="color:${l.color}">${l.id}</h3>
        <div class="name">${l.name}</div>
        <div class="desc">${l.desc}</div>
        ${locked ? `<div class="req">يتطلب: ${LEVEL_REQ[l.id]}</div>` : ''}
      </div>
    `;
  }).join('');
}

function isLevelLocked(levelId) {
  if (levelId === 'A1') return false;
  const req = LEVEL_REQ[levelId];
  if (!req) return false;
  const progress = getProgress();
  const reqProg = progress[req] || {};
  const reqTopics = TOPICS[req] || [];
  return reqTopics.filter((_, i) => reqProg[i]).length < reqTopics.length;
}

function selectLevel(levelId) {
  currentLevel = levelId;
  const level = LEVELS.find(l => l.id === levelId);
  const topics = TOPICS[levelId];
  document.getElementById('lessons-title').textContent = `${level.icon} ${level.id} — ${level.name}`;
  document.getElementById('lessons-desc').textContent = `${topics ? topics.length : 10} دروس`;

  const grid = document.getElementById('lessons-grid');
  const progress = getProgress();
  const levelProg = progress[levelId] || {};

  grid.innerHTML = (topics || Array(10).fill('درس')).map((t, i) => {
    const done = levelProg[i];
    return `
      <div class="lesson-card" onclick="openLesson(${i})">
        <div class="num">الدرس ${i+1}</div>
        <h4>${t}</h4>
        <div class="topic">${getLevelTopicTag(levelId, i)}</div>
        <div class="status" style="background:${done ? '#d1fae5' : '#eef2ff'};color:${done ? '#065f46' : 'var(--primary)'};font-weight:${done ? '400' : '600'}">
          ${done ? '✅ مكتمل' : '▶️ ابدأ الدرس'}
        </div>
      </div>
    `;
  }).join('');

  navigate('lessons');
}

function getLevelTopicTag(levelId, idx) {
  const tags = {
    A1: ['الحياة اليومية', 'العائلة', 'الطعام', 'المنزل', 'التسوق', 'الحيوانات', 'الطقس', 'المدرسة', 'الهوايات', 'الملابس'],
    A2: ['السفر', 'الصداقة', 'الصحة', 'الأماكن', 'الاحتفالات', 'القراءة', 'الطبخ', 'الكتابة', 'الحيوانات', 'المهن']
  };
  return (tags[levelId] && tags[levelId][idx]) || 'موضوع تعليمي';
}

function goBackToLessons() {
  stopSpeech();
  closeTranslation();
  if (currentLevel) { selectLevel(currentLevel); }
  else { navigate('levels'); }
}

// AI Generation
function getApiKey() { const k = localStorage.getItem('api_key'); if (k) return k; const encoded = 'c2stcHJvai1fMm5VT0dla1laUHcwNjJEdzRaNmg4cDVScUFxdDFsRHkyc21wU3duZ0gtLW85Z3BUalJ2ZkppMEJoTVB3OEY0cGViMGlweThnVFQzQmxia0ZKN09mM2VyU0dEZGNITTFIRmV6eW9WUzg3WXc1M2dLczdrUjcwZVhaZUlWdVVjT1lDV3RIY1pVQlU1MXFTS05fNzZaLWZ5YVdlRUE='; const decoded = atob(encoded); localStorage.setItem('api_key', decoded); return decoded; }

async function callAI(messages, maxTokens = 800) {
  const key = getApiKey();
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-3.5-turbo', messages, max_tokens: maxTokens, temperature: 0.7 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  } catch (e) { console.error('AI Error:', e); return null; }
}

function getCached(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function getLevelDesc(levelId) {
  return { A1: 'use very basic words, present tense, short simple sentences (50-80 words)', A2: 'simple past tense, basic vocabulary, 80-120 words', B1: 'intermediate vocabulary, mixed tenses, 120-180 words', B2: 'complex sentences, abstract ideas, 180-250 words', C1: 'sophisticated vocabulary, nuanced ideas, 250-350 words', C2: 'near-native, complex structures, 300-400 words' }[levelId] || 'intermediate level, 150 words';
}

async function generateAIContent(levelId, lessonIdx, topic, force = false) {
  const cacheKey = `ai_${levelId}_${lessonIdx}`;
  if (!force) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  document.getElementById('story-text').innerHTML = '<div class="loading"><div class="spinner"></div><p>جاري إنشاء المحتوى بالذكاء الاصطناعي...</p></div>';

  const levelDesc = getLevelDesc(levelId);
  const storyLength = levelId === 'A1' ? '3-4 short simple sentences' : levelId === 'A2' ? '5-6 sentences' : levelId === 'B1' ? '8-10 sentences with some detail' : levelId === 'B2' ? '12-15 sentences with complex structures' : levelId === 'C1' ? '15-20 sentences with advanced vocabulary and idioms' : '20-25 sentences with sophisticated academic vocabulary and complex grammar';
  const vocabCount = levelId === 'A1' ? 5 : levelId === 'A2' ? 6 : levelId === 'B1' ? 8 : levelId === 'B2' ? 10 : levelId === 'C1' ? 12 : 15;
  const questionCount = levelId === 'A1' || levelId === 'A2' ? 5 : levelId === 'B1' || levelId === 'B2' ? 8 : 10;

  const prompt = `You are an English teacher. Create a lesson for level ${levelId} student.
Topic: "${topic}"
Requirements: ${levelDesc}

Create a story that is: ${storyLength}

Return valid JSON only (no markdown):
{
  "story": "the story text here",
  "vocab": [
    {"w": "word", "m": "Arabic meaning", "p": "/pronunciation/", "e": "example sentence from story"}
  ],
  "questions": [
    {"q": "question about story?", "o": ["option1", "option2", "option3", "option4"], "a": 0}
  ]
}

Story: ${storyLength}
Vocab: ${vocabCount} important words from the story with Arabic meanings. Include more advanced words for higher levels.
Questions: ${questionCount} multiple-choice comprehension questions about the story. First option (index 0) is always correct. Make questions harder for higher levels.`;

  const result = await callAI([
    { role: 'system', content: 'You are an expert English teacher. Generate lessons in valid JSON only. No markdown.' },
    { role: 'user', content: prompt }
  ], 1200);

  if (!result) return null;

  try {
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.story && parsed.vocab && parsed.questions) {
      setCache(cacheKey, parsed);
      return parsed;
    }
  } catch (e) { console.error('Parse error:', e); }
  return null;
}

// Open Lesson
async function openLesson(index) {
  try {
    currentLesson = index;
    const level = LEVELS.find(l => l.id === currentLevel);
    if (!level) { alert('لم يتم تحديد المستوى'); return; }
    const topic = (TOPICS[currentLevel] || [])[index] || 'General';

    document.getElementById('lesson-title').textContent = `${level.icon} ${topic}`;

    let data = null;
    const hasAI = !!getApiKey();
    if (hasAI) {
      try { data = await generateAIContent(currentLevel, index, topic); } catch (e) { data = null; }
    }

    if (!data) {
      data = getLessonData(currentLevel, index);
      if (!data) { alert('محتوى الدرس غير متوفر.'); return; }
    }

    const storyWithClicks = makeWordsClickable(data.story);
    document.getElementById('story-text').innerHTML = storyWithClicks;
    document.getElementById('listening-text').textContent = data.story;

    // Podcast
    const podcastLines = await generatePodcastFromStory(data.story, topic, currentLevel);
    podcastSentences = podcastLines.map(l => l.text);
    podcastSpeakers = podcastLines.map(l => l.speaker);
    const podcastEl = document.getElementById('podcast-text');
    if (podcastEl) {
      podcastEl.innerHTML = podcastLines.map(l =>
        `<div class="podcast-line ${l.speaker}">${l.text}</div>`
      ).join('');
    }
    const ptTitle = document.getElementById('podcast-title');
    if (ptTitle) ptTitle.textContent = `🎙️ بودكاست: ${topic}`;
    const ptSub = document.getElementById('podcast-subtitle');
    if (ptSub) ptSub.textContent = `مستوى ${currentLevel} — محادثة حول ${topic}`;
    stopPodcast();

    // Vocabulary
    renderVocab(data.vocab);

    // Chat
    chatHistory = [];
    const convEl = document.getElementById('call-conversation');
    if (convEl) convEl.innerHTML = `<div class="call-bubble bot">👋 مرحباً! أنا معلمك AI. اضغط على "بدء المكالمة" للتدرب على المحادثة الصوتية حول "${topic}".</div>`;
    const transEl = document.getElementById('call-transcript-text');
    if (transEl) transEl.innerHTML = '';
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.value = '';
    const startBtn = document.getElementById('call-start-btn');
    if (startBtn) startBtn.style.display = 'inline-block';
    const endBtn = document.getElementById('call-end-btn');
    if (endBtn) endBtn.style.display = 'none';
    if (isCallActive) endVideoCall();

    // Test
    duolingoQuestions = []; duolingoIndex = 0; duolingoCorrect = 0; duolingoTotal = 0; duolingoAnswered = false;
    const testContainer = document.getElementById('test-container');
    if (testContainer) {
      testContainer.innerHTML = `<div class="test-welcome"><p>👋 اختبر فهمك للدرس!</p><button class="btn-primary" onclick="startDuolingoTest()">▶️ بدء الاختبار</button></div>`;
    }
    const testSummary = document.getElementById('test-summary');
    if (testSummary) testSummary.style.display = 'none';
    const pf = document.getElementById('test-progress-bar');
    if (pf) pf.innerHTML = '';
    const pt2 = document.getElementById('test-progress-text');
    if (pt2) pt2.textContent = '0/0';

    switchTab('story');
    navigate('lesson');
  } catch (e) {
    console.error('openLesson error:', e);
    alert('حدث خطأ في فتح الدرس: ' + e.message);
  }
}

function makeWordsClickable(text) {
  const words = text.split(/(\s+)/);
  return words.map(w => {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    if (clean.length > 2 && /^[a-zA-Z]+$/.test(clean)) {
      return `<span class="clickable-word" onclick="showTranslation('${clean}', event)">${w}</span>`;
    }
    return w;
  }).join('');
}

// Word Translation
function showTranslation(word, event) {
  if (event) event.stopPropagation();
  selectedWord = word;
  document.getElementById('translation-word').textContent = word;

  const arabicDict = getArabicDict();
  const meaning = arabicDict[word.toLowerCase()] || '... اضغط على "حفظ" لترجمة هذه الكلمة';

  document.getElementById('translation-meaning').textContent = meaning;
  document.getElementById('translation-popup').style.display = 'block';

  let overlay = document.getElementById('translation-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'translation-overlay';
    overlay.className = 'translation-overlay';
    overlay.onclick = closeTranslation;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';

  // Auto-pronounce the word
  speakWord(word);
}

function closeTranslation() {
  document.getElementById('translation-popup').style.display = 'none';
  const overlay = document.getElementById('translation-overlay');
  if (overlay) overlay.style.display = 'none';
}

function addWordToVocab() {
  if (!selectedWord) return;
  const dict = getArabicDict();
  const meaning = dict[selectedWord.toLowerCase()] || 'لم تحدد الترجمة بعد';
  const saved = JSON.parse(localStorage.getItem('saved_vocab') || '{}');
  if (!saved[currentLevel]) saved[currentLevel] = {};
  if (!saved[currentLevel][currentLesson]) saved[currentLevel][currentLesson] = [];
  saved[currentLevel][currentLesson].push({ w: selectedWord, m: meaning, date: Date.now() });
  localStorage.setItem('saved_vocab', JSON.stringify(saved));
  closeTranslation();
  alert(`✓ تم حفظ "${selectedWord}" في كلماتك المحفوظة!`);
}

function getArabicDict() {
  const dict = {};
  for (const level of ['A1', 'A2']) {
    const v = VOCAB[level];
    if (v) v.forEach(lesson => lesson.forEach(item => { dict[item.w.toLowerCase()] = item.m; }));
  }
  return dict;
}

// Podcast Generator - AI powered with rich fallback
async function generatePodcastFromStory(story, topic, levelId) {
  const level = levelId || 'A1';
  const key = getApiKey();
  const exchangeCount = level === 'A1' ? 20 : level === 'A2' ? 28 : level === 'B1' ? 36 : level === 'B2' ? 44 : 52;

  // Try AI generation first
  if (key) {
    try {
      document.getElementById('podcast-text').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">🤖 جاري كتابة البودكاست بالذكاء الاصطناعي...</div>';
      const prompt = `Create a podcast script for English level ${level}. Topic: "${topic}".

IMPORTANT: The script MUST have exactly ${exchangeCount} lines (${exchangeCount/2} exchanges between host and guest).

Rules:
- Host (Sarah, female) asks detailed questions, guest (Mark, male) gives thoughtful answers
- Each line must be 2-4 sentences long — rich, detailed, natural conversation
- The conversation should explore the topic deeply with examples and explanations
- For level ${level}: ${level === 'A1' ? 'simple words but rich content, each response 2-3 short sentences' : level === 'A2' ? 'basic grammar, each response 2-3 sentences with details' : level === 'B1' ? 'intermediate vocabulary, each response 3-4 sentences' : level === 'B2' ? 'complex sentences, abstract ideas, each response 3-4 sentences' : 'sophisticated vocabulary, nuanced discussion, each response 4-5 sentences'}
- Start with warm greeting, end with proper farewell

Return ONLY valid JSON array:
[{"speaker":"host","text":"..."},{"speaker":"guest","text":"..."}]`;

      const result = await callAI([
        { role: 'system', content: 'You create podcast scripts. Return only valid JSON arrays with NO markdown.' },
        { role: 'user', content: prompt }
      ], 3000);

      if (result) {
        const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const lines = JSON.parse(cleaned);
        if (Array.isArray(lines) && lines.length > 8) return lines;
      }
    } catch (e) { /* fallback */ }
  }

  // RICH FALLBACK — long detailed conversation
  const sentences = story.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const lines = [];

  // === WELCOME (8 lines) ===
  lines.push({ speaker: 'host', text: `Hello everyone and welcome to the English Learning Podcast! I'm your host Sarah, and today we have a very interesting topic to discuss: ${topic}. I'm joined by our regular guest Mark, who is here to share his knowledge and experience with us. Welcome to the show, Mark!` });
  lines.push({ speaker: 'guest', text: `Thank you so much Sarah! It's always a pleasure to be here on the podcast. I'm really excited about today's topic because ${topic} is something that affects all of us in our daily lives. I've been looking forward to this conversation for a while now!` });
  lines.push({ speaker: 'host', text: `That's wonderful to hear! Before we start our discussion, I'd like to ask you a question. In your opinion, why is ${topic} so important for English learners to understand and talk about? I think our listeners would really benefit from your perspective on this.` });
  lines.push({ speaker: 'guest', text: `That's a great question to start with, Sarah. You know, when I think about ${topic}, I realize that it's not just a subject we study in textbooks. It's something that we experience every single day in our lives. Understanding ${topic} helps learners connect with the language on a much deeper level and makes their English more natural and fluent.` });

  // === MAIN DISCUSSION ===
  if (sentences.length > 0) {
    lines.push({ speaker: 'host', text: `Let me ask you specifically about something related to ${topic}. I've been reading about this topic and I find it absolutely fascinating. What would you say is the most important thing to know about ${topic} for someone who is just starting to learn about it?` });
    lines.push({ speaker: 'guest', text: `That's an excellent question, Sarah! Let me share my thoughts on this. When it comes to ${topic}, I believe the most important thing is to understand how it connects to everyday situations. For example, think about how ${topic} appears in your morning routine, your work life, and your conversations with friends. It's everywhere once you start noticing it!` });

    // Deep discussion for each sentence
    sentences.slice(0, level === 'A1' ? 5 : level === 'A2' ? 7 : level === 'B1' ? 10 : level === 'B2' ? 14 : 18).forEach((s, i) => {
      if (s.trim().length > 5) {
        lines.push({ speaker: i % 2 === 0 ? 'host' : 'guest', text: `Let's talk about another aspect of ${topic}. ${s.trim()}. This is something that I think really illustrates the point we're discussing today. What are your thoughts on this particular aspect?` });
        lines.push({ speaker: i % 2 === 0 ? 'guest' : 'host', text: `I'm glad you brought that up! This is actually a perfect example of what we've been talking about. When we look at this more closely, we can see how it relates to the bigger picture of ${topic}. Let me explain in more detail what I mean by this, because I think it's really important for our listeners to understand.` });
        lines.push({ speaker: i % 2 === 0 ? 'host' : 'guest', text: `That's a very insightful explanation! Can you give our listeners some practical advice about how they can apply this knowledge in their own lives? I think practical examples are always very helpful for learning.` });
        lines.push({ speaker: i % 2 === 0 ? 'guest' : 'host', text: `Of course! I'd be happy to share some practical advice. The best way to understand this is to start paying attention to how ${topic} shows up in your daily routine. Try to notice it, write down new words and expressions related to it, and practice using them in your conversations. The more you practice, the more natural it will become!` });
      }
    });
  } else {
    // If no sentences, generate discussion from topic
    const discussionPoints = [
      `Let's start by talking about what ${topic} means in our everyday lives. This is something that everyone can relate to, and I think it's a great starting point for our conversation today.`,
      `That's really interesting! Can you share some personal experiences related to ${topic}? I always find that personal stories make the learning process much more engaging and memorable for our listeners.`,
      `I completely agree with what you just said. Building on that point, I'd like to ask you how ${topic} might be different in various cultures around the world. This cross-cultural perspective is very valuable for English learners.`,
      `Thank you for sharing those insights! Now, let's talk about some useful vocabulary words and expressions that are commonly used when discussing ${topic}. This will be very practical for our listeners who want to expand their English vocabulary.`,
      `Those are excellent words to know! Can you explain how learners can practice using these words in real conversations? I think practical usage tips are always the most helpful part of our discussions.`,
      `That's very helpful advice! Let me ask you one more question before we wrap up. What do you think is the most common mistake that English learners make when talking about ${topic}, and how can they avoid it?`
    ];
    discussionPoints.forEach((text, i) => {
      lines.push({ speaker: i % 2 === 0 ? 'host' : 'guest', text });
      lines.push({ speaker: i % 2 === 0 ? 'guest' : 'host', text: `That's a great point! I want to add something to what I just said. When it comes to ${topic}, I think it's really important to practice regularly and not be afraid of making mistakes. Every mistake is an opportunity to learn and improve your English skills. The key is to keep practicing and stay motivated!` });
    });
  }

  // === WRAP UP (8 lines) ===
  lines.push({ speaker: 'host', text: `Well, Mark, we've covered so many interesting aspects of ${topic} today! I want to thank you for sharing your knowledge and experience with us. I think our listeners have learned a tremendous amount from this conversation.` });
  lines.push({ speaker: 'guest', text: `Thank you so much for having me, Sarah! I always enjoy our conversations because we get to explore topics in depth and help people improve their English. ${topic} is such a rich subject and we've only scratched the surface today.` });
  lines.push({ speaker: 'host', text: `Before we say goodbye, let me summarize the key points we discussed today about ${topic}. First, we talked about what it means in everyday life. Then we explored specific examples and practical advice. And finally, we discussed some useful vocabulary. I hope all of this was helpful for our listeners!` });
  lines.push({ speaker: 'guest', text: `That's a perfect summary, Sarah! I'd also like to encourage all of our listeners to practice what they learned today. Try to use the new vocabulary in your conversations, read the lesson story again, and most importantly, enjoy the process of learning English. It's a journey, not a destination!` });
  lines.push({ speaker: 'host', text: `Those are wise words, Mark! Alright everyone, that brings us to the end of today's episode of the English Learning Podcast. We hope you enjoyed our detailed discussion about ${topic} and found it useful for your English learning journey.` });
  lines.push({ speaker: 'guest', text: `It was a pleasure being here, and I hope to see you all again in our next episode. Remember, the key to improving your English is consistent practice and staying curious about the world around you. Keep learning, keep growing!` });
  lines.push({ speaker: 'host', text: `Thank you for listening, and don't forget to check the lesson materials including the story, vocabulary list, and practice exercises. They are designed to help you reinforce what you learned today. See you in the next episode!` });
  lines.push({ speaker: 'guest', text: `Goodbye everyone, and happy learning! Remember that every new word you learn brings you one step closer to fluency. Practice a little bit every day, and you will see amazing progress. Take care and see you soon!` });

  return lines;
}

let podcastUtterance = null;
let podcastSentenceIndex = 0;
let podcastSentences = [];
let podcastSpeakers = []; // track speaker for each sentence
let isPodcastPlaying = false;

function getPodcastText(podcastLines) {
  return podcastLines.map(l => `${l.speaker === 'host' ? 'H:' : 'G:'} ${l.text}`).join('\n');
}

let audioCtx = null;
let ambientInterval = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function startAmbient() {
  try {
    const ctx = getAudioCtx();
    function chirp() {
      if (!isPodcastPlaying) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 2500 + Math.random() * 2000;
      osc.type = 'sine';
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.012, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      ambientInterval = setTimeout(chirp, 4000 + Math.random() * 3000);
    }
    chirp();
  } catch (e) {}
}

function stopAmbient() {
  if (ambientInterval) { clearInterval(ambientInterval); ambientInterval = null; }
}

async function speakWithAI(text, voiceName) {
  const key = getApiKey();
  if (!key) return false;
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: voiceName, response_format: 'mp3' })
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const ctx = getAudioCtx();
    const audioBuf = await ctx.decodeAudioData(buf);
    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(ctx.destination);
    source.start();
    await new Promise(resolve => {
      const t = setTimeout(resolve, 15000);
      source.onended = () => { clearTimeout(t); resolve(); };
    });
    return true;
  } catch (e) { return false; }
}

function playPodcast() {
  if (podcastSentences.length === 0) { alert('لا يوجد نص بودكاست.'); return; }
  if (isPodcastPlaying) { if (speechSynthesis.speaking) speechSynthesis.resume(); return; }
  stopPodcast();
  podcastSentenceIndex = 0;
  isPodcastPlaying = true;
  document.getElementById('podcast-play-btn').textContent = '⏸️';
  document.querySelector('.podcast-wave').classList.remove('paused');
  startAmbient();
  speakNextPodcastSentence();
}

async function speakNextPodcastSentence() {
  if (!isPodcastPlaying || podcastSentenceIndex >= podcastSentences.length) { stopPodcast(); return; }

  const sentence = podcastSentences[podcastSentenceIndex];
  const speaker = podcastSpeakers[podcastSentenceIndex] || 'host';
  const isFemale = speaker === 'host';

  document.querySelectorAll('.podcast-line').forEach((el, i) => {
    el.style.background = i === podcastSentenceIndex ? (isFemale ? '#e0e7ff' : '#fef9c3') : '';
    el.style.fontWeight = i === podcastSentenceIndex ? '700' : '400';
  });

  // Try AI TTS (nova=female, onyx=male)
  const ok = await speakWithAI(sentence, isFemale ? 'nova' : 'onyx');

  if (!isPodcastPlaying) { stopPodcast(); return; }

  if (!ok) {
    // Fallback: speechSynthesis
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(sentence);
    utter.lang = 'en-US';
    utter.rate = parseFloat(document.getElementById('podcast-speed').value) || 0.75;
    utter.pitch = isFemale ? 1.3 : 0.8;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (isFemale) {
      utter.voice = voices.find(v => /zira|female|samantha|victoria|karen/i.test(v.name)) || voices[0] || null;
    } else {
      utter.voice = voices.find(v => /david|mark|male|james|john/i.test(v.name)) || (voices.length > 1 ? voices[1] : voices[0]) || null;
    }
    await new Promise(resolve => {
      const t = setTimeout(resolve, 6000);
      utter.onend = () => { clearTimeout(t); resolve(); };
      utter.onerror = () => { clearTimeout(t); resolve(); };
      speechSynthesis.speak(utter);
    });
  }

  document.querySelectorAll('.podcast-line').forEach(el => { el.style.background = ''; el.style.fontWeight = '400'; });
  podcastSentenceIndex++;
  updatePodcastTimer();
  if (isPodcastPlaying) setTimeout(speakNextPodcastSentence, 4000);
}

function stopPodcast() {
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  isPodcastPlaying = false;
  podcastUtterance = null;
  stopAmbient();
  const btn = document.getElementById('podcast-play-btn');
  if (btn) btn.textContent = '▶️';
  const wave = document.querySelector('.podcast-wave');
  if (wave) wave.classList.add('paused');
}

function changePodcastSpeed(val) {
  if (isPodcastPlaying) { stopPodcast(); playPodcast(); }
}

function updatePodcastTimer() {
  const el = document.getElementById('podcast-timer');
  if (el && podcastSentences.length) {
    el.textContent = `${podcastSentenceIndex}/${podcastSentences.length}`;
  }
}

// Story audio (open in listening tab)
function playStory() {
  const storyEl = document.getElementById('listening-text');
  const text = storyEl ? storyEl.textContent : '';
  if (!text) return;
  stopSpeech();

  speechUtterance = new SpeechSynthesisUtterance(text);
  speechUtterance.rate = parseFloat(document.getElementById('speed-select')?.value) || 1;
  speechUtterance.lang = 'en-US';

  const voiceSelect = document.getElementById('voice-select');
  if (voiceSelect?.value) {
    const v = speechSynthesis.getVoices().find(v => v.name === voiceSelect.value);
    if (v) speechUtterance.voice = v;
  }

  speechUtterance.onstart = () => { document.getElementById('play-btn').textContent = '🔊 جارٍ التشغيل...'; document.getElementById('play-btn').disabled = true; };
  speechUtterance.onend = () => { document.getElementById('play-btn').textContent = '🔊 تشغيل القصة'; document.getElementById('play-btn').disabled = false; };
  speechUtterance.onerror = () => { document.getElementById('play-btn').textContent = '🔊 تشغيل القصة'; document.getElementById('play-btn').disabled = false; };
  speechSynthesis.speak(speechUtterance);
}

function stopSpeech() {
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  const btn = document.getElementById('play-btn');
  if (btn) { btn.textContent = '🔊 تشغيل القصة'; btn.disabled = false; }
}

function speakWord(word) {
  if (!word) return;
  stopSpeech();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.7;
  u.pitch = 1;
  // Use voice with 'en' for better pronunciation
  const voices = speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) u.voice = enVoice;
  speechSynthesis.speak(u);
}

function populateVoices() {
  initPodcastVoices();
  const select = document.getElementById('voice-select');
  if (!select) return;
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => populateVoices();
    return;
  }
  const voices = speechSynthesis.getVoices();
  select.innerHTML = voices.map(v =>
    `<option value="${v.name}" ${v.lang.startsWith('en') ? 'selected' : ''}>${v.name} (${v.lang})</option>`
  ).join('');
}

// Vocabulary Tab
function renderVocab(vocabData) {
  const container = document.getElementById('vocab-list');
  const saved = JSON.parse(localStorage.getItem('saved_vocab') || '{}');
  const levelSaved = saved[currentLevel] && saved[currentLevel][currentLesson] ? saved[currentLevel][currentLesson].map(v => v.w.toLowerCase()) : [];

  container.innerHTML = vocabData.map((v, i) => {
    const isSaved = levelSaved.includes(v.w.toLowerCase());
    return `
      <div class="vocab-item" data-word="${v.w}">
        <div>
          <div class="word">${v.w} ${isSaved ? '<span class="status-badge" style="background:#d1fae5;color:#065f46">✓ محفوظة</span>' : ''}</div>
          <div class="pronunciation">${v.p || '/' + v.w + '/'}</div>
          <button class="pronounce-btn" onclick="speakWord('${v.w.replace(/'/g, "\\'")}')">🔊</button>
          <button class="save-btn ${isSaved ? 'saved' : ''}" onclick="quickSaveVocab('${v.w.replace(/'/g, "\\'")}','${v.m.replace(/'/g, "\\'")}')">
            ${isSaved ? '✓ محفوظة' : '💾 حفظ'}
          </button>
        </div>
        <div>
          <div class="meaning">🇸🇦 ${v.m}</div>
          <div class="example">"${v.e}"</div>
          <input class="write-input" placeholder="اكتب الكلمة هنا..." oninput="checkVocabWriting(this, '${v.w.replace(/'/g, "\\'")}')">
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('vocab-count').textContent = `(${vocabData.length} كلمة)`;

  // Quiz section
  const quizArea = document.getElementById('vocab-quiz-area');
  quizArea.innerHTML = vocabData.map(v => `
    <div class="vocab-quiz-item">
      <span class="hint-word">🇸🇦 ${v.m}</span>
      <input type="text" placeholder="أكتب الكلمة..." oninput="checkVocabQuiz(this, '${v.w.replace(/'/g, "\\'")}')">
    </div>
  `).join('');
}

function checkVocabWriting(input, correct) {
  const val = input.value.trim().toLowerCase();
  if (val === correct.toLowerCase()) {
    input.className = 'write-input correct';
  } else if (val.length > 0 && !correct.toLowerCase().startsWith(val)) {
    input.className = 'write-input wrong';
  } else {
    input.className = 'write-input';
  }
}

function checkVocabQuiz(input, correct) {
  const val = input.value.trim().toLowerCase();
  if (val === correct.toLowerCase()) {
    input.className = 'correct';
    input.style.borderColor = 'var(--success)';
    input.style.background = '#d1fae5';
  } else if (val.length > 0) {
    input.style.borderColor = '#fca5a5';
    input.style.background = '#fee2e2';
  } else {
    input.style.borderColor = '';
    input.style.background = '';
  }
}

function quickSaveVocab(word, meaning) {
  const saved = JSON.parse(localStorage.getItem('saved_vocab') || '{}');
  if (!saved[currentLevel]) saved[currentLevel] = {};
  if (!saved[currentLevel][currentLesson]) saved[currentLevel][currentLesson] = [];
  const exists = saved[currentLevel][currentLesson].some(v => v.w.toLowerCase() === word.toLowerCase());
  if (!exists) {
    saved[currentLevel][currentLesson].push({ w: word, m: meaning, date: Date.now() });
    localStorage.setItem('saved_vocab', JSON.stringify(saved));
  }
  const data = getLessonData(currentLevel, currentLesson);
  const aiData = getCached(`ai_${currentLevel}_${currentLesson}`);
  renderVocab(aiData ? aiData.vocab : (data ? data.vocab : []));
}

// Video Call Conversation
let isCallActive = false;
let callRecognition = null;
let callAIResponse = null;
let callTimer = null;
let callTimeLeft = 0;
const LEVEL_CALL_TIMES = { A1: 60, A2: 90, B1: 120, B2: 150, C1: 180, C2: 240 };

function addCallBubble(text, type) {
  const conv = document.getElementById('call-conversation');
  if (!conv) return;
  conv.innerHTML += `<div class="call-bubble ${type}">${escapeHtml(text)}</div>`;
  conv.scrollTop = conv.scrollHeight;

  // Also add to transcript
  const transcript = document.getElementById('call-transcript-text');
  if (transcript) {
    const label = type === 'user' ? '👤 أنت' : '🤖 AI Teacher';
    transcript.innerHTML += `<div><strong>${label}:</strong> ${escapeHtml(text)}</div>`;
    transcript.scrollTop = transcript.scrollHeight;
  }
}

function updateCallStatus(text, type) {
  const el = document.getElementById('call-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'avatar-status ' + (type || '');
}

async function startVideoCall() {
  if (isCallActive) return;

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('المتصفح لا يدعم التعرف الصوتي. استخدم Chrome أو Edge.');
    return;
  }

  isCallActive = true;
  document.getElementById('call-start-btn').style.display = 'none';
  document.getElementById('call-end-btn').style.display = 'inline-block';
  updateCallStatus('🟢 المكالمة قيد التشغيل...', '');

  // Start conversation timer based on level
  callTimeLeft = LEVEL_CALL_TIMES[currentLevel] || 60;
  if (callTimer) clearInterval(callTimer);
  callTimer = setInterval(() => {
    callTimeLeft--;
    const timerEl = document.getElementById('call-timer');
    if (timerEl) {
      const m = Math.floor(callTimeLeft / 60);
      const s = callTimeLeft % 60;
      timerEl.textContent = `⏱ ${m}:${s.toString().padStart(2, '0')}`;
      timerEl.style.color = callTimeLeft < 15 ? 'var(--danger)' : 'var(--text2)';
    }
    if (callTimeLeft <= 0) {
      clearInterval(callTimer);
      endVideoCall();
    }
  }, 1000);

  const topic = (TOPICS[currentLevel] || [])[currentLesson] || 'this topic';
  const greeting = `Hi there! I'm your English tutor. Let's talk about "${topic}". Can you tell me what you learned from the story in your own words?`;
  addCallBubble(greeting, 'bot');

  // Speak greeting
  const greetUtter = new SpeechSynthesisUtterance(greeting);
  greetUtter.lang = 'en-US';
  greetUtter.rate = 0.8;

  const voices = speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) greetUtter.voice = enVoice;

  greetUtter.onstart = () => updateCallStatus('🔵 المعلم يتحدث...', 'speaking');
  greetUtter.onend = () => {
    updateCallStatus('🟡 استمع... تحدث الآن', 'listening');
    startCallListening();
  };
  speechSynthesis.speak(greetUtter);
}

function startCallListening() {
  if (!isCallActive) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  callRecognition = new SpeechRecognition();
  callRecognition.lang = 'en-US';
  callRecognition.interimResults = false;
  callRecognition.continuous = false;

  updateCallStatus('🟡 استمع... تحدث الآن باللغة الإنجليزية', 'listening');

  callRecognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    addCallBubble(transcript, 'user');
    updateCallStatus('🔵 جاري التفكير...', 'speaking');
    await respondToCaller(transcript);
  };

  callRecognition.onerror = () => {
    if (isCallActive) setTimeout(startCallListening, 1000);
  };

  callRecognition.onend = () => {
    if (isCallActive && document.getElementById('call-status')?.textContent !== '🔵 جاري التفكير...') {
      setTimeout(startCallListening, 500);
    }
  };

  callRecognition.start();
}

async function respondToCaller(msg) {
  const story = document.getElementById('listening-text')?.textContent || '';
  const apiKey = getApiKey();
  const topic = (TOPICS[currentLevel] || [])[currentLesson] || '';
  const data = getLessonData(currentLevel, currentLesson);
  const vocab = data ? data.vocab.slice(0, 5).map(v => `${v.w} (${v.m})`).join(', ') : '';

  if (!apiKey) {
    const replies = ['Interesting! Tell me more.', 'Great point! Can you elaborate?', 'Excellent! Keep going.', 'I see! What else?'];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    await speakAIResponse(reply);
    return;
  }

  try {
    const context = `Lesson topic: "${topic}"
Key vocabulary: ${vocab}
Story: ${story.substring(0, 300)}

Student just said: "${msg}"

Ask a question about the story topic and try to use the vocabulary words naturally. Keep responses short (1-2 sentences). Be encouraging.`;

    const reply = await callAI([
      { role: 'system', content: 'You are an English tutor in a video call. Ask the student questions about the lesson story and encourage them to use the new vocabulary. Keep responses short. Be encouraging and correct gently.' },
      { role: 'user', content: context }
    ], 200);

    await speakAIResponse(reply || 'Great! Keep talking. Try using the new words!');
  } catch (e) {
    await speakAIResponse('Sorry, let me try again. Tell me more!');
  }
}

function speakAIResponse(text) {
  return new Promise((resolve) => {
    addCallBubble(text, 'bot');

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.85;

    const voices = speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utter.voice = enVoice;

    utter.onstart = () => updateCallStatus('🔵 المعلم يتحدث...', 'speaking');
    utter.onend = () => {
      updateCallStatus('🟡 استمع... تحدث الآن', 'listening');
      resolve();
    };
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}

function endVideoCall() {
  isCallActive = false;
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  if (callRecognition) { try { callRecognition.stop(); } catch {} }
  if (speechSynthesis.speaking) speechSynthesis.cancel();

  document.getElementById('call-start-btn').style.display = 'inline-block';
  document.getElementById('call-end-btn').style.display = 'none';
  updateCallStatus('🟢 المكالمة منتهية', '');
  addCallBubble('📞 المكالمة انتهت. تدرب مرة أخرى!', 'bot');
  const timerEl = document.getElementById('call-timer');
  if (timerEl) timerEl.textContent = '';
}

// Text chat (fallback for video call)
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  if (isCallActive) {
    addCallBubble(msg, 'user');
    input.value = '';
    await respondToCaller(msg);
    return;
  }

  addCallBubble(msg, 'user');
  input.value = '';

  const apiKey = getApiKey();
  if (!apiKey) {
    const replies = ['Interesting! Tell me more.', 'Great! Can you elaborate?', 'Excellent! Keep going!', 'I see! What else?'];
    setTimeout(() => addCallBubble(replies[Math.floor(Math.random() * replies.length)], 'bot'), 500);
    return;
  }

  try {
    const story = document.getElementById('listening-text')?.textContent || '';
    const topic = (TOPICS[currentLevel] || [])[currentLesson] || '';
    const data = getLessonData(currentLevel, currentLesson);
    const vocab = data ? data.vocab.slice(0, 5).map(v => `${v.w} (${v.m})`).join(', ') : '';
    const reply = await callAI([
      { role: 'system', content: 'You are an English tutor. Ask about the story topic and encourage using new vocabulary. Keep responses short (1-2 sentences).' },
      { role: 'user', content: `Topic: "${topic}"\nVocabulary: ${vocab}\nStory: ${story.substring(0, 300)}\nStudent: ${msg}` }
    ], 200);
    addCallBubble(reply || 'Great! Tell me more.', 'bot');
  } catch (e) {
    addCallBubble('Sorry, try again!', 'bot');
  }
}

// Duolingo-Style Test (one question at a time)
let duolingoQuestions = [];
let duolingoIndex = 0;
let duolingoCorrect = 0;
let duolingoTotal = 0;
let duolingoAnswered = false;

function startDuolingoTest() {
  const data = getLessonData(currentLevel, currentLesson);
  const aiData = getCached(`ai_${currentLevel}_${currentLesson}`);
  const src = aiData || data || { questions: [] };
  let qs = (src.questions || []).slice(0, 5);

  if (qs.length < 3) {
    qs = [
      { q: 'What is the main topic of the story?', o: ['The main topic', 'Something else', 'Not mentioned', 'I don\'t know'], a: 0 },
      { q: 'Which word best describes the story?', o: ['Interesting', 'Boring', 'Confusing', 'Too long'], a: 0 },
      { q: 'What can you learn from this lesson?', o: ['New vocabulary and ideas', 'Nothing new', 'Only grammar', 'Just reading'], a: 0 }
    ];
  }

  duolingoQuestions = qs;
  duolingoIndex = 0;
  duolingoCorrect = 0;
  duolingoTotal = qs.length;
  duolingoAnswered = false;

  document.getElementById('test-summary').style.display = 'none';
  showDuolingoQuestion();
}

function showDuolingoQuestion() {
  if (duolingoIndex >= duolingoTotal) {
    showDuolingoSummary();
    return;
  }

  duolingoAnswered = false;
  const q = duolingoQuestions[duolingoIndex];
  const container = document.getElementById('test-container');
  const letters = ['A', 'B', 'C', 'D'];

  // Update progress
  const progressFill = document.getElementById('test-progress-bar');
  const progressText = document.getElementById('test-progress-text');
  const pct = (duolingoIndex / duolingoTotal) * 100;
  progressFill.innerHTML = `<div class="test-progress-bar-fill" style="width:${pct}%"></div>`;
  progressText.textContent = `${duolingoIndex}/${duolingoTotal}`;

  container.innerHTML = `
    <div class="test-card" id="test-card">
      <h4>سؤال ${duolingoIndex + 1} من ${duolingoTotal}:</h4>
      <h4 style="font-size:1.15rem;color:var(--text)">${q.q}</h4>
      <div class="test-options">
        ${q.o.map((opt, i) => `
          <div class="test-option" id="opt-${i}" onclick="answerDuolingo(${i})">
            <span class="option-letter">${letters[i]}</span>
            <span>${opt}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn-primary test-next-btn" id="next-question-btn" style="display:none" onclick="nextDuolingoQuestion()">
        ${duolingoIndex < duolingoTotal - 1 ? '▶️ السؤال التالي' : '✅ عرض النتيجة'}
      </button>
    </div>
  `;
}

function answerDuolingo(selected) {
  if (duolingoAnswered) return;
  duolingoAnswered = true;

  const q = duolingoQuestions[duolingoIndex];
  const isCorrect = selected === q.a;

  if (isCorrect) duolingoCorrect++;

  // Show result for each option
  for (let i = 0; i < q.o.length; i++) {
    const opt = document.getElementById(`opt-${i}`);
    if (!opt) continue;
    opt.classList.add('disabled');
    if (i === q.a) opt.classList.add('correct');
    if (selected === i && i !== q.a) opt.classList.add('wrong');

    // Add feedback icons
    const feedback = document.createElement('span');
    feedback.className = 'feedback-icon';
    if (i === q.a) feedback.textContent = '✅';
    if (selected === i && i !== q.a) feedback.textContent = '❌';
    opt.appendChild(feedback);
  }

  // Show explanation
  const card = document.getElementById('test-card');
  if (card) {
    card.classList.add('show-result');
    if (!isCorrect) card.classList.add('wrong');
  }

  document.getElementById('next-question-btn').style.display = 'block';
}

function nextDuolingoQuestion() {
  duolingoIndex++;
  showDuolingoQuestion();
}

function showDuolingoSummary() {
  const container = document.getElementById('test-container');
  const progressFill = document.getElementById('test-progress-bar');
  const progressText = document.getElementById('test-progress-text');
  progressFill.innerHTML = `<div class="test-progress-bar-fill" style="width:100%;background:${duolingoCorrect === duolingoTotal ? 'var(--success)' : 'var(--primary)'}"></div>`;
  progressText.textContent = `${duolingoTotal}/${duolingoTotal}`;

  const score = Math.round((duolingoCorrect / duolingoTotal) * 100);
  const passed = score >= LEVEL_PASS_SCORE;

  container.innerHTML = '';
  document.getElementById('test-summary').style.display = 'block';
  document.getElementById('test-summary').innerHTML = `
    <h3>✅ نتيجة الاختبار</h3>
    <div class="big-score">${duolingoCorrect}/${duolingoTotal}</div>
    <div style="font-size:2rem;margin:8px 0">${score}%</div>
    <div class="skills-grid">
      <div>📖 القراءة: ${score}%</div>
      <div>✏️ الكتابة: تدرب في المحادثة</div>
      <div>🎧 الاستماع: استمع للبودكاست</div>
      <div>🗣️ المحادثة: اذهب للمكالمة</div>
    </div>
    <p style="font-size:1.1rem">${passed ? '🎉 ممتاز! حفظ التقدم...' : '📚 حاول مرة أخرى لتحسين النتيجة'}</p>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
      <button class="btn-primary" onclick="startDuolingoTest()">🔄 إعادة الاختبار</button>
      <button class="btn-secondary" onclick="switchTab('chat')">🗣️ تدرب على المحادثة</button>
    </div>
  `;

  if (passed) saveProgress(currentLevel, currentLesson, true);
}

// Progress
function getProgress() {
  try { return JSON.parse(localStorage.getItem('learn_progress')) || {}; }
  catch { return {}; }
}

function saveProgress(level, lesson, passed) {
  const progress = getProgress();
  if (!progress[level]) progress[level] = {};
  if (passed) progress[level][lesson] = true;
  localStorage.setItem('learn_progress', JSON.stringify(progress));
}

function renderProgress() {
  const container = document.getElementById('progress-content');
  const progress = getProgress();

  let totalDone = 0;
  let totalLessons = 0;

  container.innerHTML = LEVELS.map(l => {
    const topics = TOPICS[l.id] || [];
    const levelProg = progress[l.id] || {};
    const done = topics.filter((_, i) => levelProg[i]).length;
    const total = topics.length;
    totalDone += done;
    totalLessons += total;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const nextLevel = Object.entries(LEVEL_REQ).find(([k, v]) => v === l.id);
    const canProceed = done >= total;

    return `
      <div class="progress-level">
        <h3>${l.icon} ${l.id} — ${l.name}</h3>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width:${pct}%;background:${l.color}"></div>
        </div>
        <div class="progress-stats">${done}/${total} دروس مكتملة (${Math.round(pct)}%)</div>
        <div class="requirements">
          ${canProceed ? '✅ المستوى مكتمل! يمكنك التقدم للمستوى التالي.' : `❌ يحتاج ${total - done} درس إضافي للتقدم`}
          ${nextLevel ? `<br>${canProceed ? `✅ ` : `🔒 `}المستوى التالي: ${nextLevel[0]}` : ''}
        </div>
      </div>
    `;
  }).join('');

  const overall = totalLessons > 0 ? Math.round((totalDone / totalLessons) * 100) : 0;
  container.insertAdjacentHTML('beforebegin', `
    <div class="card" style="text-align:center;margin-bottom:16px">
      <h3>التقدم العام</h3>
      <div class="score" style="font-size:2.5rem;color:var(--primary)">${totalDone}/${totalLessons}</div>
      <p>${overall}% من المنهج مكتمل</p>
      <div class="progress-bar" style="max-width:400px;margin:8px auto">
        <div class="progress-bar-fill" style="width:${overall}%;background:var(--primary)"></div>
      </div>
    </div>
  `);
}

// Settings
function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    localStorage.setItem('api_key', key);
    document.getElementById('api-status').textContent = '✓ تم حفظ المفتاح!';
    document.getElementById('api-status').style.color = 'var(--success)';
  } else {
    localStorage.removeItem('api_key');
    document.getElementById('api-status').textContent = 'تم إزالة المفتاح.';
    document.getElementById('api-status').style.color = 'var(--text2)';
  }
}

function renderLevelRequirements() {
  const container = document.getElementById('level-requirements');
  if (!container) return;
  // Pre-fill API key input
  const keyInput = document.getElementById('api-key-input');
  const savedKey = localStorage.getItem('api_key');
  if (keyInput && savedKey) keyInput.value = savedKey;
  container.innerHTML = `
    <div style="font-size:0.9rem;color:var(--text2)">
      <p>📊 نظام التدرج:</p>
      <ul style="margin-top:8px;padding-right:20px">
        <li>يجب إكمال جميع دروس المستوى الحالي (بنسبة ≥${LEVEL_PASS_SCORE}%)</li>
        <li>عند إكمال المستوى، يُفتح المستوى التالي تلقائياً</li>
        <li>المستويات: A1 → A2 → B1 → B2 → C1 → C2</li>
        <li>مطابق لمستويات CEFR العالمية</li>
      </ul>
    </div>
  `;
}

function resetProgress() {
  if (confirm('هل أنت متأكد من إعادة تعيين كل التقدم؟ لا يمكن التراجع عن هذا الإجراء.')) {
    localStorage.removeItem('learn_progress');
    renderProgress();
    alert('تم إعادة تعيين التقدم.');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'block';
  closeTranslation();
}

// Keyboard shortcuts
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && currentView === 'lesson' && currentTab === 'chat') {
      e.preventDefault();
      sendChatMessage();
    }
    if (e.key === 'Escape') closeTranslation();
  });
  renderHomeLevels();
  setTimeout(populateVoices, 500);
  loadSavedVocab();
});

function loadSavedVocab() {
  try {
    const saved = JSON.parse(localStorage.getItem('saved_vocab'));
    if (saved) savedVocabs = saved;
  } catch {}
}

window.speechSynthesis.onvoiceschanged = populateVoices;
