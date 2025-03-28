document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const config = {
        totalChapters: 100,
        chapterFolder: 'chapters/',
        fadeDuration: 500
    };

    // Theme Switcher
    const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
    const themeText = document.getElementById('theme-text');

    // Set initial theme
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        toggleSwitch.checked = true;
        themeText.textContent = 'Light Mode';
    }

    // Theme switch function
    toggleSwitch.addEventListener('change', function(e) {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            themeText.textContent = 'Light Mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeText.textContent = 'Dark Mode';
        }
    });

    // Chapter System Elements
    const chapterElements = {
        title: document.getElementById('chapter-title'),
        content: document.getElementById('novel-text'),
        container: document.querySelector('.chapter-content'),
        sidebar: document.querySelector('.sidebar-menu'),
        overlay: document.querySelector('.sidebar-overlay'),
        chapterList: document.querySelector('.chapter-list')
    };

    const navButtons = {
        prevTop: document.getElementById('prev-btn'),
        nextTop: document.getElementById('next-btn'),
        prevBottom: document.getElementById('prev-btn-bottom'),
        nextBottom: document.getElementById('next-btn-bottom')
    };

    let currentChapter = 1;
    let isScrolling = false;

    // Chapter Loading with Cache
    async function loadChapter(chapterNum) {
        if (chapterNum < 1 || chapterNum > config.totalChapters) return;
        
        try {
            // Start fade out
            chapterElements.container.classList.add('fade-out');
            await new Promise(resolve => setTimeout(resolve, config.fadeDuration));
            
            // Try to get from cache first
            const cacheKey = `chapter-${chapterNum}`;
            const cached = sessionStorage.getItem(cacheKey);
            let text;
            
            if (cached) {
                text = cached;
            } else {
                // Load from network
                const response = await fetch(`${config.chapterFolder}${chapterNum}.txt`);
                if (!response.ok) throw new Error("Chapter not found");
                text = await response.text();
                // Cache it
                sessionStorage.setItem(cacheKey, text);
            }
            
            const lines = text.split('\n');
            const title = lines[0].trim();
            const content = formatContent(lines.slice(1).join('\n'));
            
            // Update UI
            chapterElements.title.textContent = title;
            chapterElements.content.innerHTML = content;
            currentChapter = chapterNum;
            
            // Update button states
            updateNavButtons();
            
            // Fade in new content
            chapterElements.container.classList.remove('fade-out');
            
            // Reset scroll position
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            console.error("Error loading chapter:", error);
            chapterElements.content.innerHTML = 
                `<p class="error">Error loading chapter. Please try again.</p>`;
            chapterElements.container.classList.remove('fade-out');
        }
    }

    function formatContent(text) {
        return text.split('\n\n')
            .map(para => para.trim())
            .filter(para => para.length > 0)
            .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    function updateNavButtons() {
        const isFirst = currentChapter <= 1;
        const isLast = currentChapter >= config.totalChapters;
        
        [navButtons.prevTop, navButtons.prevBottom].forEach(btn => {
            btn.style.display = isFirst ? 'none' : 'flex';
        });
        
        [navButtons.nextTop, navButtons.nextBottom].forEach(btn => {
            btn.style.display = isLast ? 'none' : 'flex';
        });
    }

    // Scroll effects (unchanged from your original)
    function setupScrollEffects() {
        /* ... keep your existing scroll effect code ... */
    }

    // Navigation Buttons
    function setupNavigation() {
        const handleNav = (direction) => {
            const newChapter = currentChapter + direction;
            if (newChapter >= 1 && newChapter <= config.totalChapters) {
                loadChapter(newChapter);
            }
        };
        
        navButtons.prevTop.addEventListener('click', () => handleNav(-1));
        navButtons.nextTop.addEventListener('click', () => handleNav(1));
        navButtons.prevBottom.addEventListener('click', () => handleNav(-1));
        navButtons.nextBottom.addEventListener('click', () => handleNav(1));
    }

    // Sidebar Functions
    function closeSidebar() {
        chapterElements.sidebar.classList.remove('active');
        chapterElements.overlay.classList.remove('active');
    }

    async function initChapterList() {
        for (let i = 1; i <= config.totalChapters; i++) {
            try {
                const response = await fetch(`${config.chapterFolder}${i}.txt`);
                if (response.ok) {
                    const text = await response.text();
                    const title = text.split('\n')[0].trim();
                    const item = document.createElement('div');
                    item.className = 'chapter-item';
                    item.textContent = `Chapter ${i} - ${title}`;
                    item.addEventListener('click', () => {
                        loadChapter(i);
                        closeSidebar();
                    });
                    chapterElements.chapterList.appendChild(item);
                }
            } catch (error) {
                console.error(`Error loading chapter ${i}:`, error);
            }
        }
    }

    // Initialize Service Worker
    function initServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful');
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        }
    }

    // Main Initialization
    async function init() {
        initServiceWorker();
        setupNavigation();
        setupScrollEffects();
        await initChapterList();
        loadChapter(1);
        
        // Sidebar events
        document.querySelector('.menu-toggle').addEventListener('click', () => {
            chapterElements.sidebar.classList.add('active');
            chapterElements.overlay.classList.add('active');
        });
        
        document.querySelector('.close-sidebar').addEventListener('click', closeSidebar);
        chapterElements.overlay.addEventListener('click', closeSidebar);
    }

    init();
});