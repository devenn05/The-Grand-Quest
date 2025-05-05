# The Grand Quest - Novel Reader Web Page
https://tgq.netlify.app/

![Cover Image](icons/cover.jpeg)
 
*A custom-built web app for my fantasy novel, blending immersive storytelling with modern web development.*

## ✨ Features

### **Reading Experience**
- 📖 **Dynamic Chapter Loading**: Markdown → HTML rendering with `marked.js`
- 🔊 **Text-to-Speech (TTS)**:
  - Word/paragraph highlighting (desktop)
  - Mobile-optimized playback controls
  - Auto-scrolls to current passage
- 🎨 **Customizable UI**:
  - **3 Themes**: Warm (cozy), Light (clean), Dark (low-light)
  - **12+ Fonts**: From elegant *Poiret One* to playful *Bubblegum Sans*
  - Adjustable text size (A+/A- buttons)
  - ✨ **Animations**: Smooth transitions between chapters and pages
  - 📱 **Responsive Design**: Optimized for both desktop and mobile

### **Navigation**
- 📚 **Chapter Sidebar**: Quick jump to any chapter
- 🔄 **Progress Tracking**: Remembers last-read chapter via `localStorage`
- ➡️ **Seamless Navigation**: Prev/next chapter buttons

## Technical Stack
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **Libraries**: 
  - [marked.js](https://marked.js.org/) - Markdown rendering
  - [Font Awesome](https://fontawesome.com/) - Icons
  - [Google Fonts](https://fonts.google.com/) - Custom typography
- 🛠 **Vanilla JS**: Zero frameworks – pure DOM manipulation
- 🎭 **CSS Variables**: Theming with `var(--theme-color)`
- 📱 **Mobile-First Design**: Responsive sidebar & TTS fallbacks
- ⚡ **Performance**: Chunked TTS processing for long chapters

## About the Project

As both a writer and developer, I created this project to:
- Share my fantasy fiction novel with readers
- Showcase my frontend development skills
- Combine my creative writing with technical implementation
