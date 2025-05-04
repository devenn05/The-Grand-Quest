// --- START OF FILE script.js ---

document.addEventListener('DOMContentLoaded', function() {
    marked.setOptions({
        breaks: true,
        highlight: function(code, lang) {
            const validLang = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language: validLang }).value;
        }
    });

    // DOM References (remain the same)
    const contentElement = document.querySelector('.chapter-content');
    const contentContainer = document.querySelector('.chapter-content .content-container');
    const chapterTitleElement = document.querySelector('.chapter-nav h2');
    const prevButtons = document.querySelectorAll('.nav-button-prev');
    const nextButtons = document.querySelectorAll('.nav-button-next');
    const prevChapterIcon = document.getElementById('prev-chapter-icon');
    const nextChapterIcon = document.getElementById('next-chapter-icon');
    const playButton = document.getElementById('play-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');
    const pauseButtonIcon = pauseButton.querySelector('i');

    // TTS State (remain the same)
    const speechSynth = window.speechSynthesis;
    let currentChapterId = null;
    let chapters = [];
    let currentUtterance = null;

    // Chunking State (remain the same)
    let chapterChunks = [];
    let currentChunkIndex = -1;
    let isSpeaking = false;

    // Highlighting State (remain the same)
    let pausedParagraphElement = null;
    let lastSpokenWordSpan = null;

    // --- Initialization --- (remains the same)
    async function initApplication() {
        if (!('speechSynthesis' in window)) {
            console.warn("TTS not supported.");
             playButton.style.display = 'none';
             pauseButton.style.display = 'none';
             stopButton.style.display = 'none';
        }
        await loadChaptersManifest();
        setupEventListeners();
        setupSpeechEventListeners();
        if (chapters.length > 0) {
            const lastReadChapterId = localStorage.getItem('lastReadChapter');
            const initialChapterId = lastReadChapterId && chapters.some(c => c.id == lastReadChapterId) ? lastReadChapterId : chapters[0].id;
            await loadChapter(initialChapterId);
        } else {
            contentContainer.innerHTML = '<p class="error">Could not load chapters manifest.</p>';
            chapterTitleElement.textContent = 'Error';
            updateNavigationButtons();
             if (!('speechSynthesis' in window) || chapters.length === 0) {
                playButton.style.display = 'none'; pauseButton.style.display = 'none'; stopButton.style.display = 'none';
             }
        }
        updateSpeechButtonsState();
    }

    // --- Chapter Loading & Parsing --- (remain the same)
    async function loadChaptersManifest() {
        try {
            const response = await fetch('chapters/chapters.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            chapters = await response.json();
            populateChapterList();
        } catch (error) {
            console.error('Error loading chapters manifest:', error); chapters = [];
        }
    }
    function populateChapterList() {
        const chapterList = document.querySelector('.chapter-list'); chapterList.innerHTML = '';
        if (chapters.length === 0) { chapterList.innerHTML = '<p>No chapters found.</p>'; return; }
        chapters.forEach(chapter => {
            const chapterItem = document.createElement('div'); chapterItem.className = 'chapter-item';
            chapterItem.textContent = chapter.title; chapterItem.dataset.chapterId = chapter.id;
            chapterList.appendChild(chapterItem);
        });
    }
    async function loadChapter(chapterId) {
        stopSpeech(true);
        currentUtterance = null; chapterChunks = []; currentChunkIndex = -1; isSpeaking = false;
        removeHighlighting();
        try {
            const chapter = chapters.find(c => c.id == chapterId); if (!chapter) throw new Error(`Chapter ID ${chapterId} not found.`);
            contentContainer.innerHTML = '<div class="loading">Loading chapter...</div>'; chapterTitleElement.textContent = 'Loading...';
            const response = await fetch(`chapters/${encodeURIComponent(chapter.file)}`); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const markdown = await response.text();
            const tempElement = document.createElement('div'); tempElement.innerHTML = marked.parse(markdown);
            prepareSpeechChunks(tempElement);
            contentContainer.innerHTML = ''; while (tempElement.firstChild) { contentContainer.appendChild(tempElement.firstChild); }
            chapterTitleElement.textContent = chapter.title;
            updateActiveChapter(chapterId); currentChapterId = chapterId; localStorage.setItem('lastReadChapter', chapterId);
            applyUserStyles(); updateNavigationButtons(); updateSpeechButtonsState();
        } catch (error) {
            console.error('Error loading chapter content:', error);
            contentContainer.innerHTML = `<p class="error">Error loading chapter content: ${error.message}</p>`;
            chapterTitleElement.textContent = 'Error'; updateNavigationButtons(); updateSpeechButtonsState();
        }
    }
    function prepareSpeechChunks(rootElement) {
        chapterChunks = [];
        const potentialChunkElements = rootElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
        const titleText = chapterTitleElement.textContent?.trim();
        if (titleText && titleText !== 'Loading...') chapterChunks.push({ text: titleText, element: chapterTitleElement });
        potentialChunkElements.forEach(element => {
            const text = element.textContent?.trim();
            if (text) { wrapTextNodesInElement(element); chapterChunks.push({ text: text.replace(/\s+/g, ' ').trim(), element: element }); }
        });
        // console.log(`Prepared ${chapterChunks.length} speech chunks.`);
    }
    function wrapTextNodesInElement(element) {
         const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false); let node; const nodesToReplace = [];
         while (node = walker.nextNode()) {
              if (node.textContent.trim() !== '' && !node.parentElement.closest('pre, code')) {
                   const words = node.textContent.split(/(\s+)/).filter(word => word.length > 0); const fragment = document.createDocumentFragment();
                   words.forEach((word) => {
                       if (word.trim().length > 0) { const span = document.createElement('span'); span.textContent = word; span.classList.add('speech-text-unit'); fragment.appendChild(span); }
                       else { fragment.appendChild(document.createTextNode(word)); }
                   }); nodesToReplace.push({ original: node, replacement: fragment });
              }
         } nodesToReplace.forEach(item => item.original.replaceWith(item.replacement));
    }
    function applyUserStyles() {
        const savedFontSize = localStorage.getItem('fontSize') || '1.0'; const savedFontFamily = localStorage.getItem('fontFamily') || 'serif';
        contentElement.style.fontSize = `${savedFontSize}rem`; contentElement.style.fontFamily = savedFontFamily;
        const savedTheme = localStorage.getItem('selectedTheme') || 'warm'; document.body.className = `${savedTheme}-theme`;
    }
    function updateActiveChapter(chapterId) { document.querySelectorAll('.chapter-item').forEach(item => item.classList.toggle('current', item.dataset.chapterId == chapterId)); }
    function updateNavigationButtons() {
        const currentIndex = chapters.findIndex(c => c.id == currentChapterId); const validIndex = currentChapterId !== null && currentIndex !== -1;
        const showPrev = validIndex && currentIndex > 0; const showNext = validIndex && currentIndex < chapters.length - 1;
        prevButtons.forEach(button => button.style.visibility = showPrev ? 'visible' : 'hidden'); prevChapterIcon.style.display = showPrev ? 'flex' : 'none';
        nextButtons.forEach(button => button.style.visibility = showNext ? 'visible' : 'hidden'); nextChapterIcon.style.display = showNext ? 'flex' : 'none';
    }

    // --- Event Listeners Setup (UI Elements) --- (remains the same)
    function setupEventListeners() {
        document.querySelector('.chapter-list').addEventListener('click', event => { const chapterItem = event.target.closest('.chapter-item'); if (chapterItem) loadChapter(chapterItem.dataset.chapterId); });
        prevButtons.forEach(button => button.addEventListener('click', (e) => navigateChapter(e, -1))); nextButtons.forEach(button => button.addEventListener('click', (e) => navigateChapter(e, 1)));
        prevChapterIcon.addEventListener('click', (e) => navigateChapter(e, -1)); nextChapterIcon.addEventListener('click', (e) => navigateChapter(e, 1));
        function navigateChapter(e, direction) { e.preventDefault(); const iconElement = direction === -1 ? prevChapterIcon : nextChapterIcon; const buttonElement = direction === -1 ? prevButtons[0] : nextButtons[0]; if (iconElement.style.display === 'none' && buttonElement.style.visibility === 'hidden') return; const currentIndex = chapters.findIndex(c => c.id == currentChapterId); if (currentChapterId === null || currentIndex === -1) return; const newIndex = Math.max(0, Math.min(chapters.length - 1, currentIndex + direction)); if (newIndex !== currentIndex) loadChapter(chapters[newIndex].id); }
        document.querySelectorAll('.menu-item').forEach(item => { if (item.id !== 'prev-chapter-icon' && item.id !== 'next-chapter-icon' && item.id !== 'play-button' && item.id !== 'pause-button' && item.id !== 'stop-button') { item.addEventListener('click', function(e) { const panel = this.querySelector('.panel'); if (!panel) return; const isActive = panel.classList.contains('active'); document.querySelectorAll('.panel.active').forEach(p => { if (p !== panel) p.classList.remove('active'); }); panel.classList.toggle('active', !isActive); e.stopPropagation(); }); } });
        document.addEventListener('click', function(e) { const activePanel = document.querySelector('.panel.active'); const clickedInsidePanel = e.target.closest('.panel.active'); const clickedOnPanelOpener = e.target.closest('.menu-item:not(#prev-chapter-icon):not(#next-chapter-icon):not(#play-button):not(#pause-button):not(#stop-button)')?.querySelector('.panel'); if (activePanel && !clickedInsidePanel && !clickedOnPanelOpener) activePanel.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(panel => panel.addEventListener('click', e => e.stopPropagation()));
        document.querySelectorAll('.theme-option').forEach(option => { option.addEventListener('click', function(e) { e.stopPropagation(); document.querySelectorAll('.theme-option.active').forEach(opt => opt.classList.remove('active')); this.classList.add('active'); const theme = this.dataset.theme; document.body.className = `${theme}-theme`; localStorage.setItem('selectedTheme', theme); }); });
        const savedFontSize = localStorage.getItem('fontSize') || '1.0'; const savedFontFamily = localStorage.getItem('fontFamily') || 'serif'; contentElement.style.fontSize = `${savedFontSize}rem`; contentElement.style.fontFamily = savedFontFamily;
        document.querySelector('.font-btn.smaller').addEventListener('click', function(e) { e.stopPropagation(); updateFontSize(-0.1); }); document.querySelector('.font-btn.larger').addEventListener('click', function(e) { e.stopPropagation(); updateFontSize(0.1); });
        function updateFontSize(delta) { const currentSize = parseFloat(contentElement.style.fontSize) || 1.0; const newSize = Math.max(0.8, Math.min(2.5, currentSize + delta)); contentElement.style.fontSize = `${newSize.toFixed(1)}rem`; localStorage.setItem('fontSize', newSize.toFixed(1)); }
        const fontSelect = document.querySelector('.font-family'); fontSelect.addEventListener('change', function(e) { e.stopPropagation(); contentElement.style.fontFamily = this.value; localStorage.setItem('fontFamily', this.value); }); fontSelect.value = savedFontFamily;
        const savedTheme = localStorage.getItem('selectedTheme') || 'warm'; const themeOptionToActivate = document.querySelector(`.theme-option[data-theme="${savedTheme}"]`); if (themeOptionToActivate) { document.querySelectorAll('.theme-option.active').forEach(opt => opt.classList.remove('active')); themeOptionToActivate.classList.add('active'); document.body.className = `${savedTheme}-theme`; } else { document.querySelector('.theme-option[data-theme="warm"]').classList.add('active'); document.body.className = 'warm-theme'; }
    }

    // --- Text-to-Speech Specific Event Listeners ---
    function setupSpeechEventListeners() {
        if (!('speechSynthesis' in window)) return;
        playButton.addEventListener('click', startSpeech);
        pauseButton.addEventListener('click', togglePauseSpeech); // Add log inside if needed
        stopButton.addEventListener('click', () => stopSpeech(false)); // Explicitly pass false for user action
        if (speechSynth.getVoices().length > 0) updateSpeechButtonsState();
        else speechSynth.onvoiceschanged = updateSpeechButtonsState;
    }

    // --- Core TTS Control Functions ---
    function startSpeech() {
        if (isSpeaking || !chapterChunks.length) return;
        stopSpeech(true);
        console.log("[TTS DEBUG] Starting speech from chunk 0");
        isSpeaking = true;
        currentChunkIndex = 0;
        updateSpeechButtonsState();
        speakChunk(currentChunkIndex);
    }

    function speakChunk(index) {
        if (index < 0 || index >= chapterChunks.length || !isSpeaking) {
             console.log(`[TTS DEBUG] speakChunk(${index}) aborted: Conditions not met (isSpeaking=${isSpeaking})`);
             if(isSpeaking) stopSpeech(true); // Force cleanup if isSpeaking somehow still true
            return;
        }
        const chunk = chapterChunks[index];
        if (!chunk || !chunk.text) {
             console.warn(`[TTS DEBUG] speakChunk(${index}): Skipping empty chunk.`);
             currentChunkIndex++; speakChunk(currentChunkIndex);
             return;
        }
         if(chunk.element) chunk.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        currentUtterance = new SpeechSynthesisUtterance(chunk.text);
         // Apply Voice Settings
        const voices = speechSynth.getVoices(); const preferredVoices = ['Google US English', 'Microsoft David - English (United States)', 'Alex', 'Samantha', 'Karen'];
        let selectedVoice = voices.find(voice => preferredVoices.includes(voice.name) && voice.lang.startsWith('en')) || voices.find(voice => voice.lang.startsWith('en'));
        if (selectedVoice) { currentUtterance.voice = selectedVoice; currentUtterance.rate = 1.05; currentUtterance.pitch = 1.0; }
        else { console.warn(`[TTS DEBUG] No suitable English voice found for chunk ${index}.`); }

        currentUtterance.onboundary = (event) => {
             // --- Highlighting Logic (No changes needed here unless severe lag) ---
            if (event.name !== 'word' || !isSpeaking || !chunk.element || currentChunkIndex !== index) return;
            removeWordHighlight(); // Clear previous word
            let spokenCharIndex = event.charIndex;
            const textUnits = chunk.element.querySelectorAll('.speech-text-unit');
            let cumulativeLength = 0; let foundUnit = null;
            for (let i = 0; i < textUnits.length; i++) {
                const unit = textUnits[i]; const precedingNode = unit.previousSibling;
                let precedingWhitespaceLength = (precedingNode && precedingNode.nodeType === Node.TEXT_NODE) ? precedingNode.textContent.length : 0;
                const unitLength = unit.textContent.length; const startIndex = cumulativeLength + precedingWhitespaceLength; const endIndex = startIndex + unitLength;
                if (spokenCharIndex >= startIndex && spokenCharIndex < endIndex) { foundUnit = unit; break; }
                cumulativeLength += precedingWhitespaceLength + unitLength;
            }
            if (foundUnit) {
                foundUnit.classList.add('speaking-word');
                lastSpokenWordSpan = foundUnit;
                // console.log(`[TTS DEBUG] Highlight boundary: index ${spokenCharIndex}, word: "${foundUnit.textContent}"`); // Optional intense debug
            }
            // else { console.log(`[TTS DEBUG] Highlight boundary: index ${spokenCharIndex}, no unit found.`); } // Optional intense debug
        };

        currentUtterance.onend = () => {
            // Need to check the MASTER isSpeaking flag again, as stopSpeech() might have been called
            // between when the synth finished and this event fires.
             console.log(`[TTS DEBUG] onend received for chunk ${index}. isSpeaking=${isSpeaking}, currentChunkIndex=${currentChunkIndex}`);
             removeWordHighlight();
             if (isSpeaking && currentChunkIndex === index) { // Only proceed if still actively speaking *this* chunk
                 currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                     speakChunk(currentChunkIndex);
                 } else {
                     console.log("[TTS DEBUG] Finished all chunks normally.");
                     stopSpeech(true); // All done, cleanup
                 }
             } else {
                  console.log(`[TTS DEBUG] onend for chunk ${index} ignored or race condition detected.`);
                  // Don't try to speak next chunk if isSpeaking is false or index changed
             }
        };

        currentUtterance.onerror = (event) => {
             console.error(`[TTS DEBUG] TTS error on chunk ${index}:`, event.error);
             removeWordHighlight();
              if (isSpeaking && currentChunkIndex === index) { // Try to recover if we are still supposed to be speaking this chunk
                 currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                     console.log("[TTS DEBUG] Attempting to skip to next chunk after error.");
                     speakChunk(currentChunkIndex);
                 } else {
                     stopSpeech(true); // Error on last chunk
                 }
             }
        };

        // Assign the utterance before speaking, makes pause/stop logic simpler
        // currentUtterance is already assigned above
        console.log(`[TTS DEBUG] Attempting to speak chunk ${index}. Length: ${chunk.text.length}`);
        speechSynth.speak(currentUtterance);

        // *** ADD Mobile Debug: Check if speaking starts ***
        setTimeout(() => {
            if (isSpeaking && currentChunkIndex === index && !speechSynth.speaking && !speechSynth.pending) {
                 console.warn(`[TTS DEBUG] Mobile check: Synth may not have started speaking chunk ${index} properly.`);
                 // Consider potentially trying to advance or stop if this state persists
             }
        }, 300); // Check after a short delay
    }

    // --- MODIFIED Pause / Resume Logic with Mobile Debugging ---
    function togglePauseSpeech() {
        console.log(`[TTS DEBUG] togglePauseSpeech called. isSpeaking=${isSpeaking}. Current synth state: speaking=${speechSynth.speaking}, paused=${speechSynth.paused}, pending=${speechSynth.pending}`);

        if (!isSpeaking || currentChunkIndex < 0) {
            console.warn("[TTS DEBUG] togglePauseSpeech: Ignored, not in a speaking state or no chunk active.");
            return;
        }

        if (speechSynth.speaking && !speechSynth.paused) {
            // --- PAUSING ---
            console.log("[TTS DEBUG] Attempting to PAUSE...");
            removeWordHighlight(); // Remove word highlight immediately

            speechSynth.pause(); // Try to pause

            // *** ADD Mobile Debug: Check state *after* calling pause ***
            // Use setTimeout to allow state change to potentially propagate
             setTimeout(() => {
                  console.log(`[TTS DEBUG] State after pause attempt: speaking=${speechSynth.speaking}, paused=${speechSynth.paused}`);
                  if (speechSynth.paused) { // Only update UI and highlight IF pause succeeded
                       console.log("[TTS DEBUG] Pause successful.");
                       updateSpeechButtonsState();
                       // Highlight paragraph
                       const currentChunkElement = chapterChunks[currentChunkIndex]?.element;
                       if (currentChunkElement) highlightPausedParagraph(currentChunkElement);
                  } else {
                       console.warn("[TTS DEBUG] Mobile Warning: Pause command may not have worked as expected!");
                       // Force UI update based on *actual* state just in case
                        updateSpeechButtonsState();
                  }
             }, 100); // Small delay (adjust if needed)

        } else if (speechSynth.paused) {
            // --- RESUMING ---
            console.log("[TTS DEBUG] Attempting to RESUME...");
            removeParagraphHighlight(); // Remove pause highlight first

            speechSynth.resume();

             // *** ADD Mobile Debug: Check state *after* calling resume ***
             setTimeout(() => {
                 console.log(`[TTS DEBUG] State after resume attempt: speaking=${speechSynth.speaking}, paused=${speechSynth.paused}`);
                  if (!speechSynth.paused && speechSynth.speaking) { // Check if resume appears successful
                       console.log("[TTS DEBUG] Resume successful.");
                       updateSpeechButtonsState(); // Reflect playing state
                  } else {
                       console.warn("[TTS DEBUG] Mobile Warning: Resume command may not have worked as expected!");
                       updateSpeechButtonsState(); // Update UI based on actual state
                  }
             }, 100);

        } else {
             console.log("[TTS DEBUG] togglePauseSpeech: No action taken (synth not speaking or paused?).");
             // Could be pending, or just stopped. Update UI based on current state.
             updateSpeechButtonsState();
        }
    }

    // --- Stop Speech Logic --- (remains the same robust version)
    function stopSpeech(isInternalCleanup = false) {
        console.log("[TTS DEBUG] Stop Speech Triggered.", isInternalCleanup ? "(Internal Cleanup / End of chapter)" : "(User Action)");
        const wasSpeaking = isSpeaking;
        isSpeaking = false;
        currentChunkIndex = -1;
        const utteranceToCancel = currentUtterance;
        currentUtterance = null;
        if (speechSynth) {
            if (utteranceToCancel) { utteranceToCancel.onboundary = null; utteranceToCancel.onend = null; utteranceToCancel.onerror = null; }
            speechSynth.cancel();
            // console.log("[TTS DEBUG] Called speechSynth.cancel()");
        }
        removeHighlighting();
        resetSpeechButtonsVisuals();
        // Optional log moved or removed for cleanliness
    }

    // --- Highlighting Helpers --- (remain the same)
    function removeHighlighting() { removeWordHighlight(); removeParagraphHighlight(); }
    function removeWordHighlight() { if (lastSpokenWordSpan) { lastSpokenWordSpan.classList.remove('speaking-word'); lastSpokenWordSpan = null; } document.querySelectorAll('.speaking-word').forEach(el => el.classList.remove('speaking-word')); }
    function removeParagraphHighlight() { if (pausedParagraphElement) { pausedParagraphElement.classList.remove('highlighted-text'); pausedParagraphElement = null; } document.querySelectorAll('.highlighted-text').forEach(el => el.classList.remove('highlighted-text')); }
    function highlightPausedParagraph(element) { removeParagraphHighlight(); if (element) { element.classList.add('highlighted-text'); pausedParagraphElement = element; } }

    // --- Speech Button State Management ---
    function updateSpeechButtonsState() {
        const canSpeak = ('speechSynthesis' in window) && chapterChunks.length > 0 && currentChapterId !== null;
        const isSynthPaused = speechSynth.paused; // Check actual synth state

        // Determine button visibility based on capability and *intended* state (isSpeaking)
        playButton.style.display = (!isSpeaking && canSpeak) ? 'flex' : 'none';
        pauseButton.style.display = (isSpeaking && canSpeak) ? 'flex' : 'none';
        stopButton.style.display = (isSpeaking && canSpeak) ? 'flex' : 'none';

        // Determine pause/play icon based on the *actual* synth state IF we intend to be speaking
        if (isSpeaking && isSynthPaused) {
            pauseButtonIcon.classList.remove('fa-pause-circle');
            pauseButtonIcon.classList.add('fa-play-circle'); // Show play icon
        } else {
            pauseButtonIcon.classList.remove('fa-play-circle');
            pauseButtonIcon.classList.add('fa-pause-circle'); // Show pause icon
        }
        // console.log(`[TTS DEBUG] updateSpeechButtonsState: canSpeak=${canSpeak}, isSpeaking=${isSpeaking}, isSynthPaused=${isSynthPaused}`); // Optional debug
    }

    function resetSpeechButtonsVisuals() {
        const canSpeak = ('speechSynthesis' in window) && chapterChunks.length > 0 && currentChapterId !== null;
        playButton.style.display = canSpeak ? 'flex' : 'none';
        pauseButton.style.display = 'none';
        stopButton.style.display = 'none';
        pauseButtonIcon.classList.remove('fa-play-circle');
        pauseButtonIcon.classList.add('fa-pause-circle');
        // console.log(`[TTS DEBUG] resetSpeechButtonsVisuals: canSpeak=${canSpeak}`); // Optional debug
    }

    // --- Start the Application ---
    initApplication();

});
// --- END OF FILE script.js ---
