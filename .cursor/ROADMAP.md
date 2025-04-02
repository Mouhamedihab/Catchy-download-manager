# Catchy Download Manager Roadmap

## Core Vision
Catchy is a streamlined, elegant download manager focused on simplicity and performance, inspired by Internet Download Manager (IDM). It provides a beautiful, modern UI while maintaining a clean codebase under 300 lines per file, with powerful download acceleration and browser integration capabilities.

## Architecture Requirements

### Code Structure
- **Modular Design**: Split functionality into logical modules < 300 lines each
- **Clean Code**: Follow consistent naming conventions and code formatting
- **IPC Architecture**: Clear separation between main and renderer processes
- **Electron Best Practices**: Follow Electron security guidelines
- **Extension Architecture**: Pluggable system for browser extensions

### Performance Goals
- **Multi-Threading**: Implement segmented downloading with multiple connections
- **Resource Efficient**: Minimal CPU and memory usage during downloads
- **Responsive UI**: No UI freezing during heavy downloads
- **Throttling**: Smart request throttling to avoid overwhelming servers
- **Debouncing**: UI updates debounced to reduce render overhead
- **Download Acceleration**: Achieve 3-5x faster downloads than browsers

## Core Features

### Phase 1: Essential Download Functionality
- Simple URL input field for adding downloads
- Pause/Resume single downloads
- Cancel ongoing downloads
- Remove completed/failed downloads
- Progress indicators with percentage and visual bar
- Basic download information (size, status)
- Download acceleration with multiple connections

### Phase 2: Browser Integration & Enhanced Experience
- **Browser Extensions** for Chrome, Firefox, and Edge
- Multi-part downloading for speed optimization
- Speed and ETA indicators for active downloads
- Open download folder functionality
- Retry failed downloads
- Persistent download history
- Download queue management
- **Video detection** and downloading from sites
- **Site credentials management** for protected downloads

### Phase 3: Advanced IDM-Like Features
- **Batch downloading** with URL list processing
- **Scheduler** with flexible timing options
- **Speed limiting** options for bandwidth management
- **Download categories** with auto-sorting
- **File type recognition** and handling rules
- **Context menu integration** in browsers
- **Audio extraction** from video files
- **Automatic virus scanning** of downloads
- **Site grabber** to download complete websites

### Phase 4: User Experience Features
- Localization support (multiple languages)
- Dark/light theme support
- Download categories and filtering
- Download scheduling
- **Floating mini-downloader** for quick access
- **Remote control** via web interface
- Automatic file categorization

## UI Requirements

### Color Scheme
- **Primary Color**: Teal/Cyan (#00e0ff)
- **Primary Hover**: Darker teal (#00b8d4)
- **Background Dark**: Deep blue-gray (#161a25)
- **Panel Background**: Slightly lighter blue-gray (#1e2230)
- **Card Background**: Medium blue-gray (#2a2f45)
- **Text Primary**: Almost white (#ebeef5)
- **Text Secondary**: Muted gray (#a0a4b8)
- **Border Color**: Subtle white with transparency (rgba(255, 255, 255, 0.1))
- **Success Color**: Green (#4caf50)
- **Warning Color**: Orange (#ff9800)
- **Error Color**: Red (#f44336)

### UI Components
- **Header**: App title with language selector
- **Input Section**: URL input field with add button
- **Downloads Section**: Tabular list of downloads
- **Table Columns**: Filename, Status, Progress, Size, Actions
- **Action Buttons**: Pause, Resume, Cancel, Retry, Remove, Open Folder
- **Progress Bar**: Visual representation of download progress with segments
- **Speed Display**: Download speed with clear formatting
- **ETA Display**: Estimated time remaining
- **Status Badges**: Color-coded status indicators
- **Browser Button**: UI for grabbing downloads from browser
- **Video Detector**: Notification when videos are detected

### Interaction Design
- **Button Feedback**: Clear visual feedback on hover/click
- **Smooth Transitions**: State changes use subtle animations
- **Responsive Layout**: Adapts to different window sizes
- **Consistent Spacing**: Uniform padding and margins
- **Clear Hierarchies**: Visual importance reflected in size/color
- **Interactive Segments**: Show multiple connection progress in bars

## Technical Implementation

### Main Process (Node.js)
- Download engine implementation with acceleration
- File system operations
- Network request handling with multiple connections
- Data persistence layer
- Browser integration handlers
- Video detection algorithms

### Renderer Process (HTML/CSS/JS)
- User interface components
- Download list rendering
- Progress updates and animations
- User input handling
- Video detection UI components

### Browser Extensions
- Chrome extension module
- Firefox extension module
- Edge extension module
- Download interception architecture
- Video detection content scripts

### IPC Communication
- Well-defined messages between processes
- Properly typed data structures
- Error handling across IPC boundary
- Debounced/throttled updates
- Extension communication protocols

## Quality Standards
- No URL vs UUID ID confusion
- Error states clearly communicated to users
- Responsive buttons with proper event handling
- Performance monitoring for UI updates
- Caching strategies for repeated data
- Acceleration benchmarks showing speed improvements

## Future Expansions
- Torrent support
- Cloud service integrations (Google Drive, Dropbox)
- Advanced video detection for streaming services
- More browser support (Safari, Opera)
- Mobile companion app
- Batch operations with templates
- Advanced scheduling with conditional rules 