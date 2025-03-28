document.addEventListener('DOMContentLoaded', function() {
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

    // Configuration
    const config = {
        chapterFolder: 'chapters/', // Folder containing your txt files
        fadeDuration: 500 // Transition time in ms
    };

    let currentChapter = 1;
    let scrollPosition = 0;
    let isScrolling = false;

    // Function to detect available chapters
    async function detectAvailableChapters() {
        let chapterCount = 0;
        let chapterNumbers = [];
        
        // We'll check up to 1000 chapters (adjust if needed)
        for (let i = 1; i <= 1000; i++) {
            try {
                const response = await fetch(`${config.chapterFolder}${i}.txt`);
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
        
        return {
            count: chapterCount,
            numbers: chapterNumbers
        };
    }

    // Core Functions
    async function loadChapter(chapterNum) {
        if (chapterNum < 1) return;
        
        // Handle case where no chapters exist
        if (config.totalChapters === 0) {
            chapterElements.title.textContent = 'No Chapters Available';
            chapterElements.content.innerHTML = '<p class="coming-soon">Check back later for new content!</p>';
            updateNavButtons();
            return;
        }
        
        // Special case for when we're past the last chapter
        if (chapterNum > config.totalChapters) {
            chapterElements.title.textContent = 'New Chapter Coming Soon';
            chapterElements.content.innerHTML = '<p class="coming-soon">Story in progress</p>';
            currentChapter = config.totalChapters;
            updateNavButtons();
            return;
        }
        
        try {
            // Set loading state
            chapterElements.title.textContent = 'Loading...';
            chapterElements.title.classList.add('loading-blink');
            chapterElements.content.innerHTML = '<p class="loading-blink">Loading content...</p>';
            
            // Start fade out
            chapterElements.container.classList.add('fade-out');
            await new Promise(resolve => setTimeout(resolve, config.fadeDuration));
            
            // Load chapter content
            const response = await fetch(`${config.chapterFolder}${chapterNum}.txt`);
            if (!response.ok) throw new Error("Chapter not found");
            
            const text = await response.text();
            const lines = text.split('\n');
            const title = lines[0].trim();
            const content = formatContent(lines.slice(1).join('\n'));
            
            // Update UI
            chapterElements.title.classList.remove('loading-blink');
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
            chapterElements.title.classList.remove('loading-blink');
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
        
        // If we're at the last chapter, update the UI
        if (isLast && config.totalChapters > 0) {
            chapterElements.title.textContent = 'New Chapter Coming Soon';
            chapterElements.content.innerHTML = '<p class="coming-soon">Story in progress</p>';
        }
    }

    // Scroll-based fade effects
    function setupScrollEffects() {
        const contentElements = [
            chapterElements.title, 
            chapterElements.content, 
            ...document.querySelectorAll('#novel-text p')
        ];

        function handleScroll() {
            if (isScrolling) return;
            isScrolling = true;
            
            requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                const windowHeight = window.innerHeight;
                const documentHeight = document.body.scrollHeight;
                
                contentElements.forEach((el, index) => {
                    const rect = el.getBoundingClientRect();
                    const elementTop = rect.top;
                    const elementBottom = rect.bottom;
                    
                    // Calculate visibility ratio (0 to 1)
                    const visibleHeight = Math.min(elementBottom, windowHeight) - Math.max(elementTop, 0);
                    const visibilityRatio = Math.min(1, visibleHeight / rect.height);
                    
                    // Apply fade effect based on position
                    if (elementTop < windowHeight / 2) {
                        // Elements above center - fade as they scroll up
                        const fadeAmount = 1 - (windowHeight/2 - elementTop) / (windowHeight/2);
                        el.style.opacity = Math.max(0.3, fadeAmount);
                        el.style.transform = `translateY(${10 * (1 - fadeAmount)}px)`;
                    } else {
                        // Elements below center - fade as they scroll down
                        const fadeAmount = 1 - (elementTop - windowHeight/2) / (windowHeight/2);
                        el.style.opacity = Math.max(0.3, fadeAmount);
                        el.style.transform = `translateY(${-10 * (1 - fadeAmount)}px)`;
                    }
                });
                
                isScrolling = false;
            });
        }

        // Throttle scroll events for performance
        let isThrottled = false;
        window.addEventListener('scroll', () => {
            if (!isThrottled) {
                handleScroll();
                isThrottled = true;
                setTimeout(() => { isThrottled = false; }, 50);
            }
        });

        // Initial setup
        handleScroll();
    }

    // Navigation Buttons
    function setupNavigation() {
        const handleNav = (direction) => {
            const newChapter = currentChapter + direction;
            if (newChapter >= 1) {  // Removed upper limit check (handled in loadChapter)
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

    async function initChapterList(chapterNumbers) {
        for (const i of chapterNumbers) {
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

    // Initialize
    async function init() {
        // Detect available chapters first
        const chapters = await detectAvailableChapters();
        config.totalChapters = chapters.count;
        
        // Now proceed with the rest of initialization
        setupNavigation();
        setupScrollEffects();
        await initChapterList(chapters.numbers);
        
        // Set initial loading state
        chapterElements.title.classList.add('loading-blink');
        chapterElements.content.innerHTML = '<p class="loading-blink">Here you go!...</p>';
        
        loadChapter(1);
        
        // Sidebar toggle functionality
        document.querySelector('.menu-toggle').addEventListener('click', () => {
            chapterElements.sidebar.classList.add('active');
            chapterElements.overlay.classList.add('active');
        });
        
        document.querySelector('.close-sidebar').addEventListener('click', closeSidebar);
        chapterElements.overlay.addEventListener('click', closeSidebar);
    }

    init();
});
