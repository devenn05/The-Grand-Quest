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
    let currentUtterance = null; // Reference to the utterance currently being spoken or paused

    // Chunking State
    let chapterChunks = []; // Array to hold { text: "...", element: <DOMNode> }
    let currentChunkIndex = -1; // Index of the chunk being spoken
    let isSpeaking = false; // Overall state flag for speech process

    // Highlighting State
    let pausedParagraphElement = null; // The block element highlighted on pause
    let lastSpokenWordSpan = null; // The word span highlighted during playback

    // --- Initialization ---
    async function initApplication() {
        if (!('speechSynthesis' in window)) {
            console.warn("TTS not supported.");
            // Hide all TTS controls immediately
             playButton.style.display = 'none';
             pauseButton.style.display = 'none';
             stopButton.style.display = 'none';
        } else {
            // Check for potential issues on voices changed event, especially on mobile
             speechSynth.onvoiceschanged = () => {
                console.log("Voices loaded or changed.");
                // Potentially update UI or re-check features if needed after voices load
                 updateSpeechButtonsState(); // Re-evaluate button state when voices are ready
            };
        }
        await loadChaptersManifest();
        setupEventListeners();
        setupSpeechEventListeners(); // Setup happens regardless of support, buttons hidden if needed
        if (chapters.length > 0) {
            const lastReadChapterId = localStorage.getItem('lastReadChapter');
            const initialChapterId = lastReadChapterId && chapters.some(c => c.id == lastReadChapterId) ? lastReadChapterId : chapters[0].id;
            await loadChapter(initialChapterId); // Wait for chapter load before potentially showing buttons
        } else {
            contentContainer.innerHTML = '<p class="error">Could not load chapters manifest.</p>';
            chapterTitleElement.textContent = 'Error';
            updateNavigationButtons();
             // Ensure buttons are hidden if no chapters or no synth support
             updateSpeechButtonsState(); // Initial check after potential manifest load failure
        }
         // Update button visibility based on synth support *and* if content loaded
         updateSpeechButtonsState();
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
        console.log(`loadChapter: Loading chapter ${chapterId}`); // Add log
        // Stop any ongoing speech from the previous chapter - Force cleanup
        stopSpeech(true); // Pass flag to indicate it's a chapter change cleanup

        // Reset state variables
        currentUtterance = null;
        chapterChunks = [];
        currentChunkIndex = -1;
        isSpeaking = false; // Ensure this is false before loading new content

        removeHighlighting();
        resetSpeechButtonsVisuals(); // Reset button visuals (should show Play if possible)

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

            prepareSpeechChunks(tempElement); // Create chunks

            contentContainer.innerHTML = '';
            while (tempElement.firstChild) {
                 contentContainer.appendChild(tempElement.firstChild);
             }

            chapterTitleElement.textContent = chapter.title;
            updateActiveChapter(chapterId);
            currentChapterId = chapterId;
            localStorage.setItem('lastReadChapter', chapterId);

            applyUserStyles();
            updateNavigationButtons();
            // Update button state *after* chunks are prepared
            updateSpeechButtonsState();
            console.log(`loadChapter: Chapter ${chapterId} loaded, ${chapterChunks.length} chunks prepared.`);

        } catch (error) {
            console.error('Error loading chapter content:', error);
            contentContainer.innerHTML = `<p class="error">Error loading chapter content: ${error.message}</p>`;
            chapterTitleElement.textContent = 'Error';
            updateNavigationButtons();
            updateSpeechButtonsState(); // Hide buttons on error
        }
    }

     // Prepare Chunks & Wrap Words within Blocks
     function prepareSpeechChunks(rootElement) {
         chapterChunks = [];
         const potentialChunkElements = rootElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
         const titleText = chapterTitleElement.textContent?.trim();
         if (titleText && titleText !== 'Loading...' && titleText !== 'Error') {
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

     // Wrap Words only within a specific element
     function wrapTextNodesInElement(element) {
         const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
         let node;
         const nodesToReplace = [];
         while (node = walker.nextNode()) {
              if (node.textContent.trim() !== '' && !node.parentElement.closest('pre, code')) {
                   const words = node.textContent.split(/(\s+)/).filter(part => part.length > 0);
                   const fragment = document.createDocumentFragment();
                   words.forEach((word) => {
                       if (word.trim().length > 0) {
                           const span = document.createElement('span');
                           span.textContent = word;
                           span.classList.add('speech-text-unit');
                           fragment.appendChild(span);
                       } else {
                           fragment.appendChild(document.createTextNode(word));
                       }
                   });
                   nodesToReplace.push({ original: node, replacement: fragment });
              }
         }
         nodesToReplace.forEach(item => {
              if (item.original.parentNode) {
                 item.original.replaceWith(item.replacement);
              }
         });
     }

    // Apply saved font/theme styles
    function applyUserStyles() {
        const savedFontSize = localStorage.getItem('fontSize') || '1.0';
        const savedFontFamily = localStorage.getItem('fontFamily') || 'serif';
        contentElement.style.fontSize = `${savedFontSize}rem`;
        contentElement.style.fontFamily = savedFontFamily;
        const savedTheme = localStorage.getItem('selectedTheme') || 'warm';
        document.body.className = `${savedTheme}-theme`;
    }
    // Update active chapter in list
    function updateActiveChapter(chapterId) {
         document.querySelectorAll('.chapter-item').forEach(item => item.classList.toggle('current', item.dataset.chapterId == chapterId));
    }
    // Update visibility of Previous/Next buttons
    function updateNavigationButtons() {
        const currentIndex = chapters.findIndex(c => c.id == currentChapterId);
        const validIndex = currentChapterId !== null && currentIndex !== -1;
        const showPrev = validIndex && currentIndex > 0;
        const showNext = validIndex && currentIndex < chapters.length - 1;
        prevButtons.forEach(button => button.style.visibility = showPrev ? 'visible' : 'hidden');
        prevChapterIcon.style.display = showPrev ? 'flex' : 'none';
        nextButtons.forEach(button => button.style.visibility = showNext ? 'visible' : 'hidden');
        nextChapterIcon.style.display = showNext ? 'flex' : 'none';
     }


    // --- Event Listeners Setup (UI Elements) ---
    function setupEventListeners() {
         // Chapter List Click
         document.querySelector('.chapter-list').addEventListener('click', event => {
             const chapterItem = event.target.closest('.chapter-item');
             if (chapterItem) loadChapter(chapterItem.dataset.chapterId);
         });
          // Nav Button Clicks
          prevButtons.forEach(button => button.addEventListener('click', (e) => navigateChapter(e, -1)));
          nextButtons.forEach(button => button.addEventListener('click', (e) => navigateChapter(e, 1)));
          prevChapterIcon.addEventListener('click', (e) => navigateChapter(e, -1));
          nextChapterIcon.addEventListener('click', (e) => navigateChapter(e, 1));
          function navigateChapter(e, direction) {
             e.preventDefault();
             const iconElement = direction === -1 ? prevChapterIcon : nextChapterIcon;
             const buttonElement = direction === -1 ? prevButtons[0] : nextButtons[0];
             // Check both icon and button visibility/display before navigating
             if ((iconElement.style.display === 'none' || iconElement.offsetParent === null) && buttonElement.style.visibility === 'hidden') return;
              const currentIndex = chapters.findIndex(c => c.id == currentChapterId);
             if (currentChapterId === null || currentIndex === -1) return;
             const newIndex = Math.max(0, Math.min(chapters.length - 1, currentIndex + direction));
              if (newIndex !== currentIndex) loadChapter(chapters[newIndex].id);
          }
         // Panel Management (Chapters, Settings)
         document.querySelectorAll('.menu-item').forEach(item => {
             // Exclude specific interactive icons from generic panel toggling
             if (!['prev-chapter-icon', 'next-chapter-icon', 'play-button', 'pause-button', 'stop-button'].includes(item.id)) {
                 item.addEventListener('click', function(e) {
                     const panel = this.querySelector('.panel'); if (!panel) return;
                     const isActive = panel.classList.contains('active');
                     // Close other active panels first
                     document.querySelectorAll('.panel.active').forEach(p => { if (p !== panel) p.classList.remove('active'); });
                     // Toggle current panel
                     panel.classList.toggle('active', !isActive);
                     e.stopPropagation(); // Prevent click bubbling to document listener
                 });
             }
          });
         // Close panels on outside click
         document.addEventListener('click', function(e) {
             const activePanel = document.querySelector('.panel.active');
             // Check if click is outside an active panel AND not on the icon that opened it
             if (activePanel && !activePanel.contains(e.target)) {
                 const openerIcon = document.querySelector(`.menu-item i[class*="${activePanel.classList[0].replace('-panel', '-menu')}"]`);
                 if (!openerIcon || !openerIcon.parentElement.contains(e.target)) {
                     activePanel.classList.remove('active');
                 }
             }
         });
         // Prevent clicks inside panels from closing them
         document.querySelectorAll('.panel').forEach(panel => panel.addEventListener('click', e => e.stopPropagation()));

          // Theme/Font Controls
          document.querySelectorAll('.theme-option').forEach(option => {
               option.addEventListener('click', function(e) {
                   e.stopPropagation();
                   document.querySelectorAll('.theme-option.active').forEach(opt => opt.classList.remove('active'));
                   this.classList.add('active');
                   const theme = this.dataset.theme;
                   document.body.className = `${theme}-theme`;
                   localStorage.setItem('selectedTheme', theme);
                });
            });
           const savedFontSize = localStorage.getItem('fontSize') || '1.0';
           const savedFontFamily = localStorage.getItem('fontFamily') || 'serif';
           contentElement.style.fontSize = `${savedFontSize}rem`;
           contentElement.style.fontFamily = savedFontFamily;
           document.querySelector('.font-btn.smaller').addEventListener('click', function(e) { e.stopPropagation(); updateFontSize(-0.1); });
           document.querySelector('.font-btn.larger').addEventListener('click', function(e) { e.stopPropagation(); updateFontSize(0.1); });
           function updateFontSize(delta) {
               const currentSize = parseFloat(contentElement.style.fontSize) || 1.0;
               const newSize = Math.max(0.8, Math.min(2.5, currentSize + delta));
               contentElement.style.fontSize = `${newSize.toFixed(1)}rem`;
               localStorage.setItem('fontSize', newSize.toFixed(1));
            }
            const fontSelect = document.querySelector('.font-family');
            fontSelect.addEventListener('change', function(e) {
                e.stopPropagation();
                contentElement.style.fontFamily = this.value;
                localStorage.setItem('fontFamily', this.value);
            });
            fontSelect.value = savedFontFamily; // Set dropdown to saved value

           // Initialize theme on load
           const savedTheme = localStorage.getItem('selectedTheme') || 'warm';
           const themeOptionToActivate = document.querySelector(`.theme-option[data-theme="${savedTheme}"]`);
           if (themeOptionToActivate) {
               document.querySelectorAll('.theme-option.active').forEach(opt => opt.classList.remove('active'));
               themeOptionToActivate.classList.add('active');
               document.body.className = `${savedTheme}-theme`;
            } else { // Fallback if saved theme is invalid
               document.querySelector('.theme-option[data-theme="warm"]').classList.add('active');
               document.body.className = 'warm-theme';
            }
    }


    // --- Text-to-Speech Specific Event Listeners ---
    function setupSpeechEventListeners() {
        if (!('speechSynthesis' in window)) return; // Do nothing if not supported

        playButton.addEventListener('click', startSpeech);
        pauseButton.addEventListener('click', togglePauseSpeech); // Will handle mobile/desktop difference inside
        stopButton.addEventListener('click', () => stopSpeech(false)); // User action stop
    }


    // --- Core TTS Control Functions (REVISED for Mobile Stability) ---

    function startSpeech() {
        console.log("startSpeech: Attempting to start speech.");
        if (!('speechSynthesis' in window)) {
            console.warn("startSpeech: Speech synthesis not supported.");
            return;
        }

        // Check 1: Already speaking?
        if (isSpeaking) {
            console.warn("startSpeech: Already speaking (isSpeaking flag is true). Ignoring request.");
            return;
        }
        // Check 2: No content?
        if (chapterChunks.length === 0) {
            console.warn("startSpeech: No chapter chunks available to speak.");
            return;
        }
        // Check 3: Synth busy? (Try to recover)
        if (speechSynth.speaking || speechSynth.pending) {
             console.warn(`startSpeech: Synth is busy (speaking: ${speechSynth.speaking}, pending: ${speechSynth.pending}). Attempting to cancel first.`);
             stopSpeech(true); // Attempt internal cleanup
             setTimeout(() => {
                 console.log("startSpeech: Retrying after delay post-cancel.");
                 if (!isSpeaking && chapterChunks.length > 0 && !speechSynth.speaking && !speechSynth.pending) {
                     isSpeaking = true;
                     currentChunkIndex = 0;
                     updateSpeechButtonsState();
                     speakChunk(currentChunkIndex);
                 } else {
                     console.error("startSpeech: Synth still busy or state invalid after cancel and delay. Cannot start.");
                     isSpeaking = false;
                     updateSpeechButtonsState();
                 }
             }, 100);
             return;
         }

        // --- Proceed to start ---
        console.log("startSpeech: Checks passed. Starting speech sequence.");
        stopSpeech(true); // Ensure clean slate

        isSpeaking = true;
        currentChunkIndex = 0;
        updateSpeechButtonsState(); // Show Pause/Stop

        speakChunk(currentChunkIndex); // Start the first chunk
    }

    function speakChunk(index) {
        console.log(`speakChunk: Preparing chunk ${index}. isSpeaking=${isSpeaking}`);
        if (index < 0 || index >= chapterChunks.length || !isSpeaking || !('speechSynthesis' in window)) {
            console.warn(`speakChunk: Aborting - Index out of bounds (${index}/${chapterChunks.length}), not speaking (${isSpeaking}), or synth unavailable.`);
            stopSpeech(true);
            return;
        }

        const chunk = chapterChunks[index];
        if (!chunk || !chunk.text) {
             console.warn(`speakChunk: Skipping empty or invalid chunk at index ${index}.`);
             currentChunkIndex++;
             setTimeout(() => speakChunk(currentChunkIndex), 0); // Avoid deep recursion
             return;
        }

        // Scroll into view
        if(chunk.element && typeof chunk.element.scrollIntoView === 'function') {
             try { chunk.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
             catch (scrollError) { console.warn("scrollIntoView failed", scrollError); }
        }

        currentUtterance = new SpeechSynthesisUtterance(chunk.text);

        // Voice Selection
        try {
           const voices = speechSynth.getVoices();
           if (voices.length === 0 && speechSynth.onvoiceschanged !== null) {
               console.warn(`speakChunk: Voices array is empty, using default voice for chunk ${index}.`);
           } else if (voices.length > 0) {
              const preferredVoices = ['Google US English', 'Microsoft David - English (United States)', 'Alex', 'Samantha', 'Karen'];
              let selectedVoice = voices.find(voice => preferredVoices.includes(voice.name) && voice.lang.startsWith('en'));
              if (!selectedVoice) selectedVoice = voices.find(voice => voice.lang.startsWith('en-US'));
              if (!selectedVoice) selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
              if (selectedVoice) {
                  currentUtterance.voice = selectedVoice;
                  currentUtterance.rate = 1.05;
                  currentUtterance.pitch = 1.0;
                   console.log(`speakChunk: Using voice: ${selectedVoice.name} (lang: ${selectedVoice.lang}) for chunk ${index}`);
               } else {
                  console.warn(`speakChunk: No suitable English voice found among ${voices.length} voices for chunk ${index}. Using default.`);
              }
          } else {
               console.warn(`speakChunk: Voices array is empty, using default voice for chunk ${index}.`);
           }
        } catch (voiceError) {
            console.error("speakChunk: Error getting or setting voices:", voiceError);
        }

        // --- Event Listeners for the Utterance ---

        // MOBILE FIX: Disable word highlighting on mobile
        const isMobileCheck = window.innerWidth <= 768;

        if (!isMobileCheck) {
            currentUtterance.onboundary = (event) => {
                if (event.name !== 'word' || !isSpeaking || !chunk.element || currentChunkIndex !== index) return;
                removeWordHighlight();
                 try {
                     // Simple highlighting logic (best effort for desktop)
                     let spokenCharIndex = event.charIndex;
                     const textUnits = chunk.element.querySelectorAll('.speech-text-unit');
                     let cumulativeLength = 0; let foundUnit = null;
                      for (let i = 0; i < textUnits.length; i++) {
                           const unit = textUnits[i];
                           const precedingNode = unit.previousSibling;
                           let precedingWhitespaceLength = (precedingNode && precedingNode.nodeType === Node.TEXT_NODE) ? precedingNode.textContent.length : 0;
                           const unitLength = unit.textContent.length;
                           const startIndex = cumulativeLength + precedingWhitespaceLength;
                           const endIndex = startIndex + unitLength;
                           if (spokenCharIndex >= startIndex && spokenCharIndex < endIndex) { foundUnit = unit; break; }
                            cumulativeLength += precedingWhitespaceLength + unitLength;
                       }
                      if (foundUnit) {
                           foundUnit.classList.add('speaking-word');
                           lastSpokenWordSpan = foundUnit;
                       }
                  } catch (highlightError) { console.error("Error during word highlighting:", highlightError); removeWordHighlight(); }
            };
        } else {
            console.log("Mobile detected: Word highlighting (onboundary) disabled.");
            currentUtterance.onboundary = null;
        }


        // onend: Move to next chunk
        currentUtterance.onend = () => {
             console.log(`speakChunk: onend received for chunk ${index}. isSpeaking: ${isSpeaking}, currentChunkIndex: ${currentChunkIndex}`);
             removeWordHighlight(); // Clear any lingering highlight
             if (isSpeaking && currentChunkIndex === index) {
                  currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                      speakChunk(currentChunkIndex);
                  } else {
                      console.log("speakChunk: Finished all chunks.");
                      stopSpeech(true); // Final cleanup
                  }
             } else {
                  console.log(`speakChunk: onend for chunk ${index} but speech stopped or index changed.`);
             }
        };

        // onerror: Handle errors
        currentUtterance.onerror = (event) => {
            console.error(`speakChunk: TTS error on chunk ${index}:`, event.error, event);
            removeHighlighting();
            if (isSpeaking && currentChunkIndex === index) {
                 currentChunkIndex++;
                 if (currentChunkIndex < chapterChunks.length) {
                     console.log("speakChunk: Attempting to skip to next chunk after error.");
                     setTimeout(() => { if (isSpeaking) speakChunk(currentChunkIndex); }, 100);
                 } else {
                     console.log("speakChunk: Error occurred on the last chunk.");
                     stopSpeech(true);
                 }
            } else {
                console.warn(`speakChunk: TTS error occurred but state indicates speech shouldn't be active. Performing cleanup.`);
                stopSpeech(true);
            }
        };

        // Actually speak
         try {
             console.log(`speakChunk: Calling speechSynth.speak() for chunk ${index}. Text: "${chunk.text.substring(0, 50)}..."`);
             speechSynth.speak(currentUtterance);
             console.log(`speakChunk: speechSynth.speak() called for chunk ${index}. State: speaking=${speechSynth.speaking}, pending=${speechSynth.pending}`);
         } catch (speakError) {
             console.error(`speakChunk: Error calling speechSynth.speak for chunk ${index}:`, speakError);
             stopSpeech(true); // Stop if speak call fails
         }
    }


    // Pause / Resume Logic (Handles Mobile Difference)
    function togglePauseSpeech() {
        if (!('speechSynthesis' in window)) return;

        // MOBILE FIX: Treat Pause as Stop on mobile
        const isMobileCheck = window.innerWidth <= 768;
        if (isMobileCheck) {
            console.warn("Mobile detected in togglePauseSpeech: Executing stopSpeech() instead.");
            stopSpeech(false); // Call stop as if user pressed stop
            return;
        }

        // --- Original Desktop Pause/Resume Logic ---
        console.log(`togglePauseSpeech (Desktop): Called. State: isSpeaking=${isSpeaking}, synth.speaking=${speechSynth.speaking}, synth.paused=${speechSynth.paused}`);
        if (speechSynth.paused) {
            // RESUMING (Desktop only)
            console.log("togglePauseSpeech (Desktop): Attempting to resume.");
            removeParagraphHighlight();
            speechSynth.resume();
            updateSpeechButtonsState();
             setTimeout(() => console.log(`togglePauseSpeech (Desktop): After resume attempt: speaking=${speechSynth.speaking}, paused=${speechSynth.paused}`), 150);

        } else if (speechSynth.speaking && isSpeaking) {
            // PAUSING (Desktop only)
             console.log("togglePauseSpeech (Desktop): Attempting to pause.");
            removeWordHighlight(); // Remove word highlight on pause
            speechSynth.pause();
            updateSpeechButtonsState();

             // Highlight paragraph after delay
             if (currentChunkIndex >= 0 && currentChunkIndex < chapterChunks.length) {
                 const currentChunkElement = chapterChunks[currentChunkIndex]?.element;
                 if (currentChunkElement) {
                       setTimeout(() => {
                          if(speechSynth.paused && isSpeaking) { // Check state again
                              highlightPausedParagraph(currentChunkElement);
                              console.log("togglePauseSpeech (Desktop): Paused successfully and highlighted.");
                          } else if (isSpeaking) {
                              console.warn("togglePauseSpeech (Desktop): Pause command sent, but synth not paused or state changed.");
                          }
                       }, 100);
                  }
              }
         } else {
             console.warn("togglePauseSpeech (Desktop): Called but synth not in a pausable state.");
             if (!speechSynth.speaking && !speechSynth.paused && isSpeaking) {
                  console.warn("togglePauseSpeech (Desktop): Inconsistent state detected. Forcing stop.");
                  stopSpeech(true); // Cleanup inconsistent state
              }
         }
    }


    // Stop Speech Logic (Robust version)
    function stopSpeech(isInternalCleanup = false) {
        console.log(`stopSpeech: Called. User action: ${!isInternalCleanup}. Current state: isSpeaking=${isSpeaking}, synth.speaking=${speechSynth.speaking}, synth.paused=${speechSynth.paused}`);

        const wasSpeaking = isSpeaking; // Track state before change

        // Set internal state immediately
        isSpeaking = false;
        currentChunkIndex = -1;
        removeHighlighting(); // Clean up visuals

        if ('speechSynthesis' in window && speechSynth) {
            const utteranceToCancel = currentUtterance;
            currentUtterance = null;

            if (utteranceToCancel) {
                // Remove listeners BEFORE cancel
                utteranceToCancel.onboundary = null;
                utteranceToCancel.onend = null;
                utteranceToCancel.onerror = null;
                console.log("stopSpeech: Listeners detached.");
            }

            // Only cancel if synth is actually active
            if (speechSynth.speaking || speechSynth.paused || speechSynth.pending) {
                try {
                    console.log("stopSpeech: Calling speechSynth.cancel().");
                    speechSynth.cancel();
                    console.log("stopSpeech: speechSynth.cancel() executed.");
                } catch (e) {
                     console.error("stopSpeech: Error calling speechSynth.cancel():", e);
                }
            } else {
                console.log("stopSpeech: Synth inactive, no cancel needed.");
            }
        }

        // Reset button visuals if we were speaking or it's a user action
        if (wasSpeaking || !isInternalCleanup) {
            resetSpeechButtonsVisuals();
        }
        console.log("stopSpeech: Function finished.");
    }


    // --- Highlighting Helpers ---
    function removeHighlighting() {
        removeWordHighlight();
        removeParagraphHighlight();
    }
    function removeWordHighlight() {
        if (lastSpokenWordSpan) {
            lastSpokenWordSpan.classList.remove('speaking-word');
            lastSpokenWordSpan = null;
        }
        document.querySelectorAll('.speaking-word').forEach(el => el.classList.remove('speaking-word'));
    }
    function removeParagraphHighlight() {
        if (pausedParagraphElement) {
            pausedParagraphElement.classList.remove('highlighted-text');
            pausedParagraphElement = null;
        }
        document.querySelectorAll('.highlighted-text').forEach(el => el.classList.remove('highlighted-text'));
    }
    function highlightPausedParagraph(element) {
        removeParagraphHighlight(); // Clear previous
        if (element) {
            element.classList.add('highlighted-text');
            pausedParagraphElement = element;
        }
    }


    // --- Speech Button State Management ---
    function updateSpeechButtonsState() {
        const synthAvailable = ('speechSynthesis' in window);
        const contentReady = chapterChunks.length > 0;
        const canPlay = synthAvailable && contentReady;

        // Show Play only if possible and not currently speaking/paused (using isSpeaking flag)
        playButton.style.display = (canPlay && !isSpeaking) ? 'flex' : 'none';

        // Show Pause/Stop only when 'isSpeaking' is true
        const showPauseStop = canPlay && isSpeaking;
        pauseButton.style.display = showPauseStop ? 'flex' : 'none';
        stopButton.style.display = showPauseStop ? 'flex' : 'none';

         // Update pause icon based on actual synth state (relevant mainly for desktop)
         if (showPauseStop) {
             if (speechSynth.paused) {
                 pauseButtonIcon.classList.remove('fa-pause-circle');
                 pauseButtonIcon.classList.add('fa-play-circle'); // Show 'play' icon when paused
             } else {
                 pauseButtonIcon.classList.remove('fa-play-circle');
                 pauseButtonIcon.classList.add('fa-pause-circle'); // Show 'pause' icon when speaking
             }
         }
         // console.log(`Button State Update: Play=${playButton.style.display}, Pause=${pauseButton.style.display}, Stop=${stopButton.style.display}, isSpeaking=${isSpeaking}, synth.paused=${speechSynth.paused}`);
    }

    // Reset buttons to the initial 'Play' state
    function resetSpeechButtonsVisuals() {
       const synthAvailable = ('speechSynthesis' in window);
       const contentReady = chapterChunks.length > 0;
       const canPlay = synthAvailable && contentReady;

       playButton.style.display = canPlay ? 'flex' : 'none'; // Show Play if possible
       pauseButton.style.display = 'none';
       stopButton.style.display = 'none';

       // Reset pause icon to default 'pause'
       pauseButtonIcon.classList.remove('fa-play-circle');
       pauseButtonIcon.classList.add('fa-pause-circle');

       // console.log("Reset Button Visuals: Play shown = " + canPlay);
    }


    // --- Start the Application ---
    initApplication();

});
// --- END OF FILE script.js ---
