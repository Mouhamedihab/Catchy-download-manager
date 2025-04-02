# Catchy Download Manager - AI Development Guide

## Core Principles
- Develop an IDM-like download manager with superior download acceleration
- Keep each file under 300 lines of code
- Maintain clean, well-structured code
- Create a beautiful, modern UI with consistent design
- Deliver browser integration with download interception
- Follow best practices for Electron applications

---

## Rule 1: Architecture - Follow Clean Electron Patterns
- **Description**: Strictly separate main and renderer processes with clear IPC boundaries.
- **Details**: Main process handles downloads and filesystem access, renderer handles UI.
- **Action**: Use contextBridge for secure IPC, never expose Node APIs directly.
- **Why**: Proper architecture prevents security issues and makes the app more maintainable.

## Rule 2: Download Acceleration - Multi-Connection Implementation
- **Description**: Implement download acceleration using multiple parallel connections.
- **Details**: Split downloads into segments and use multiple TCP connections for speed.
- **Action**: Create a chunk manager that handles 8-16 simultaneous connections per download.
- **Why**: Download acceleration is IDM's core feature and main selling point.

## Rule 3: Browser Integration - Extension Architecture
- **Description**: Create browser extensions that seamlessly integrate with the application.
- **Details**: Develop extensions for Chrome, Firefox, and Edge with download interception.
- **Action**: Implement a unified extension API with message passing to the main app.
- **Why**: Browser integration is essential for capturing downloads and providing one-click functionality.

## Rule 4: Video Detection - Smart Analysis
- **Description**: Implement video detection algorithms for popular streaming sites.
- **Details**: Create detection patterns for YouTube, Vimeo, and other platforms.
- **Action**: Add content scripts that analyze page content for video sources.
- **Why**: Video download capability is a key IDM feature that users expect.

## Rule 5: UI Components - Follow Design System
- **Description**: Implement UI following the Catchy color scheme and component guidelines.
- **Details**: Use the color palette defined in the roadmap: primary (#00e0ff), background (#161a25), etc.
- **Action**: Create reusable components that follow the design system.
- **Why**: Consistent UI creates a professional, cohesive experience.

## Rule 6: Action Buttons - Ensure Robust Event Handling
- **Description**: Implement action buttons (pause, resume, cancel) with proper UUIDs.
- **Details**: Track action button state transitions and provide clear visual feedback.
- **Action**: Use direct event listeners with proper ID validation before API calls.
- **Why**: Reliable button actions are essential for core usability.

## Rule 7: Progress Display - Optimize UI Updates
- **Description**: Implement segment-aware progress indicators with debounced updates.
- **Details**: Use throttled UI updates to prevent excessive DOM operations.
- **Action**: Add segmented progress bars showing individual connection progress.
- **Why**: Detailed progress display provides critical user feedback for accelerated downloads.

## Rule 8: Credential Management - Secure Storage
- **Description**: Implement secure storage for site credentials needed for downloads.
- **Details**: Store encrypted credentials and handle authentication flows.
- **Action**: Create a secure credential manager with proper encryption.
- **Why**: Many downloads require authentication, and IDM handles this seamlessly.

## Rule 9: Scheduler - Flexible Timing System
- **Description**: Create a powerful scheduler for downloads with fine-grained control.
- **Details**: Allow time-based, event-based, and condition-based scheduling.
- **Action**: Implement a scheduling engine with a clean, intuitive UI.
- **Why**: Advanced scheduling is a key productivity feature in download managers.

## Rule 10: IPC Bridge - Ensure Clean Communication
- **Description**: Create well-typed IPC messages between main and renderer processes.
- **Details**: Validate IDs and data before sending across process boundaries.
- **Action**: Use preload script with contextBridge for secure API access.
- **Why**: Clean IPC prevents common Electron security issues.

## Rule 11: State Management - Use Consistent Patterns
- **Description**: Implement clear download state transitions with proper validation.
- **Details**: Define states (queued, downloading, paused, completed, error) with transitions.
- **Action**: Create state machine for downloads with validation between transitions.
- **Why**: Predictable state changes prevent race conditions.

## Rule 12: Download Engine - Implement IDM-Like Core
- **Description**: Create high-performance download engine with IDM-like capabilities.
- **Details**: Support multi-part downloads, connection reuse, and adaptive segmentation.
- **Action**: Implement dynamic segment sizing based on server response times.
- **Why**: A robust, high-performance download engine is the core feature.

## Rule 13: Error Handling - Provide Clear Feedback
- **Description**: Implement comprehensive error handling with user-friendly messages.
- **Details**: Catch network errors, file system issues, and validation problems.
- **Action**: Display visual error indicators with actionable messages.
- **Why**: Good error handling improves user experience and debugging.

## Rule 14: Performance - Optimize For Speed
- **Description**: Keep UI responsive even with many active downloads or large files.
- **Details**: Batch updates, use virtualized lists for large download queues.
- **Action**: Monitor and optimize render performance, avoid unnecessary re-renders.
- **Why**: Performance directly impacts user perception of application quality.

## Rule 15: Data Persistence - Store Download Information
- **Description**: Implement reliable persistence for download history and state.
- **Details**: Safely store and retrieve download information between app sessions.
- **Action**: Create robust storage layer with error recovery.
- **Why**: Persistence ensures downloads survive app restarts.

## Rule 16: ID Management - Use Proper UUIDs
- **Description**: Use proper UUIDs for download identification, never URLs.
- **Details**: Create UUIDs for new downloads, ensure consistency across IPC boundaries.
- **Action**: Implement ID validation and mapping between display and internal IDs.
- **Why**: Correct ID usage prevents the URL/UUID confusion bug.

## Rule 17: Batch Operations - Multi-Download Support
- **Description**: Implement batch operations for multiple downloads.
- **Details**: Allow users to select multiple downloads and apply actions.
- **Action**: Create batch operations with proper progress tracking.
- **Why**: Batch operations improve productivity for power users.

## Rule 18: Localization - Support Multiple Languages
- **Description**: Implement proper i18n support for all UI elements.
- **Details**: Extract all user-facing strings into locale files.
- **Action**: Use translation system with language detection and switching.
- **Why**: Localization makes the app accessible to international users.

## Rule 19: Testing - Verify Critical Functionality
- **Description**: Test essential features, especially download core and UI interactions.
- **Details**: Focus on validating action buttons, progress display, and download engine.
- **Action**: Create manual test checklist for critical functionality.
- **Why**: Testing prevents regressions in core features.

## Rule 20: Browser API Integration - Download Interception
- **Description**: Implement proper download interception via browser extension APIs.
- **Details**: Use browser.webRequest APIs to detect and intercept downloads.
- **Action**: Create listener patterns compatible with Chrome, Firefox, and Edge.
- **Why**: Seamless download interception is key to IDM-like functionality.

---

### Reference: Catchy Color Scheme
- Primary: #00e0ff
- Primary Hover: #00b8d4
- Background: #161a25
- Panel Background: #1e2230
- Card Background: #2a2f45
- Text Primary: #ebeef5
- Text Secondary: #a0a4b8
- Border: rgba(255, 255, 255, 0.1)
- Success: #4caf50
- Warning: #ff9800
- Error: #f44336