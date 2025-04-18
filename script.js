document.addEventListener('DOMContentLoaded', function() {
    // Theme Switcher
    const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
    const themeText = document.getElementById('theme-text');

    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        toggleSwitch.checked = true;
        themeText.textContent = 'Light Mode';
    }

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

    // Configuration
    const config = {
        chapterFolder: 'chapters/',
        chapterExtension: '.md',
        fadeDuration: 500
    };

    let currentChapter = 1;
    let totalChapters = 0;

    // Chapter detection
    async function detectAvailableChapters() {
        let chapterCount = 0;
        let chapterNumbers = [];
        
        for (let i = 1; i <= 100; i++) {
            try {
                const response = await fetch(`${config.chapterFolder}${i}${config.chapterExtension}`);
                if (response.ok) {
                    chapterCount = i;
                    chapterNumbers.push(i);
                } else {
                    break;
                }
            } catch (error) {
                break;
            }
        }
        return { count: chapterCount, numbers: chapterNumbers };
    }

    // Chapter loading
    async function loadChapter(chapterNum) {
        const previousChapter = currentChapter;
        
        if (chapterNum < 1) return;
        
        if (totalChapters === 0) {
            chapterElements.title.textContent = 'No Chapters Available';
            chapterElements.content.innerHTML = '<p class="coming-soon">Check back later for new content!</p>';
            updateNavButtons();
            return;
        }
        
        if (chapterNum > totalChapters) {
            chapterElements.title.textContent = 'New Chapter Coming Soon';
            chapterElements.content.innerHTML = '<p class="coming-soon">Story in progress</p>';
            currentChapter = totalChapters;
            updateNavButtons();
            return;
        }
        
        try {
            chapterElements.title.textContent = 'Loading...';
            chapterElements.title.classList.add('loading-blink');
            chapterElements.content.innerHTML = '<p class="loading-blink">Loading content...</p>';
            
            chapterElements.container.classList.add('fade-out');
            await new Promise(resolve => setTimeout(resolve, config.fadeDuration));
            
            const response = await fetch(`${config.chapterFolder}${chapterNum}${config.chapterExtension}`);
            if (!response.ok) throw new Error("Chapter not found");
            
            const text = await response.text();
            const lines = text.split('\n');
            const title = lines[0].trim();
            const content = formatContent(lines.slice(1).join('\n'));
            
            chapterElements.title.classList.remove('loading-blink');
            chapterElements.title.textContent = title;
            chapterElements.content.innerHTML = content;
            currentChapter = chapterNum;
            
            // Save progress
            localStorage.setItem('lastChapter', currentChapter);
            
            // Cleanup old scroll position
            localStorage.removeItem(`chapterScroll_${previousChapter}`);
            
            updateNavButtons();
            chapterElements.container.classList.remove('fade-out');

            // Restore scroll position
            const savedScroll = localStorage.getItem(`chapterScroll_${currentChapter}`);
            if (savedScroll) {
                window.scrollTo(0, savedScroll);
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            // Save scroll position
            window.addEventListener('scroll', () => {
                localStorage.setItem(`chapterScroll_${currentChapter}`, window.scrollY);
            });
            
        } catch (error) {
            console.error("Error loading chapter:", error);
            chapterElements.title.classList.remove('loading-blink');
            chapterElements.content.innerHTML = `<p class="error">Error loading chapter. Please try again.</p>`;
            chapterElements.container.classList.remove('fade-out');
        }
    }

    function formatContent(text) {
        return marked.parse(text);
    }

    function updateNavButtons() {
        const isFirst = currentChapter <= 1;
        const isLast = currentChapter >= totalChapters;
        
        [navButtons.prevTop, navButtons.prevBottom].forEach(btn => {
            btn.style.display = isFirst ? 'none' : 'flex';
        });
        
        [navButtons.nextTop, navButtons.nextBottom].forEach(btn => {
            btn.style.display = isLast ? 'none' : 'flex';
        });
    }

    // Navigation Setup
    function setupNavigation() {
        const handleNav = (direction) => {
            const newChapter = currentChapter + direction;
            if (newChapter >= 1 && newChapter <= totalChapters) {
                loadChapter(newChapter);
            }
        };
        
        navButtons.prevTop.addEventListener('click', () => handleNav(-1));
        navButtons.nextTop.addEventListener('click', () => handleNav(1));
        navButtons.prevBottom.addEventListener('click', () => handleNav(-1));
        navButtons.nextBottom.addEventListener('click', () => handleNav(1));
    }

    // Initialize Chapter List
    async function initChapterList(chapterNumbers) {
        chapterElements.chapterList.innerHTML = '';
        
        for (const chapterNum of chapterNumbers) {
            try {
                const response = await fetch(`${config.chapterFolder}${chapterNum}${config.chapterExtension}`);
                if (response.ok) {
                    const text = await response.text();
                    const title = text.split('\n')[0].trim();
                    
                    const item = document.createElement('div');
                    item.className = 'chapter-item';
                    item.textContent = `Chapter ${chapterNum} - ${title}`;
                    item.addEventListener('click', () => {
                        loadChapter(chapterNum);
                        closeSidebar();
                    });
                    
                    chapterElements.chapterList.appendChild(item);
                }
            } catch (error) {
                console.error(`Error loading chapter ${chapterNum}:`, error);
            }
        }
    }

    function closeSidebar() {
        chapterElements.sidebar.classList.remove('active');
        chapterElements.overlay.classList.remove('active');
    }

    // Initialize
    async function init() {
        // Detect available chapters
        const chapters = await detectAvailableChapters();
        totalChapters = chapters.count;
        
        // Setup navigation
        setupNavigation();
        
        // Initialize chapter list
        await initChapterList(chapters.numbers);
        
        // Load saved or first chapter
        const savedChapter = Math.min(
            parseInt(localStorage.getItem('lastChapter')) || 1,
            totalChapters
        );
        loadChapter(savedChapter);
        
        // Sidebar toggle
        document.querySelector('.menu-toggle').addEventListener('click', () => {
            chapterElements.sidebar.classList.add('active');
            chapterElements.overlay.classList.add('active');
        });
        
        document.querySelector('.close-sidebar').addEventListener('click', closeSidebar);
        chapterElements.overlay.addEventListener('click', closeSidebar);
    }

    init();
});
