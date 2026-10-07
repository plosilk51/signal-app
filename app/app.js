// Signal app.
//   4a: one full-screen story from feed.json
//   4b: today's 75 stories, swiping (Tinder-style: right = next), header, end screen, remembering your place
//
// While building, add ?reset to the address to forget everything stored on this device.

// ---------- settings ----------

const STORIES_PER_DAY = 75;
const BUBBLE_EVERY = 4;          // "Outside your bubble": every 4th story
const KEYWORD_BOOST = 3;         // a keyword match counts like 3 extra sources

const TOPICS = ["Israel", "Geopolitics", "Tech & AI", "Markets & economy",
                "Defense", "Middle East", "Energy & climate", "Science & health"];
const TOPICS_ON_AT_START = ["Israel", "Geopolitics", "Tech & AI", "Markets & economy"];

// ---------- what this phone remembers (localStorage) ----------
//
// Everything personal lives only on this device:
//   topics    which topics are on
//   bubble    "Outside your bubble" on or off
//   keywords  followed keywords
//   opened    story IDs you opened, and in which feed (so we skip them on later days)
//   saved     saved stories (step 4c/4d)
//   today     the feed you're reading: its time, the order of its stories, your place

const STORAGE_KEY = "signal-v1";

function freshState() {
  return {
    topics: Object.fromEntries(TOPICS.map(t => [t, TOPICS_ON_AT_START.includes(t)])),
    bubble: true,
    keywords: [],
    name: "",           // shown in the greeting ("Good morning, Ben"); empty = no name
    swipe: "cards",      // "cards" (sideways, Tinder) or "reels" (up and down)
    opened: {},
    saved: {},
    deepDays: {},      // Deep Signal: dates (YYYY-MM-DD) you read one, for the streak
    deepRead: {},      // Deep Signal pieces you marked "I read it"
    deepSaved: {},     // Deep Signal pieces saved for later
    today: null,
  };
}

function loadState() {
  try {
    if (new URLSearchParams(location.search).has("reset")) localStorage.removeItem(STORAGE_KEY);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) return Object.assign(freshState(), stored);
  } catch (problem) {
    // Storage can be unavailable (private browsing). The app still works, it just forgets.
  }
  return freshState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (problem) {}
}

let state = loadState();
let feed = null;        // feed.json
let list = [];          // today's stories, in order
let index = 0;          // which one is on screen (list.length = the end screen)

// ---------- small helpers ----------

// Make an element with a class and (optional) text. Using textContent, never
// innerHTML, for anything from the feed: a headline can't inject code.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// "Just now", "45m ago", "3h ago", "2d ago"
function timeAgo(isoTime) {
  const minutes = Math.floor((Date.now() - new Date(isoTime)) / 60000);
  if (minutes < 5) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

// "BBC", "BBC, Reuters", "BBC, Reuters and 4 more"
function sourcesText(sources) {
  if (sources.length <= 2) return sources.join(", ");
  return sources.slice(0, 2).join(", ") + " and " + (sources.length - 2) + " more";
}

const ICONS = {
  start: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  // Deep Signal: a rising sun sending out waves. Outline until today's read is done, then red.
  deep: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7.5 18a4.5 4.5 0 0 1 9 0Z"/><path d="M5.07 14A8 8 0 0 1 18.93 14"/><path d="M2.47 12.5A11 11 0 0 1 21.53 12.5" opacity=".6"/></svg>',
  deepDone: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#C42A21" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7.5 18a4.5 4.5 0 0 1 9 0Z" fill="#C42A21"/><path d="M5.07 14A8 8 0 0 1 18.93 14"/><path d="M2.47 12.5A11 11 0 0 1 21.53 12.5" opacity=".6"/></svg>',
  crossLarge: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  cross: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  saveFilledSmall: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#C42A21" stroke="#C42A21" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  saveFilled: '<svg width="30" height="30" viewBox="0 0 24 24" fill="#C42A21" stroke="#C42A21" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  save: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  read: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  saved: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  topics: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

// ---------- building today's list of 75 ----------

// Does the story mention one of your keywords? Capitals don't matter, and a keyword
// matches whole words and words starting with it: "Iran" matches "Iranian", not "Tirana".
function escapeForPattern(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function mentionsWord(story, word) {
  const text = story.headlines.join(" ") + " " + story.summary;
  return new RegExp("\\b" + escapeForPattern(word), "i").test(text);
}

function mentionsKeyword(story) {
  return state.keywords.some(word => mentionsWord(story, word));
}

function finalScore(story) {
  return story.score + (mentionsKeyword(story) ? KEYWORD_BOOST : 0);
}

// Skip stories you opened on an earlier day, unless they're a major update.
function alreadySeen(story) {
  const openedIn = state.opened[story.id];
  return openedIn && openedIn !== feed.generated_at && !story.update;
}

// Pick today's `total` stories: your topics first, by score; every 4th position
// is "Outside your bubble" (a topic you've switched off), if that's on.
function buildList(total) {
  const isOn = story => story.topics.some(t => state.topics[t]);
  const byScore = (a, b) => finalScore(b) - finalScore(a);
  // Today's top stories are on the home page, so the feed leaves them out.
  const top = new Set(topStories().map(s => s.id));
  const usable = feed.stories.filter(s => !alreadySeen(s) && !top.has(s.id));
  const yours = usable.filter(isOn).sort(byScore);
  const outside = state.bubble ? usable.filter(s => !isOn(s)).sort(byScore) : [];

  const result = [];
  let y = 0, o = 0;
  while (result.length < total && (y < yours.length || o < outside.length)) {
    const bubbleTurn = (result.length + 1) % BUBBLE_EVERY === 0;
    if ((bubbleTurn && o < outside.length) || y >= yours.length) {
      result.push(Object.assign({ bubble: true }, outside[o++]));
    } else {
      result.push(Object.assign({}, yours[y++], { bubble: false }));
    }
  }
  return result;
}


// Use the list you were already reading today, or make a new one when a new feed arrives.
function prepareToday() {
  const byId = Object.fromEntries(feed.stories.map(s => [s.id, s]));
  const today = state.today;
  if (today && today.feed === feed.generated_at) {
    list = today.ids.map(entry => byId[entry.id] && Object.assign({ bubble: entry.bubble }, byId[entry.id]))
                    .filter(Boolean);
    index = Math.min(today.index, list.length);
  } else {
    list = buildList(STORIES_PER_DAY);
    index = 0;
  }
  rememberPlace();
}

function rememberPlace() {
  state.today = {
    feed: feed.generated_at,
    ids: list.map(s => ({ id: s.id, bubble: !!s.bubble })),
    index,
  };
  saveState();
}

// ---------- opening, saving ----------

// Open the original article and mark the story "✓ Opened". Only opened stories
// are skipped on later days. In a Home Screen app, iOS shows the article in
// Safari's panel on top of Signal, with a Done button to come back.
function openArticle(story) {
  window.open(story.link, "_blank", "noopener");
  if (!state.opened[story.id]) {
    state.opened[story.id] = feed.generated_at;
    saveState();
    refreshCurrent();
  }
}

// Save keeps a full copy of the story, so it still works after tomorrow's feed
// replaces today's. Tapping again removes it.
function toggleSave(story) {
  if (state.saved[story.id]) {
    delete state.saved[story.id];
    toast("Removed from saved");
  } else {
    const copy = Object.assign({}, story);
    delete copy.bubble;
    state.saved[story.id] = { saved_at: Date.now(), story: copy };
    toast("Saved for later");
  }
  saveState();
  refreshCurrent();
}

// Redraw the story on screen (after opening or saving it).
function refreshCurrent() {
  if (slots) fill(slots.current, index);
  // A topic's story list that's open shows "✓ Opened" too.
  const listSheet = document.getElementById("story-list-sheet");
  if (listSheet && !listSheet.hidden) renderStoryList();
  const card = document.getElementById("top-story-sheet");
  if (card && !card.hidden) renderTopStoryCard();
}

let toastTimer;
function toast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 2000);
}

// ---------- one story screen ----------

function renderStory(story) {
  // Layout "C": a framed photo at the top, the story's text below it, and an
  // actions row at the bottom. Only the "Read article" button opens the article.
  const screen = el("article", "story");

  const frame = el("div", "frame");
  if (story.photo) {
    const photo = el("img", "photo");
    photo.src = story.photo;
    photo.alt = "";
    photo.referrerPolicy = "no-referrer";
    photo.draggable = false;
    photo.addEventListener("error", () => photo.replaceWith(placeholder(story)));
    frame.append(photo);
  } else {
    frame.append(placeholder(story));
  }

  const text = el("div", "text");

  const tags = el("div", "tags");
  if (story.bubble) tags.append(el("span", "tag bubble", "Outside your bubble"));
  if (story.update) tags.append(el("span", "tag update", "Update"));
  if (tags.children.length) text.append(tags);

  const meta = el("div", "meta");
  meta.append(el("span", "topic", story.topic), el("span", null, timeAgo(story.published)));
  if (story.reading_minutes) meta.append(el("span", null, story.reading_minutes + " min read"));
  if (state.opened[story.id]) {
    const opened = el("span", "opened");
    opened.innerHTML = ICONS.check;
    opened.append("Opened");
    meta.append(opened);
  }
  text.append(meta);

  text.append(el("h2", "headline", story.headline));
  if (story.summary) text.append(el("p", "summary", story.summary));

  const coverage = el("div", "coverage");
  const dots = el("div", "dots");
  dots.setAttribute("aria-label", story.sources.length + " sources");
  for (let k = 1; k <= 5; k++) dots.append(el("i", k <= story.sources.length ? "on" : ""));
  coverage.append(dots);
  if (story.sources.length === 1) {
    coverage.append(el("span", "single", "Single source: " + story.sources[0]));
  } else {
    coverage.append(el("span", null, sourcesText(story.sources)));
  }
  text.append(coverage);

  const creditParts = [story.outlet];
  if (story.photo_credit) creditParts.push("Photo: " + story.photo_credit);
  text.append(el("span", "credit", creditParts.join(" · ")));

  // Actions: "Read article" (the only way to open the article) and a Save icon.
  const actions = el("div", "actions");
  const read = el("button", "read-button", "Read article");
  read.type = "button";
  read.addEventListener("click", () => openArticle(story));
  const isSaved = !!state.saved[story.id];
  const save = el("button", "save-button" + (isSaved ? " is-saved" : ""));
  save.type = "button";
  save.setAttribute("aria-pressed", String(isSaved));
  save.setAttribute("aria-label", isSaved ? "Remove from saved" : "Save for later");
  save.innerHTML = isSaved ? ICONS.saveFilled : ICONS.save;
  save.addEventListener("click", () => toggleSave(story));
  actions.append(read, save);

  screen.append(frame, text, actions);
  return screen;
}

// No photo: dark grey with the topic name in large letters.
function placeholder(story) {
  return el("div", "photo none", story.topic);
}

function renderEnd() {
  const screen = el("article", "story end");
  const openedToday = list.filter(s => state.opened[s.id] === feed.generated_at).length;
  const words = el("div", "end-text");
  words.append(
    el("h1", null, "You're caught up."),
    el("p", null, `You went through all ${list.length} of today's stories and opened ${openedToday}.`),
    el("p", "strong", "Tomorrow's feed lands at 06:00."),
  );
  const top = el("button", "pill", "Back to the top");
  top.type = "button";
  top.addEventListener("click", backToStart);
  words.append(top);
  screen.append(el("div", "sun"), words);
  return screen;
}

// Jump back to story 1 (from the end screen's button, or by tapping "Story 12 of 75").
function backToStart() {
  if (index === 0) return;
  index = 0;
  rememberPlace();
  layout();
  toast("Back to story 1");
}

// What goes on a given position: a story, the end screen, or nothing.
function screenFor(position) {
  if (position < 0 || position > list.length) return null;
  return position === list.length ? renderEnd() : renderStory(list[position]);
}

// ---------- the deck: three screens (previous, current, next) ----------
//
// Two ways to swipe, chosen on the Topics screen (state.swipe):
//
//   "cards" (Tinder-style, the default). Swipe RIGHT for the next story: the current
//   card follows your finger with a slight tilt and flies off to the right, showing
//   the next story waiting underneath. Swipe LEFT to go back: the previous card
//   (waiting off-screen to the right) slides in leftwards on top.
//
//   "reels" (Instagram Reels-style). Full-screen pages stacked vertically. Swipe UP
//   for the next story (it comes up from below), swipe DOWN to go back.

let deck, header, slots;

const TILT_DEGREES = 15;     // cards: how far a card tilts at the edge of the screen
const UNDER_SCALE = 0.94;    // cards: the card underneath is slightly smaller, then grows

const reelsMode = () => state.swipe === "reels";
function screenWidth() { return deck.clientWidth; }
function screenHeight() { return deck.clientHeight; }

// Position one screen. Screens on top have a higher z-index.
function setCard(slot, { x = 0, y = 0, tilt = 0, scale = 1, z = 2 }, animate) {
  slot.classList.toggle("animate", !!animate);
  slot.style.zIndex = z;
  slot.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg) scale(${scale})`;
}

// Where each screen rests when nobody is touching it.
function rest(role) {
  if (reelsMode()) {
    const h = screenHeight();
    return { current: { y: 0 }, next: { y: h }, previous: { y: -h } }[role];
  }
  return {
    current: { z: 2 },
    next: { scale: UNDER_SCALE, z: 1 },                                     // underneath
    previous: { x: 1.3 * screenWidth(), tilt: TILT_DEGREES, z: 3 },         // off to the right, on top
  }[role];
}

function placeAllAtRest(animate) {
  for (const role of ["current", "next", "previous"]) setCard(slots[role], rest(role), animate);
}

function fill(slot, position) {
  slot.replaceChildren();
  const screen = screenFor(position);
  if (screen) slot.append(screen);
}

function layout() {
  deck.classList.toggle("reels", reelsMode());
  fill(slots.current, index);
  fill(slots.next, index + 1);
  fill(slots.previous, index - 1);
  placeAllAtRest(false);
  updateHeader();
}

function updateHeader() {
  const total = list.length;
  const done = index >= total;
  header.querySelector(".count").textContent = done ? `All ${total} done` : `Story ${index + 1} of ${total}`;
  header.querySelector(".bar div").style.width = (total ? Math.min(index + 1, total) / total * 100 : 0) + "%";
}

const canGoForward = () => index < list.length;   // the end screen is the last one
const canGoBack = () => index > 0;

// Move the screens to match a finger that has moved `forward` pixels toward the next
// story (right in cards mode, up in reels mode; negative = toward the previous one).
function follow(forward) {
  const towardNext = forward > 0;
  const canGo = towardNext ? canGoForward() : canGoBack();
  if (reelsMode()) {
    const h = screenHeight();
    const offset = -(canGo ? forward : forward / 4);   // pages move with the finger
    setCard(slots.current, { y: offset });
    setCard(slots.next, { y: h + offset });
    setCard(slots.previous, { y: -h + offset });
    return;
  }
  const w = screenWidth();
  if (towardNext && canGo) {
    const p = Math.min(1, forward / w);
    setCard(slots.current, { x: forward, tilt: TILT_DEGREES * forward / w, z: 2 });
    setCard(slots.next, { scale: UNDER_SCALE + (1 - UNDER_SCALE) * p, z: 1 });
    setCard(slots.previous, rest("previous"));
  } else if (!towardNext && canGo) {
    const p = Math.min(1, -forward / w);
    setCard(slots.previous, { x: 1.3 * w * (1 - p), tilt: TILT_DEGREES * (1 - p), z: 3 });
    setCard(slots.current, { scale: 1 - (1 - UNDER_SCALE) * p, z: 2 });
    setCard(slots.next, rest("next"));
  } else {
    // Nothing that way (first story, or the end): the card only gives a little.
    setCard(slots.current, { x: forward / 4, tilt: TILT_DEGREES * forward / w / 4, z: 2 });
  }
}

let moving = false;

function go(step) {
  if (moving || (step === 1 && !canGoForward()) || (step === -1 && !canGoBack())) { snapBack(); return; }
  moving = true;
  if (reelsMode()) {
    const h = screenHeight();
    const shift = step === 1 ? -h : h;                 // next: everything slides up; back: down
    setCard(slots.current, { y: shift }, true);
    setCard(slots.next, { y: h + shift }, true);
    setCard(slots.previous, { y: -h + shift }, true);
  } else if (step === 1) {
    const w = screenWidth();
    setCard(slots.current, { x: 1.3 * w, tilt: TILT_DEGREES * 1.3, z: 2 }, true);   // fly off right
    setCard(slots.next, { z: 1 }, true);                                           // grow to full size
  } else {
    setCard(slots.previous, { z: 3 }, true);                                       // slide in from the right
    setCard(slots.current, { scale: UNDER_SCALE, z: 2 }, true);
  }
  setTimeout(() => {
    // Swap roles: the screen that's now in front becomes "current" (keeping its loaded
    // photo), and the one that left is reused for the story beyond.
    const { current, next, previous } = slots;
    if (step === 1) {
      slots = { current: next, previous: current, next: previous };
      index += 1;
      fill(slots.next, index + 1);
    } else {
      slots = { current: previous, next: current, previous: next };
      index -= 1;
      fill(slots.previous, index - 1);
    }
    placeAllAtRest(false);
    rememberPlace();
    updateHeader();
    moving = false;
  }, 320);
}

function snapBack() {
  placeAllAtRest(true);
}

// ---------- gestures ----------

function listenForSwipes() {
  let startX = 0, startY = 0, forward = 0, startTime = 0, dragging = false, dragged = false;

  deck.addEventListener("pointerdown", event => {
    if (moving || event.target.closest("button")) return;
    dragging = true; dragged = false;
    startX = event.clientX; startY = event.clientY; forward = 0; startTime = performance.now();
  });

  deck.addEventListener("pointermove", event => {
    if (!dragging) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    // Any movement (sideways or up/down) means this is a drag, not a tap.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) dragged = true;
    forward = reelsMode() ? -dy : dx;   // reels: finger up = next. cards: finger right = next.
    follow(forward);
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    const speed = Math.abs(forward) / Math.max(1, performance.now() - startTime);  // px per ms
    const far = reelsMode() ? Math.abs(forward) > screenHeight() * 0.15
                            : Math.abs(forward) > screenWidth() * 0.25;
    const flick = Math.abs(forward) > 30 && speed > 0.5;
    if (far || flick) go(forward > 0 ? 1 : -1);
    else snapBack();
  }
  deck.addEventListener("pointerup", release);
  // The phone interrupted the swipe (a notification, a system gesture): put it back.
  deck.addEventListener("pointercancel", () => {
    if (dragging) { dragging = false; snapBack(); }
  });

  // A drag shouldn't also count as a tap on the photo.
  deck.addEventListener("click", event => {
    if (dragged) { event.stopPropagation(); event.preventDefault(); dragged = false; }
  }, true);

  // For testing on a computer: arrow keys and the mouse wheel.
  document.addEventListener("keydown", event => {
    if (document.querySelector(".sheet:not([hidden])") || !homeHidden()) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); go(1); }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); go(-1); }
  });
  let wheelPause = false;
  deck.addEventListener("wheel", event => {
    event.preventDefault();
    const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (wheelPause || Math.abs(amount) < 20) return;
    wheelPause = true;
    setTimeout(() => { wheelPause = false; }, 500);
    go(amount > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener("resize", layout);
}

// ---------- the page around the deck ----------

function buildPage(home) {
  const app = document.getElementById("app");
  deck = el("div", "deck");
  slots = { previous: el("div", "slot"), current: el("div", "slot"), next: el("div", "slot") };
  deck.append(slots.previous, slots.next, slots.current);

  header = el("header", "top");
  const row = el("div", "row");
  row.append(el("div", "brand", "Signal"));
  const buttons = el("div", "header-buttons");
  const actions = { start: backToStart, deep: openDeep, saved: openSaved, topics: openTopics };
  for (const [name, label] of [["start", "Back to the first story"], ["deep", "Deep Signal"],
                               ["saved", "Saved stories"], ["topics", "Settings"]]) {
    const button = el("button", "icon-button");
    button.type = "button";
    button.id = name + "-button";
    button.setAttribute("aria-label", label);
    button.innerHTML = ICONS[name];
    button.addEventListener("click", actions[name]);
    buttons.append(button);
  }
  row.append(buttons);
  const bar = el("div", "bar");
  bar.append(el("div"));
  header.append(row, bar, el("div", "count"));

  const toastBox = el("div", "toast");
  toastBox.id = "toast";
  toastBox.setAttribute("role", "status");   // screen readers announce the message

  app.replaceChildren(deck, header, home, buildSavedSheet(), buildTopicsSheet(), buildStoryListSheet(),
                     buildDeepSheet(), buildTopStorySheet(), toastBox);
  updateDeepButton();
}

// ---------- the Saved screen ----------
//
// A sheet that covers the feed. Newest saved first; stories stay until you remove
// them. Tapping a story opens the article; the red bookmark removes it.

function sheetHeader(title, backLabel = "Feed", onBack = goBack) {
  const top = el("div", "sheet-header");
  const back = el("button", "back");
  back.type = "button";
  back.innerHTML = ICONS.back;
  back.append(backLabel);
  back.addEventListener("click", onBack);
  top.append(back, el("h1", null, title), el("p", "sub"));
  return top;
}

// One tappable row in a list of stories (Saved, or a topic's stories):
// a small photo, a line of details, and the headline. Tapping opens the article.
function storyRowButton(story, details, onOpen = () => openArticle(story)) {
  const open = el("button", "saved-open");
  open.type = "button";
  let thumb;
  if (story.photo) {
    thumb = el("img", "thumb");
    thumb.src = story.photo;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    thumb.addEventListener("error", () => thumb.replaceWith(el("div", "thumb none")));
  } else {
    thumb = el("div", "thumb none");
  }
  const words = el("div", "saved-words");
  const meta = el("div", "meta");
  details.forEach((part, i) => meta.append(el("span", i === 0 ? "topic" : null, part)));
  words.append(meta, el("h4", null, story.headline));
  open.append(thumb, words);
  open.addEventListener("click", onOpen);
  return open;
}

function buildSavedSheet() {
  const sheet = el("section", "sheet");
  sheet.id = "saved-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Saved stories");
  // Two tabs: saved news stories, and saved Deep Signal pieces.
  const tabs = el("div", "segmented saved-tabs");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Saved");
  for (const [tab, text] of [["stories", "Stories"], ["deep", "Deep Signal"]]) {
    const button = el("button", null, text);
    button.type = "button";
    button.dataset.tab = tab;
    button.addEventListener("click", () => { savedTab = tab; renderSaved(); });
    tabs.append(button);
  }
  sheet.append(sheetHeader("Saved"), tabs, el("div", "saved-list"));
  return sheet;
}

let savedTab = "stories";

function savedWhen(timestamp) {
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  return `Saved ${days} days ago`;
}

function renderSaved() {
  const sheet = document.getElementById("saved-sheet");
  sheet.querySelectorAll(".saved-tabs button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.tab === savedTab)));
  if (savedTab === "deep") { renderSavedDeep(sheet); return; }
  const entries = Object.values(state.saved).sort((a, b) => b.saved_at - a.saved_at);
  sheet.querySelector(".sub").textContent = entries.length
    ? `${entries.length} ${entries.length === 1 ? "story" : "stories"} to read later. They stay here until you remove them.`
    : "";

  const listBox = sheet.querySelector(".saved-list");
  listBox.replaceChildren();
  if (!entries.length) {
    listBox.append(el("p", "empty", "Nothing saved yet. Tap Save on any story to keep it here for later."));
    return;
  }

  for (const { story, saved_at } of entries) {
    const row = el("div", "saved-row");
    const open = storyRowButton(story, [story.topic, savedWhen(saved_at)]);

    const remove = el("button", "icon-button remove");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove from saved: " + story.headline);
    remove.innerHTML = ICONS.saveFilledSmall;
    remove.addEventListener("click", () => {
      delete state.saved[story.id];
      saveState();
      renderSaved();
      refreshCurrent();   // the card behind might be this story
      toast("Removed from saved");
    });

    row.append(open, remove);
    listBox.append(row);
  }
}

function openSaved() {
  renderSaved();
  const sheet = document.getElementById("saved-sheet");
  showSheet(sheet);
}

// ---------- opening and closing screens (and Android's Back button) ----------
//
// Each screen that opens (Saved, Topics, Deep Signal, a topic's story list) adds a
// step to the browser's history. Going back - with the "< Feed" button, or with
// Android's Back button or back gesture - removes one step and closes the screen
// on top. On the feed itself, Back leaves the app as usual.

const SHEETS_TOP_FIRST = ["top-story-sheet", "story-list-sheet", "saved-sheet", "deep-sheet", "topics-sheet"];

function showSheet(sheet) {
  sheet.scrollTop = 0;
  sheet.hidden = false;
  history.pushState({ sheet: sheet.id }, "");
}

function goBack() {
  history.back();   // the "popstate" listener below closes the screen
}

function closeTopSheet() {
  const id = SHEETS_TOP_FIRST.find(id => !document.getElementById(id).hidden);
  if (!id) {
    if (homeHidden()) showHome();   // Back from the feed: to the home page
    return;
  }
  document.getElementById(id).hidden = true;
  if (id === "topics-sheet") applyTopicChanges();
  // Back on the home page: refresh it (a story may now be "Opened", the streak may have grown).
  if (!homeHidden()) fillHome();
}

window.addEventListener("popstate", closeTopSheet);

// ---------- the Topics screen ----------
//
// On/off switches per topic, "Outside your bubble", and "Follow a keyword".
// Everything is stored on this phone and applies as soon as you go back to the feed.

let settingsBefore = null;   // a snapshot taken when the screen opens, to see what changed

function switchButton(label, isOn, onChange) {
  const button = el("button", "switch");
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", String(isOn));
  button.setAttribute("aria-label", label);
  button.append(el("i"));
  button.addEventListener("click", () => {
    const nowOn = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(nowOn));
    onChange(nowOn);
  });
  return button;
}

function buildTopicsSheet() {
  const sheet = el("section", "sheet");
  sheet.id = "topics-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Topics");

  const keywordBox = el("div", "box");
  const label = el("label", null, "Follow a keyword");
  label.htmlFor = "keyword-input";
  const form = el("form", "keyword-form");
  const input = el("input");
  input.id = "keyword-input";
  input.type = "text";
  input.placeholder = "Taiwan, Nvidia, interest rates";
  input.autocomplete = "off";
  input.enterKeyHint = "done";
  const add = el("button", "solid", "Add");
  add.type = "submit";
  form.append(input, add);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const word = input.value.trim();
    if (word && !state.keywords.some(k => k.toLowerCase() === word.toLowerCase())) {
      state.keywords.push(word);
      saveState();
      renderKeywords();
    }
    input.value = "";
  });
  keywordBox.append(label, form, el("div", "keyword-rows"),
    el("p", "note", "Stories mentioning a keyword move up your feed."));

  // How you move through the feed: "Swiping" (sideways cards, like Tinder) or
  // "Scrolling" (up and down, like Reels). Just the two choices, no explanation.
  const swipeBox = el("div", "box");
  const choices = el("div", "segmented");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "How to move through the feed");
  for (const [mode, text] of [["cards", "Swiping"], ["reels", "Scrolling"]]) {
    const choice = el("button", null, text);
    choice.type = "button";
    choice.dataset.mode = mode;
    choice.addEventListener("click", () => {
      state.swipe = mode;
      saveState();
      renderSwipeChoice();
      layout();   // the feed behind this screen switches right away
    });
    choices.append(choice);
  }
  swipeBox.append(choices);

  sheet.append(sheetHeader("Settings"), nameBox(), el("div", "topic-list"), keywordBox, swipeBox);
  return sheet;
}

function topicsOnText() {
  const count = TOPICS.filter(t => state.topics[t]).length;
  return `${count} ${count === 1 ? "topic" : "topics"} on. Changes apply as soon as you go back to the feed.`;
}

function renderSwipeChoice() {
  const sheet = document.getElementById("topics-sheet");
  sheet.querySelectorAll(".segmented button").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.swipe));
  });
}

function renderTopics() {
  renderSwipeChoice();
  const sheet = document.getElementById("topics-sheet");
  sheet.querySelector(".sub").textContent = topicsOnText();
  const listBox = sheet.querySelector(".topic-list");
  listBox.replaceChildren();

  for (const topic of TOPICS) {
    const row = el("div", "topic-row");
    // Left of the switch: a button showing how many stories the topic has today,
    // which opens a list of all of them.
    const count = storiesInTopic(topic).length;
    const view = el("button", "topic-view", String(count));
    view.type = "button";
    view.setAttribute("aria-label", `See all ${count} ${topic} stories`);
    view.insertAdjacentHTML("beforeend", ICONS.chevron);
    view.addEventListener("click", () => openStoryList(topic, () => storiesInTopic(topic)));
    const controls = el("div", "topic-controls");
    controls.append(view, switchButton(topic, !!state.topics[topic], on => {
      state.topics[topic] = on;
      saveState();
      sheet.querySelector(".sub").textContent = topicsOnText();
    }));
    row.append(el("span", "topic-name", topic), controls);
    listBox.append(row);
  }

  const bubbleRow = el("div", "topic-row tall");
  const words = el("span", "topic-name", "Outside your bubble");
  words.append(el("small", null, "About every 4th story comes from a topic you've switched off"));
  bubbleRow.append(words, switchButton("Outside your bubble", state.bubble, on => {
    state.bubble = on;
    saveState();
  }));
  listBox.append(bubbleRow);

  renderKeywords();
}

// Each keyword is a row: the word, a "12 >" button listing the stories that
// mention it, and a × to stop following it.
function renderKeywords() {
  const rows = document.querySelector("#topics-sheet .keyword-rows");
  rows.replaceChildren();
  for (const word of state.keywords) {
    const row = el("div", "topic-row keyword-row");

    const count = storiesWithWord(word).length;
    const view = el("button", "topic-view", String(count));
    view.type = "button";
    view.setAttribute("aria-label", `See all ${count} stories mentioning ${word}`);
    view.insertAdjacentHTML("beforeend", ICONS.chevron);
    view.addEventListener("click", () => openStoryList(word, () => storiesWithWord(word)));

    const remove = el("button", "icon-button remove-keyword");
    remove.type = "button";
    remove.setAttribute("aria-label", "Stop following " + word);
    remove.innerHTML = ICONS.crossLarge;
    remove.addEventListener("click", () => {
      state.keywords = state.keywords.filter(k => k !== word);
      saveState();
      renderKeywords();
    });

    const controls = el("div", "topic-controls");
    controls.append(view, remove);
    row.append(el("span", "topic-name", word), controls);
    rows.append(row);
  }
}

function openTopics() {
  settingsBefore = JSON.stringify([state.topics, state.bubble, state.keywords]);
  renderTopics();
  const sheet = document.getElementById("topics-sheet");
  showSheet(sheet);
}

// Changing topics, the bubble switch or keywords builds a fresh 75 for your new
// choices and starts again at story 1 (owner's choice).
function applyTopicChanges() {
  if (!settingsBefore || settingsBefore === JSON.stringify([state.topics, state.bubble, state.keywords])) return;
  list = buildList(STORIES_PER_DAY);
  index = 0;
  rememberPlace();
  layout();
  toast("New feed for your topics");
}

// ---------- a list of stories for one topic or one keyword ----------
//
// Opened from the "54 >" button next to a topic's switch or next to a keyword.
// Most important first; tapping a story opens the article.

// Stories ABOUT a topic: its main topic (the label on the card). A story's other
// topics only mean an outlet of that topic also covered it: Brazil's election
// covered by an Israeli outlet isn't an Israel story.
function storiesInTopic(topic) {
  return feed.stories
    .filter(s => s.topic === topic)
    .sort((a, b) => finalScore(b) - finalScore(a));
}

// Stories mentioning a keyword (same matching as the keyword boost).
function storiesWithWord(word) {
  return feed.stories
    .filter(s => mentionsWord(s, word))
    .sort((a, b) => finalScore(b) - finalScore(a));
}

let shownList = null;   // { title, stories: a function that returns the stories }

function buildStoryListSheet() {
  const sheet = el("section", "sheet above");
  sheet.id = "story-list-sheet";
  sheet.hidden = true;
  sheet.append(sheetHeader("", "Settings"), el("div", "saved-list"));
  return sheet;
}

function renderStoryList() {
  const sheet = document.getElementById("story-list-sheet");
  const stories = shownList.stories();
  sheet.setAttribute("aria-label", shownList.title + " stories");
  sheet.querySelector("h1").textContent = shownList.title;
  sheet.querySelector(".sub").textContent =
    `${stories.length} ${stories.length === 1 ? "story" : "stories"} in today's feed, most important first.`;

  const listBox = sheet.querySelector(".saved-list");
  listBox.replaceChildren();
  if (!stories.length) {
    listBox.append(el("p", "empty", `No stories for ${shownList.title} in today's feed.`));
    return;
  }
  for (const story of stories) {
    const details = [timeAgo(story.published),
                     story.sources.length === 1 ? "Single source" : story.sources.length + " sources"];
    if (state.opened[story.id]) details.push("✓ Opened");
    const row = el("div", "saved-row");
    row.append(storyRowButton(story, details));
    listBox.append(row);
  }
}

function openStoryList(title, stories) {
  shownList = { title, stories };
  renderStoryList();
  const sheet = document.getElementById("story-list-sheet");
  showSheet(sheet);
}

// ---------- Deep Signal ----------
//
// Three pieces a day to learn something new (picked by the morning job). Reading
// one and tapping "I read it" counts the day for your streak. One free skip per
// week: a missed day doesn't break the streak if no other day was skipped in the
// 7 days before it. The header icon turns red once today is done.

// Today's date on this phone, as "2026-10-06".
function dateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");   // en-CA writes dates as YYYY-MM-DD
}
function dayBefore(key) {
  const date = new Date(key + "T12:00:00");  // midday, so summer/winter time can't shift the day
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

// How many days in a row (allowing one skip per week) you've read a Deep Signal.
// If today isn't done yet, the streak still counts up to yesterday.
function deepStreak() {
  const read = state.deepDays;
  let day = read[dateKey()] ? dateKey() : dayBefore(dateKey());
  let count = 0, lastSkip = null;
  for (let i = 0; i < 3660; i++, day = dayBefore(day)) {
    if (read[day]) { count++; continue; }
    // A missed day is forgiven only if the day before it was read and
    // no other day was forgiven within the previous 7 days.
    const skipFree = lastSkip === null || i - lastSkip >= 7;
    if (count > 0 && skipFree && read[dayBefore(day)]) { lastSkip = i; continue; }
    break;
  }
  return count;
}

const deepDoneToday = () => !!state.deepDays[dateKey()];

function updateDeepButton() {
  const button = document.getElementById("deep-button");
  if (!button) return;
  const done = deepDoneToday();
  button.innerHTML = done ? ICONS.deepDone : ICONS.deep;
  button.setAttribute("aria-label", done ? "Deep Signal: today's read is done" : "Deep Signal");
}

function buildDeepSheet() {
  const sheet = el("section", "sheet");
  sheet.id = "deep-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Deep Signal");
  sheet.append(sheetHeader("Deep Signal"), el("div", "streak"), el("div", "deep-list"));
  return sheet;
}

function streakText(count) {
  return count === 1 ? "1-day streak" : `${count}-day streak`;
}

function renderDeep() {
  const sheet = document.getElementById("deep-sheet");
  const pieces = (feed.deep_signal && feed.deep_signal.pieces) || [];
  sheet.querySelector(".sub").textContent =
    "Learn something new. Read one of today's three to keep your streak going.";

  const streak = sheet.querySelector(".streak");
  streak.replaceChildren(
    el("div", "streak-number", streakText(deepStreak())),
    el("div", "streak-status", deepDoneToday() ? "Today: done ✓" : "Today: not yet"),
    el("p", "note", "One free skip per week: missing a single day won't break your streak."),
  );

  const listBox = sheet.querySelector(".deep-list");
  listBox.replaceChildren();
  if (!pieces.length) {
    listBox.append(el("p", "empty", "No Deep Signal today. Check back tomorrow morning."));
    return;
  }
  for (const piece of pieces) listBox.append(deepCard(piece));
}

function deepCard(piece) {
  const card = el("article", "deep-card");
  if (piece.photo) {
    const photo = el("img", "deep-photo");
    photo.src = piece.photo;
    photo.alt = "";
    photo.loading = "lazy";
    photo.referrerPolicy = "no-referrer";
    photo.addEventListener("error", () => photo.remove());
    photo.addEventListener("click", () => window.open(piece.link, "_blank", "noopener"));
    card.append(photo);
  }
  const body = el("div", "deep-body");
  const meta = el("div", "meta");
  meta.append(el("span", "topic", piece.outlet), el("span", null, piece.minutes + " min read"));
  body.append(meta, el("h3", null, piece.title));
  if (piece.summary) body.append(el("p", "summary", piece.summary));

  const actions = el("div", "deep-actions");
  const read = el("button", "solid", "Read");
  read.type = "button";
  read.addEventListener("click", () => window.open(piece.link, "_blank", "noopener"));

  const isSaved = !!state.deepSaved[piece.id];
  const save = el("button", "outline" + (isSaved ? " is-saved" : ""), isSaved ? "Saved" : "Save");
  save.type = "button";
  save.setAttribute("aria-pressed", String(isSaved));
  save.addEventListener("click", () => toggleDeepSave(piece));

  const isRead = !!state.deepRead[piece.id];
  const done = el("button", "outline" + (isRead ? " is-done" : ""), isRead ? "Read ✓" : "I read it");
  done.type = "button";
  done.disabled = isRead;
  done.addEventListener("click", () => markDeepRead(piece));

  actions.append(read, save, done);
  body.append(actions);
  card.append(body);
  return card;
}

function markDeepRead(piece) {
  const firstToday = !deepDoneToday();
  state.deepRead[piece.id] = dateKey();
  state.deepDays[dateKey()] = true;
  saveState();
  renderDeep();
  updateDeepButton();
  toast(firstToday ? `Day counted: ${streakText(deepStreak())}` : "Nice, another one read");
}

function toggleDeepSave(piece) {
  if (state.deepSaved[piece.id]) {
    delete state.deepSaved[piece.id];
    toast("Removed from saved");
  } else {
    state.deepSaved[piece.id] = { saved_at: Date.now(), piece };
    toast("Saved to Deep Signal");
  }
  saveState();
  if (!document.getElementById("deep-sheet").hidden) renderDeep();
}

// The "Deep Signal" tab of the Saved screen.
function renderSavedDeep(sheet) {
  const entries = Object.values(state.deepSaved).sort((a, b) => b.saved_at - a.saved_at);
  sheet.querySelector(".sub").textContent = entries.length
    ? `${entries.length} Deep Signal ${entries.length === 1 ? "piece" : "pieces"} to read later.`
    : "";
  const listBox = sheet.querySelector(".saved-list");
  listBox.replaceChildren();
  if (!entries.length) {
    listBox.append(el("p", "empty", "No Deep Signal pieces saved yet. Tap Save on one to keep it here."));
    return;
  }
  for (const { piece, saved_at } of entries) {
    const row = el("div", "saved-row");
    const open = storyRowButton({ headline: piece.title, photo: piece.photo },
                                [piece.outlet, piece.minutes + " min", savedWhen(saved_at)],
                                () => window.open(piece.link, "_blank", "noopener"));
    const remove = el("button", "icon-button remove");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove from saved: " + piece.title);
    remove.innerHTML = ICONS.saveFilledSmall;
    remove.addEventListener("click", () => {
      delete state.deepSaved[piece.id];
      saveState();
      renderSaved();
      toast("Removed from saved");
    });
    row.append(open, remove);
    listBox.append(row);
  }
}

function openDeep() {
  renderDeep();
  const sheet = document.getElementById("deep-sheet");
  showSheet(sheet);
}

// ---------- the home page ----------
//
// Every time Signal opens: a greeting ("Good morning," with your name under it) and
// the rising red sun. After 2 seconds the sun goes down, the greeting moves up to
// become the page's heading, and today's top stories slide in, with "Start your
// feed" and "Deep Signal" under them.

const SPLASH_MS = 2000;
const TOP_MIN = 5, TOP_MAX = 10, TOP_SCORE = 5;   // top stories: score 5 or more, 5 to 10 of them

// Today's biggest stories, from ALL topics: every story scoring TOP_SCORE or more
// (about five reliable outlets), at least TOP_MIN and at most TOP_MAX.
function topStories() {
  const ranked = feed.stories.slice().sort((a, b) => b.score - a.score);
  const big = ranked.filter(s => s.score >= TOP_SCORE).length;
  return ranked.slice(0, Math.min(TOP_MAX, Math.max(TOP_MIN, big)));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function buildHome() {
  const home = el("section", "home splash");
  home.id = "home";
  const words = el("div", "greeting");
  const name = state.name.trim();
  words.append(el("div", "g1", greeting() + (name ? "," : "")));
  if (name) words.append(el("div", "g2", name));
  words.append(el("div", "date",
    new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })));
  home.append(el("div", "sun"), words, el("div", "home-body"));
  return home;
}

function fillHome() {
  const home = document.getElementById("home");
  const body = home.querySelector(".home-body");
  body.replaceChildren(el("h2", "home-title", "Today's top stories"));

  const listBox = el("ol", "top-list");
  topStories().forEach((story, i) => {
    const row = el("li");
    const open = el("button", "top-row");
    open.type = "button";
    const words = el("div", "top-words");
    const meta = el("div", "top-meta");
    const dots = el("span", "top-dots", "●".repeat(Math.min(5, story.sources.length)));
    meta.append(dots, el("span", null, sourcesText(story.sources) + " · " + story.topic));
    if (state.opened[story.id]) meta.append(el("span", null, "· ✓ Opened"));
    words.append(el("div", "top-headline", story.headline), meta);
    open.append(el("span", "top-number", String(i + 1)), words);
    open.addEventListener("click", () => openTopStory(story));
    row.append(open);
    listBox.append(row);
  });

  const start = el("button", "read-button start-feed", "Start your feed");
  start.type = "button";
  start.addEventListener("click", enterFeed);

  const deep = el("button", "deep-entry");
  deep.type = "button";
  deep.innerHTML = deepDoneToday() ? ICONS.deepDone : ICONS.deep;
  deep.append(el("span", "deep-entry-name", "Deep Signal"),
              el("span", "deep-entry-status",
                 deepDoneToday() ? "Done today ✓" : deepStreak() ? streakText(deepStreak()) : "Start your streak"));
  deep.addEventListener("click", openDeep);

  body.append(listBox, start, deep);
}

// Where the greeting sits during the splash: about a third down the screen. It's
// measured from its place as the page heading, so it can glide up into it.
function placeGreeting(home) {
  const words = home.querySelector(".greeting");
  home.style.setProperty("--splash-shift", Math.round(window.innerHeight * 0.34 - words.offsetTop) + "px");
}

const homeHidden = () => document.getElementById("home").classList.contains("hidden");

function enterFeed() {
  document.getElementById("home").classList.add("hidden");
  history.pushState({ feed: true }, "");   // Android's Back from the feed returns home
  layout();
}

function showHome() {
  fillHome();
  document.getElementById("home").classList.remove("hidden");
}

// One top story as a full card: "Read article", Save, and "‹ Top stories".
let shownTopStory = null;

function buildTopStorySheet() {
  const sheet = el("section", "sheet above story-sheet");
  sheet.id = "top-story-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Top story");
  const back = el("button", "back card-back");
  back.type = "button";
  back.innerHTML = ICONS.back;
  back.append("Top stories");
  back.addEventListener("click", goBack);
  sheet.append(el("div", "card-holder"), back);
  return sheet;
}

function renderTopStoryCard() {
  const sheet = document.getElementById("top-story-sheet");
  sheet.querySelector(".card-holder").replaceChildren(renderStory(shownTopStory));
}

function openTopStory(story) {
  shownTopStory = story;
  renderTopStoryCard();
  showSheet(document.getElementById("top-story-sheet"));
}

// Settings: "Your name", shown in the greeting. Saved on this phone.
function nameBox() {
  const box = el("div", "box name-box");
  const label = el("label", null, "Your name");
  label.htmlFor = "name-input";
  const input = el("input");
  input.id = "name-input";
  input.type = "text";
  input.placeholder = "Ben";
  input.autocomplete = "given-name";
  input.enterKeyHint = "done";
  input.value = state.name;
  input.addEventListener("input", () => { state.name = input.value.trim(); saveState(); });
  input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); });
  box.append(label, input, el("p", "note", "Shown in the greeting when you open Signal."));
  return box;
}

// ---------- start ----------

async function start() {
  // Ask the phone to keep this app's saved data (topics, saves, streak) even when
  // storage runs low. Installed apps usually get a yes; it's harmless if not.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Offline mode: the helper in sw.js keeps a copy of the app and the latest feed,
  // so Signal opens even without internet (or when a network blocks the address).
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // The greeting shows straight away, while the feed loads.
  const home = buildHome();
  document.getElementById("app").replaceChildren(home);
  placeGreeting(home);
  const opened = Date.now();

  let offline = false;
  try {
    // cache: "no-cache" = always ask the server whether there's a newer feed.
    const response = await fetch("feed.json", { cache: "no-cache" });
    offline = response.headers.get("X-Signal-Offline") === "1";
    feed = await response.json();
  } catch (problem) {
    home.querySelector(".home-body").replaceChildren(
      el("p", "message", "Couldn't load today's stories. Check your connection and try again."));
    home.classList.remove("splash");
    return;
  }
  prepareToday();
  buildPage(home);
  layout();
  listenForSwipes();
  fillHome();

  // Keep the greeting on screen for at least 2 seconds, then reveal the home page.
  await new Promise(done => setTimeout(done, Math.max(0, SPLASH_MS - (Date.now() - opened))));
  home.classList.remove("splash");
  if (offline) toast("No connection: showing the feed from " + timeAgo(feed.generated_at).toLowerCase());
}

start();
