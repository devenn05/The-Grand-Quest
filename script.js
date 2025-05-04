// --- START OF FILE script.js ---

document.addEventListener('DOMContentLoaded', function() {
    marked.setOptions({
        breaks: true,
        highlight: function(code, lang) {
            const validLang = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language: validLang }).value;
        }
    });

    // DOM References
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

    // TTS State
    const speechSynth = window.speechSynthesis;
    let currentChapterId = null;
    let chapters = [];
    let currentUtterance = null; // Ref to current chunk's utterance

    // Chunking State
    let chapterChunks = [];
    let currentChunkIndex = -1;
    let isSpeaking = false; // Master flag for speech process

    // Highlighting State
    let pausedParagraphElement = null;
    let lastSpokenWordSpan = null;

    // --- Initialization ---
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
            // Explicitly hide buttons if no chapters & synth not supported
             if (!('speechSynthesis' in window) || chapters.length === 0) {
                playButton.style.display = 'none'; pauseButton.style.display = 'none'; stopButton.style.display = 'none';
             }
        }
        // Initial state update for buttons
        updateSpeechButtonsState(); // Will hide if needed based on flags/support
    }

    // --- Chapter Loading & Parsing ---
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
        const chapterList = document.querySelector('.chapter-list');
        chapterList.innerHTML = '';
        if (chapters.length === 0) { chapterList.innerHTML = '<p>No chapters found.</p>'; return; }
        chapters.forEach(chapter => {
            const chapterItem = document.createElement('div');
            chapterItem.className = 'chapter-item'; chapterItem.textContent = chapter.title;
            chapterItem.dataset.chapterId = chapter.id; chapterList.appendChild(chapterItem);
        });
     }

    async function loadChapter(chapterId) {
        // Use the modified stopSpeech for robust cleanup between chapters
        stopSpeech(true); // Pass true for internal cleanup context

        currentUtterance = null; chapterChunks = []; currentChunkIndex = -1; isSpeaking = false;
        removeHighlighting();
        // Note: resetSpeechButtonsVisuals() is called within stopSpeech now

        try {
            const chapter = chapters.find(c => c.id == chapterId);
            if (!chapter) throw new Error(`Chapter ID ${chapterId} not found.`);

            contentContainer.innerHTML = '<div class="loading">Loading chapter...</div>';
            chapterTitleElement.textContent = 'Loading...';

            const response = await fetch(`chapters/${encodeURIComponent(chapter.file)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const markdown = await response.text();

            const tempElement = document.createElement('div');
            tempElement.innerHTML = marked.parse(markdown);

            prepareSpeechChunks(tempElement); // Creates chunks and wraps words

            contentContainer.innerHTML = ''; // Clear loading
            while (tempElement.firstChild) { // Append processed content
                 contentContainer.appendChild(tempElement.firstChild);
             }

            chapterTitleElement.textContent = chapter.title;
            updateActiveChapter(chapterId);
            currentChapterId = chapterId;
            localStorage.setItem('lastReadChapter', chapterId);
            applyUserStyles();
            updateNavigationButtons();
            updateSpeechButtonsState(); // Update based on newly loaded content

        } catch (error) {
            console.error('Error loading chapter content:', error);
            contentContainer.innerHTML = `<p class="error">Error loading chapter content: ${error.message}</p>`;
            chapterTitleElement.textContent = 'Error';
            updateNavigationButtons();
            updateSpeechButtonsState(); // Ensure buttons are hidden on error
        }
    }

    function prepareSpeechChunks(rootElement) {
        chapterChunks = [];
        const potentialChunkElements = rootElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
        const titleText = chapterTitleElement.textContent?.trim();
        if (titleText && titleText !== 'Loading...') {
            chapterChunks.push({ text: titleText, element: chapterTitleElement });
        }
        potentialChunkElements.forEach(element => {
            const text = element.textContent?.trim();
            if (text) {
                wrapTextNodesInElement(element);
                chapterChunks.push({ text: text.replace(/\s+/g, ' ').trim(), element: element });
            }
        });
        console.log(`Prepared ${chapterChunks.length} speech chunks.`);
     }

     function wrapTextNodesInElement(element) {
         const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
         let node; const nodesToReplace = [];
         while (node = walker.nextNode()) {
              if (node.textContent.trim() !== '' && !node.parentElement.closest('pre, code')) {
                   const words = node.textContent.split(/(\s+)/).filter(word => word.length > 0);
                   const fragment = document.createDocumentFragment();
                   words.forEach((word) => {
                       if (word.trim().length > 0) {
                           const span = document.createElement('span'); span.textContent = word;
                           span.classList.add('speech-text-unit'); fragment.appendChild(span);
                       } else { fragment.appendChild(document.createTextNode(word)); }
                   });
                   nodesToReplace.push({ original: node, replacement: fragment });
              }
         }
         nodesToReplace.forEach(item => item.original.replaceWith(item.replacement));
     }

    function applyUserStyles() { /* ... (same as before) ... */
        const savedFontSize = localStorage.getItem('fontSize') || '1.0';
        const savedFontFamily = localStorage.getItem('fontFamily') || 'serif';
        contentElement.style.fontSize = `${savedFontSize}rem`;
        contentElement.style.fontFamily = savedFontFamily;
        const savedTheme = localStorage.getItem('selectedTheme') || 'warm';
        document.body.className = `${savedTheme}-theme`;
    }
    function updateActiveChapter(chapterId) { /* ... (same as before) ... */
        document.querySelectorAll('.chapter-item').forEach(item => item.classList.toggle('current', item.dataset.chapterId == chapterId));
    }
    function updateNavigationButtons() { /* ... (same as before) ... */
        const currentIndex = chapters.findIndex(c => c.id == currentChapterId); const validIndex = currentChapterId !== null && currentIndex !== -1;
        const showPrev = validIndex && currentIndex > 0; const showNext = validIndex && currentIndex < chapters.length - 1;
        prevButtons.forEach(button => button.style.visibility = showPrev ? 'visible' : 'hidden'); prevChapterIcon.style.display = showPrev ? 'flex' : 'none';
        nextButtons.forEach(button => button.style.visibility = showNext ? 'visible' : 'hidden'); nextChapterIcon.style.display = showNext ? 'flex' : 'none';
    }

    // --- Event Listeners Setup (UI Elements) ---
    function setupEventListeners() { /* ... (same as before - includes chapter list, nav, panels, theme/font) ... */
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
        pauseButton.addEventListener('click', togglePauseSpeech);
        stopButton.addEventListener('click', stopSpeech); // Direct call to the modified stopSpeech
        if (speechSynth.getVoices().length > 0) updateSpeechButtonsState();
        else speechSynth.onvoiceschanged = updateSpeechButtonsState;
    }

    // --- Core TTS Control Functions (Chunking Logic) ---
    function startSpeech() {
        if (isSpeaking || !chapterChunks.length) return;
        stopSpeech(true); // Ensure clean state
        console.log("Starting speech from chunk 0");
        isSpeaking = true;
        currentChunkIndex = 0;
        updateSpeechButtonsState(); // Show Pause/Stop
        speakChunk(currentChunkIndex);
    }

    function speakChunk(index) {
        if (index < 0 || index >= chapterChunks.length || !isSpeaking) {
             console.log("speakChunk: Halting - Index out of bounds or not speaking.");
            // If we somehow get here inappropriately, stop might already be called,
            // but calling again ensures cleanup and button reset.
             stopSpeech(true);
            return;
        }
        const chunk = chapterChunks[index];
        if (!chunk || !chunk.text) {
             console.warn(`speakChunk: Skipping empty chunk at index ${index}.`);
             currentChunkIndex++; speakChunk(currentChunkIndex); // Try next immediately
             return;
        }
         if(chunk.element) chunk.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        currentUtterance = new SpeechSynthesisUtterance(chunk.text);
         // Apply Voice Settings (same as before)
          const voices = speechSynth.getVoices(); const preferredVoices = ['Google US English', 'Microsoft David - English (United States)', 'Alex', 'Samantha', 'Karen'];
          let selectedVoice = voices.find(voice => preferredVoices.includes(voice.name) && voice.lang.startsWith('en')) || voices.find(voice => voice.lang.startsWith('en'));
          if (selectedVoice) { currentUtterance.voice = selectedVoice; currentUtterance.rate = 1.05; currentUtterance.pitch = 1.0; } else console.warn(`No suitable English voice for chunk ${index}.`);

        currentUtterance.onboundary = (event) => {
            // Boundary handling for word highlighting (same as before)
            if (event.name !== 'word' || !isSpeaking || !chunk.element || currentChunkIndex !== index) return;
             removeWordHighlight();
             let spokenCharIndex = event.charIndex;
             const textUnits = chunk.element.querySelectorAll('.speech-text-unit');
             let cumulativeLength = 0; let foundUnit = null;
              for (let i = 0; i < textUnits.length; i++) { /* ... (exact same logic as before to find foundUnit) ... */
                  const unit = textUnits[i]; const precedingNode = unit.previousSibling;
                  let precedingWhitespaceLength = (precedingNode && precedingNode.nodeType === Node.TEXT_NODE) ? precedingNode.textContent.length : 0;
                  const unitLength = unit.textContent.length; const startIndex = cumulativeLength + precedingWhitespaceLength; const endIndex = startIndex + unitLength;
                   if (spokenCharIndex >= startIndex && spokenCharIndex < endIndex) { foundUnit = unit; break; }
                   cumulativeLength += precedingWhitespaceLength + unitLength;
              }
             if (foundUnit) { foundUnit.classList.add('speaking-word'); lastSpokenWordSpan = foundUnit; }
        };

        currentUtterance.onend = () => {
             console.log(`Finished chunk ${index}`);
             removeWordHighlight();
              // Check *master* flag before proceeding
             if (isSpeaking && currentChunkIndex === index) {
                 currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                     speakChunk(currentChunkIndex);
                 } else {
                     console.log("Finished all chunks.");
                     stopSpeech(true); // All done, final cleanup
                 }
             } else {
                 console.log(`onend for chunk ${index} ignored: isSpeaking=${isSpeaking}, currentChunkIndex=${currentChunkIndex}`);
             }
        };

        currentUtterance.onerror = (event) => {
             console.error(`TTS error on chunk ${index}:`, event.error);
             removeWordHighlight();
              if (isSpeaking && currentChunkIndex === index) { // Try to recover if still active
                 currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                     console.log("Attempting to skip to next chunk after error.");
                     speakChunk(currentChunkIndex);
                 } else {
                     stopSpeech(true); // Error on last chunk
                 }
             }
        };

        speechSynth.speak(currentUtterance);
        console.log(`Speaking chunk ${index}: "${chunk.text.substring(0, 50)}..."`);
    }

    function togglePauseSpeech() {
         // Pause/Resume Logic (same as before)
         if (!isSpeaking || !currentUtterance) return;
         if (speechSynth.paused) {
             console.log("Resuming speech"); removeParagraphHighlight(); speechSynth.resume(); updateSpeechButtonsState();
         } else if (speechSynth.speaking) {
             console.log("Pausing speech"); removeWordHighlight(); speechSynth.pause(); updateSpeechButtonsState();
             if (currentChunkIndex >= 0 && currentChunkIndex < chapterChunks.length) { const currentChunkElement = chapterChunks[currentChunkIndex]?.element; if (currentChunkElement) { setTimeout(() => { if(speechSynth.paused) { highlightPausedParagraph(currentChunkElement); } }, 50); } }
         }
    }

    // --- MODIFIED Stop Speech Logic ---
    function stopSpeech(isInternalCleanup = false) {
         // 1. Log the action context
        console.log("Stop Speech Triggered.", isInternalCleanup ? "(Internal Cleanup / End of chapter)" : "(User Action)");

         // 2. Immediately set state flags to prevent further action
         const wasSpeaking = isSpeaking; // Store previous state for logging
         isSpeaking = false; // *** Set master flag immediately ***
         currentChunkIndex = -1; // Reset index

          // 3. Grab reference to utterance BEFORE nulling the main var
         const utteranceToCancel = currentUtterance;
         currentUtterance = null;

         // 4. Clean up the synthesizer
         if (speechSynth) {
             // Remove listeners attached to the specific utterance we are cancelling
             if (utteranceToCancel) {
                 utteranceToCancel.onboundary = null;
                 utteranceToCancel.onend = null;
                 utteranceToCancel.onerror = null;
                  // console.log("Removed listeners from utterance being cancelled.");
             }
              // Cancel any current or pending speech in the browser queue
              speechSynth.cancel();
             console.log("Called speechSynth.cancel()");
         }

         // 5. Clean up visual state
         removeHighlighting(); // Clean up word and paragraph highlights

          // 6. *** Unconditionally reset button visuals to idle state ***
         resetSpeechButtonsVisuals();

         // 7. Log outcome (optional)
         if (wasSpeaking && !isInternalCleanup) { console.log("Speech actively stopped by user."); }
         else if (!wasSpeaking && !isInternalCleanup) { console.log("Stop button clicked, but was not actively speaking."); }
         else { console.log("Stop triggered via internal cleanup."); }
     }

    // --- Highlighting Helpers --- (same as before)
    function removeHighlighting() { removeWordHighlight(); removeParagraphHighlight(); }
    function removeWordHighlight() { if (lastSpokenWordSpan) { lastSpokenWordSpan.classList.remove('speaking-word'); lastSpokenWordSpan = null; } document.querySelectorAll('.speaking-word').forEach(el => el.classList.remove('speaking-word')); }
    function removeParagraphHighlight() { if (pausedParagraphElement) { pausedParagraphElement.classList.remove('highlighted-text'); pausedParagraphElement = null; } document.querySelectorAll('.highlighted-text').forEach(el => el.classList.remove('highlighted-text')); }
    function highlightPausedParagraph(element) { removeParagraphHighlight(); if (element) { element.classList.add('highlighted-text'); pausedParagraphElement = element; } }

    // --- Speech Button State Management --- (same as before)
    function updateSpeechButtonsState() {
         const canSpeak = ('speechSynthesis' in window) && chapterChunks.length > 0;
         playButton.style.display = (!isSpeaking && canSpeak) ? 'flex' : 'none';
         pauseButton.style.display = (isSpeaking && canSpeak) ? 'flex' : 'none';
         stopButton.style.display = (isSpeaking && canSpeak) ? 'flex' : 'none';
          if (isSpeaking && speechSynth.paused) { pauseButtonIcon.classList.remove('fa-pause-circle'); pauseButtonIcon.classList.add('fa-play-circle'); }
          else { pauseButtonIcon.classList.remove('fa-play-circle'); pauseButtonIcon.classList.add('fa-pause-circle'); }
     }

    // Reset buttons to the initial 'Play' state (visually) - NO change here needed
     function resetSpeechButtonsVisuals() {
        const canSpeak = ('speechSynthesis' in window) && chapterChunks.length > 0 && currentChapterId !== null; // Ensure content is loaded too
        playButton.style.display = canSpeak ? 'flex' : 'none';
        pauseButton.style.display = 'none';
        stopButton.style.display = 'none';
        pauseButtonIcon.classList.remove('fa-play-circle');
        pauseButtonIcon.classList.add('fa-pause-circle');
     }

    // --- Start the Application ---
    initApplication();

});
// --- END OF FILE script.js ---
