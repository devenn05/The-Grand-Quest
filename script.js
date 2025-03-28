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
        selectHeader: document.querySelector('.select-header'),
        currentSelection: document.querySelector('.current-selection'),
        selectOptions: document.querySelector('.select-options'),
        dropdownIcon: document.querySelector('.dropdown-icon')
    };

    const navButtons = {
        prevTop: document.getElementById('prev-btn'),
        nextTop: document.getElementById('next-btn'),
        prevBottom: document.getElementById('prev-btn-bottom'),
        nextBottom: document.getElementById('next-btn-bottom')
    };

    // Configuration
    const config = {
        totalChapters: 100, // Update with your total chapter count
        chapterFolder: 'chapters/', // Folder containing your txt files
        fadeDuration: 500 // Transition time in ms
    };

    let currentChapter = 1;
    let scrollPosition = 0;
    let isScrolling = false;

    // Core Functions
    async function loadChapter(chapterNum) {
        if (chapterNum < 1 || chapterNum > config.totalChapters) return;
        
        try {
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
            chapterElements.title.textContent = title;
            chapterElements.content.innerHTML = content;
            chapterElements.currentSelection.textContent = title;
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

    // Custom Dropdown Functionality
    chapterElements.selectHeader.addEventListener('click', () => {
        chapterElements.selectOptions.classList.toggle('active');
        chapterElements.dropdownIcon.style.transform = 
            chapterElements.selectOptions.classList.contains('active') 
            ? 'rotate(180deg)' 
            : 'rotate(0)';
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            chapterElements.selectOptions.classList.remove('active');
            chapterElements.dropdownIcon.style.transform = 'rotate(0)';
        }
    });

    // Initialize Chapter Dropdown
    async function initChapterDropdown() {
        for (let i = 1; i <= config.totalChapters; i++) {
            try {
                const response = await fetch(`${config.chapterFolder}${i}.txt`);
                if (response.ok) {
                    const text = await response.text();
                    const title = text.split('\n')[0].trim();
                    const option = document.createElement('div');
                    option.className = 'option';
                    option.dataset.value = i;
                    option.textContent = title;
                    option.addEventListener('click', () => {
                        loadChapter(i);
                        chapterElements.selectOptions.classList.remove('active');
                        chapterElements.dropdownIcon.style.transform = 'rotate(0)';
                    });
                    chapterElements.selectOptions.appendChild(option);
                }
            } catch (error) {
                console.error(`Error loading chapter ${i}:`, error);
            }
        }
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

    // Initialize
    async function init() {
        await initChapterDropdown();
        setupNavigation();
        setupScrollEffects(); // Initialize scroll effects
        loadChapter(1);
    }

    init();
});