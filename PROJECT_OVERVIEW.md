# FaceFeed - PROJECT OVERVIEW

## 1. Project Title and Description

**FaceFeed** (also known as "Insight" in some configurations) is an iOS social networking application focused on photo-based interactions and messaging between users. It's a location-aware social platform that allows users to discover, connect with, and message people nearby through photo profiles.

### What Problem Does It Solve?

FaceFeed addresses the challenge of connecting with people in your local community through a visual-first approach. The app enables users to:
- Discover and browse through profiles of people nearby using location services
- Send and receive photo-based messages ("faces")
- Build a network of friends and followers
- Track engagement through ranking and scoring systems
- Communicate through a conversation-based inbox system

## 2. Key Features

### Core Features
- **Photo-Based Feed**: Browse through user profiles with photo-based cards
- **Messaging System**: Send messages and "Hi" greetings to other users
- **Inbox Management**: Organize conversations with friends and followers
- **Friend System**: Add, remove, and manage friend connections
- **Follow/Unfollow**: Follow users to see their updates
- **Ranking System**: Score-based ranking to track user engagement
- **Location-Based Discovery**: Find users nearby based on geolocation
- **Community/School Integration**: Join communities and schools
- **Blast Messages**: Send messages to multiple friends at once
- **Push Notifications**: Real-time notifications for new messages and interactions

### Feed Types
- **Active Now**: See users who are currently active in your area
- **Trending**: Browse trending profiles
- **My Feed**: Personalized feed based on preferences

### User Management
- **Onboarding Flow**: Multi-step signup process (name, age, gender, interests, profile picture)
- **Profile Pictures**: S3-based image storage and management
- **User Stats**: Track follower count, friend count, score, and rank
- **Block/Ignore**: Privacy controls for unwanted interactions

## 3. Technology Stack

### Language & Platform
- **Language**: Objective-C
- **Platform**: iOS (minimum iOS 6.0)
- **IDE**: Xcode

### Frameworks & Libraries

#### Core Apple Frameworks
- **UIKit**: UI components and navigation
- **Foundation**: Core data types and utilities
- **CoreData**: Local data persistence (20+ model versions)
- **CoreLocation**: Location services

#### Third-Party Dependencies (CocoaPods)
- **AFNetworking (~> 2.0)**: Network communication and API client
- **SDWebImage (~> 3.7)**: Asynchronous image loading and caching
- **PBJVision**: Camera and video capture capabilities
- **UICKeyChainStore**: Secure token storage in iOS keychain
- **HockeySDK**: Crash reporting and beta distribution
- **Mixpanel**: User analytics and event tracking
- **FXBlurView (~> 1.6)**: Visual blur effects
- **AWS SDK**: S3 integration for image storage (AWSRuntime.framework, AWSS3.framework)

### Backend & API
- **Base URL**: `https://facefeed.io/facefeed/v3/`
- **API Version**: v3
- **Communication**: RESTful API using AFNetworking
- **Image Storage**: Amazon S3

## 4. Project Structure

### Directory Organization

```
FaceFeed Test/
├── Core Application
│   ├── TWAppDelegate.h/m          # Application lifecycle management
│   ├── main.m                     # App entry point
│   └── FaceFeed-Prefix.pch       # Precompiled header
│
├── Data Layer
│   ├── FaceFeed.xcdatamodeld/    # Core Data models (20 versions)
│   ├── TWPersistentStack.h/m     # Core Data stack management
│   ├── TWFaceFeedDatabaseAvailability.h # Database availability notifications
│   └── Model Entities:
│       ├── Conversation.h/m       # Conversation entity
│       ├── Friend.h/m            # Friend entity
│       ├── CachedMessage.h/m     # Message caching
│       └── SendingStatus.h/m     # Message status tracking
│
├── Networking
│   ├── TJWFeedAPIClient.h/m      # API client singleton
│   ├── ContextS3Manager.h/m      # S3 upload management
│   └── API Categories:
│       ├── Conversation+FaceFeed.h/m  # Conversation API calls
│       └── Friend+FaceFeed.h/m        # Friend API calls
│
├── View Controllers (32+ VCs)
│   ├── Feed:
│   │   ├── TJWFeedTableViewController.h/m
│   │   ├── TJWFeedFilterTableViewController.h/m
│   │   └── TJWPagingContainerViewController.h/m
│   ├── Messaging:
│   │   ├── TJWInboxCDTableViewController.h/m
│   │   ├── TJWConversationComposeViewController.h/m
│   │   ├── TJWFaceComposeViewController.h/m
│   │   └── TJWBlastFriendsComposeViewController.h/m
│   ├── Social:
│   │   ├── TJWFriendsCDTableViewController.h/m
│   │   ├── TJWFollowersTableViewController.h/m
│   │   ├── TJWRankTableViewController.h/m
│   │   └── TJWCommunityTableViewController.h/m
│   ├── Discovery:
│   │   ├── TJWSearchTableViewController.h/m
│   │   ├── TJWSearchResultTableViewController.h/m
│   │   └── TJWSearchContactsViewController.h/m
│   ├── Onboarding:
│   │   ├── TJWOnboardingViewController.h/m
│   │   ├── TJWOnboardingNameViewController.h/m
│   │   ├── TJWOnboardingAgeViewController.h/m
│   │   ├── TJWOnboardingMyGenderViewController.h/m
│   │   └── TJWOnboardingTargetGenderViewController.h/m
│   └── Settings:
│       ├── TJWSettingsTableViewController.h/m
│       ├── TJWAboutTableViewController.h/m
│       └── TJWPolicyViewController.h/m
│
├── Models & Business Logic
│   ├── TJWFace.h/m                # Main face/profile model
│   ├── TJWCachedFaceMessage.h/m   # Cached message model
│   ├── TJWStats.h/m               # User statistics
│   ├── TJWFeedInfo.h/m            # Feed metadata
│   └── TJWMessage.h/m             # Message model
│
├── Views & UI Components
│   ├── Table View Cells:
│   │   ├── TJWSplitFeedTableViewCell.h/m
│   │   ├── TJWNotificationTableViewCell.h/m
│   │   └── TJWFollowerSearchResultTableViewCell.h/m
│   ├── Custom Views:
│   │   ├── TJWArrowView.h/m
│   │   ├── TJWBadgeView.h/m
│   │   ├── TJWBubbleItemView.h/m
│   │   ├── TJWScoreRankView.h/m
│   │   └── TJWFeedHeaderView.h/m
│   └── Overlays:
│       ├── TJWBlastTutorialView.h/m
│       └── TJWFailedLoadingView.h/m
│
├── Utilities & Helpers
│   ├── TJWUserDefaultHelper.h/m   # User preferences management
│   ├── TJWMixPanelHelper.h/m     # Analytics tracking
│   ├── TJWLocationHelper.h/m     # Location services
│   ├── ModelMacros.h             # Core Data macros
│   └── Category Extensions:
│       ├── NSDate+TJWConvenience.h/m
│       ├── NSString+TJWConvenience.h/m
│       ├── UIImage+TJWConvenience.h/m
│       ├── UIFont+Custom.h/m
│       └── UIDevice+Hardware.h/m
│
├── Notifications
│   ├── TJWFeedNotificationGenerator.h/m
│   ├── TJWFollowNotification.h/m
│   ├── TJWFauxFaceNotification.h/m
│   └── TJWFaceFeedRemoteNotificationReceived.h
│
├── Resources
│   ├── Images.xcassets/          # Image assets (65+ image sets)
│   ├── iPhone.storyboard         # Main storyboard
│   ├── FaceFeed-Info.plist       # App configuration
│   ├── Localizable.strings       # Localization
│   └── Fonts:
│       ├── FF_DIN_Condensed_Regular.otf
│       └── ff_din_condensed_bold.ttf
│
└── Supporting Files
    ├── en.lproj/                  # English localization
    └── Activity Providers:
        └── APActivityProvider.h/m

FaceFeed Unit Tests/
└── TJWFaceTestCase.m              # Unit tests for Face model

External Frameworks/
├── AWSRuntime.framework/
└── AWSS3.framework/

Configuration Files/
├── Podfile                        # CocoaPods dependencies
├── Podfile.lock                   # Locked dependency versions
├── FaceFeed.xcodeproj/            # Xcode project
└── FaceFeed.xcworkspace/          # Xcode workspace
```

### Key Files and Their Purposes

| File | Purpose |
|------|---------|
| `TWAppDelegate.m` | Application lifecycle, Core Data initialization, push notifications, analytics setup |
| `TJWFeedAPIClient.m` | Centralized API client with base URL and endpoint definitions |
| `TWPersistentStack.m` | Core Data stack with main and background contexts |
| `TJWFace.m` | Primary model for user profiles/faces with network fetch methods |
| `Conversation+FaceFeed.m` | Core Data category with API integration for conversations |
| `Friend+FaceFeed.m` | Core Data category with API integration for friend management |
| `TJWFeedTableViewController.m` | Main feed display with infinite scrolling |
| `TJWInboxCDTableViewController.m` | Inbox management with Core Data fetched results |
| `TJWOnboardingViewController.m` | User registration and onboarding flow |
| `ContextS3Manager.m` | S3 image upload handling |

## 5. Getting Started

### Prerequisites
- Xcode (iOS development environment)
- CocoaPods installed (`gem install cocoapods`)
- iOS device or simulator running iOS 6.0+
- Apple Developer account (for device testing)

### Installation Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**
   ```bash
   pod install
   ```

3. **Open workspace**
   ```bash
   open FaceFeed.xcworkspace
   ```
   **Important**: Use `.xcworkspace`, not `.xcodeproj`

4. **Configure API endpoints** (if needed)
   - Edit `TJWFeedAPIClient.m` to change the base API URL
   - Current production: `https://facefeed.io/facefeed/v3/`

5. **Configure third-party services**
   - **HockeyApp**: Update identifiers in `TWAppDelegate.m` (lines 347)
   - **Mixpanel**: Update token in `TWAppDelegate.m` (line 26)
   - **AWS S3**: Configure credentials in `ContextS3Manager.m`

### Environment Variables & Configuration

#### Info.plist Settings
- **Bundle Identifier**: `com.contextlabs.Insight-beta`
- **Display Name**: "Facefeed Beta"
- **Version**: 2.23
- **Location Usage**: Required for nearby user discovery
- **Required Capabilities**: armv7, front-facing-camera
- **Custom Fonts**: DIN Condensed (Regular and Bold)

#### Required Permissions
- **Location Services**: For finding nearby users
- **Camera**: For profile pictures and photo messages
- **Push Notifications**: For real-time message alerts

### How to Run

1. Select the `FaceFeed Test` scheme in Xcode
2. Choose a target device/simulator
3. Press `Cmd+R` to build and run
4. The app will launch with the onboarding flow (unless already logged in)

### Testing with Pre-configured Accounts

The code includes commented-out test tokens in `TWAppDelegate.m`:
- Sophia's account
- Teddy's account
- Teddy's Jean account

These can be uncommented for development testing.

## 6. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ View         │  │ Table View   │  │ Custom Views │      │
│  │ Controllers  │  │ Cells        │  │ & Overlays   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           ↓↑
┌─────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ TJWFace      │  │ Conversation │  │ Friend       │      │
│  │ Model        │  │ Categories   │  │ Categories   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Stats &      │  │ Notification │  │ Location     │      │
│  │ Analytics    │  │ Handlers     │  │ Services     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           ↓↑
┌─────────────────────────────────────────────────────────────┐
│                        Data Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Core Data    │  │ Network      │  │ S3 Image     │      │
│  │ (Persistent  │  │ (API Client) │  │ Storage      │      │
│  │ Stack)       │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Keychain     │  │ User         │                         │
│  │ (Auth)       │  │ Defaults     │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                           ↓↑
┌─────────────────────────────────────────────────────────────┐
│                      External Services                       │
│  [FaceFeed API] [AWS S3] [Mixpanel] [HockeyApp] [APNs]      │
└─────────────────────────────────────────────────────────────┘
```

### Component Interactions

#### 1. **Data Flow: Viewing the Feed**
```
User Opens App → TJWFeedTableViewController
    ↓
TJWFace.facesFromFeed() → TJWFeedAPIClient
    ↓
AFNetworking → FaceFeed API (GET /feed)
    ↓
JSON Response → TJWFace objects
    ↓
UITableView displays cells → SDWebImage loads photos
```

#### 2. **Data Flow: Sending a Message**
```
User Taps Message → TJWFaceComposeViewController
    ↓
Capture/Select Photo → ContextS3Manager
    ↓
Upload to S3 → Returns image URL
    ↓
TJWFeedAPIClient POST /reply
    ↓
Create/Update Conversation in Core Data
    ↓
Update UI & send Mixpanel event
```

#### 3. **Core Data Stack**
```
TWPersistentStack
    ├── Main Context (UI Thread)
    │   └── Used by all View Controllers
    │
    └── Background Context (Background Thread)
        └── Used for network fetch processing
            ↓
        Changes merge via notifications
```

### Design Patterns Used

- **Singleton**: `TJWFeedAPIClient`, `Mixpanel`, `HockeySDK`
- **Delegate Pattern**: Extensive use for VC communication
- **Category Pattern**: Core Data model extensions (e.g., `Friend+FaceFeed`)
- **MVC Architecture**: Clear separation of Model, View, Controller
- **Repository Pattern**: Core Data entities act as repositories
- **Observer Pattern**: NSNotificationCenter for database availability, remote notifications

## 7. Code Quality & Practices

### Coding Standards

#### Naming Conventions
- **Prefix**: `TJW` (Teddy J Wyly) or `TW` for most custom classes
- **Properties**: camelCase (e.g., `numberOfInboxMessages`)
- **Methods**: camelCase with descriptive names
- **Constants**: Uppercase with prefix (e.g., `MIXPANEL_OPEN_APP`)

#### Code Organization
- **Header files (.h)**: Clean interfaces with minimal exposed properties
- **Implementation files (.m)**: Private properties in class extensions
- **Categories**: Logical separation of concerns (e.g., API methods in categories)
- **Comments**: Header comments include author and copyright

### Testing Approach

#### Current State
- **Unit Tests**: Minimal test coverage
  - `FaceFeed Unit Tests/` directory exists
  - Contains `TJWFaceTestCase.m`
  - Test infrastructure is present but underutilized

#### Analytics & Monitoring
- **Mixpanel Integration**: Comprehensive event tracking
  - User actions (app opens, message sends, swipes)
  - User properties (rank, score, friend count)
  - First-time user experience tracking
- **HockeyApp Integration**: Crash reporting and beta distribution
  - Automatic crash reports
  - Beta build distribution

### Notable Patterns & Practices

#### Strengths
1. **Core Data Migration**: 20 model versions showing careful schema evolution
2. **Background Processing**: Proper use of background MOC for network operations
3. **Memory Management**: Use of weak delegates to prevent retain cycles
4. **Security**: Token storage in keychain (via UICKeyChainStore)
5. **Image Optimization**: SDWebImage for caching and async loading
6. **API Abstraction**: Centralized API client with constant definitions
7. **Analytics**: Comprehensive event and user tracking
8. **Error Handling**: Network error callbacks throughout

#### Areas of Concern
1. **Hardcoded Values**: API tokens and identifiers in source code
2. **Legacy Code**: Extensive commented-out code (migrations, legacy data)
3. **Testing**: Insufficient unit test coverage
4. **Documentation**: Limited inline documentation
5. **Magic Numbers**: Some hardcoded values without constants
6. **Mixed Concerns**: AppDelegate handles too many responsibilities

## 8. Potential Improvements

### High Priority

#### Security & Configuration
- **Environment Configuration**: Move API keys, tokens, and endpoints to configuration files
  - Create separate development and production configurations
  - Use `.xcconfig` files or environment variables
  - Remove hardcoded Mixpanel token and HockeyApp identifiers
- **Keychain Security**: Already using keychain for auth tokens (good practice)
- **API Key Management**: Consider using a secrets manager

#### Code Quality
- **Remove Dead Code**: Clean up extensive commented-out sections
  - Legacy migration code in `TWAppDelegate.m`
  - Old API endpoints in `TJWFeedAPIClient.m`
  - Commented features throughout the codebase
- **Refactor AppDelegate**: Break down into smaller, focused classes
  - Separate analytics setup
  - Dedicated push notification handler
  - Core Data stack initialization in separate class
- **Modern Objective-C**: Update to use modern syntax
  - Lightweight generics for collections
  - Nullability annotations
  - NS_ENUM improvements

### Medium Priority

#### Testing & Quality Assurance
- **Expand Unit Tests**: Increase test coverage
  - Model logic tests (TJWFace, Conversation, Friend)
  - API client tests with mocked responses
  - Core Data operations tests
- **UI Tests**: Add XCUITest for critical flows
  - Onboarding flow
  - Message sending
  - Friend request flow
- **Code Coverage**: Set up code coverage reporting
- **Continuous Integration**: Implement CI/CD pipeline

#### Architecture Improvements
- **Modernize to Swift**: Consider gradual migration to Swift
- **Dependency Injection**: Reduce singleton usage
  - Pass dependencies explicitly
  - Improve testability
- **MVVM or VIPER**: Consider more structured architecture
- **Reactive Programming**: Consider RxSwift/Combine for data flow
- **Networking Layer**: Update AFNetworking (v2.x is very old)
  - Consider migrating to Alamofire (if moving to Swift)
  - Or update to AFNetworking 4.x

#### API & Backend
- **API Versioning**: Already using v3, maintain clear versioning
- **Error Handling**: Standardize API error responses and handling
- **Caching Strategy**: Implement more sophisticated caching
  - Cache policies for different content types
  - Stale-while-revalidate patterns
- **Offline Support**: Improve offline functionality
  - Queue messages for sending when online
  - Better offline UI feedback

### Low Priority

#### User Experience
- **Modern iOS Features**: Support newer iOS versions
  - Dark mode support
  - SF Symbols instead of custom icons
  - SwiftUI components (if modernizing)
  - iOS 13+ context menus
- **Accessibility**: Improve VoiceOver support
  - Add accessibility labels
  - Support Dynamic Type
- **Animations**: Enhance transitions and micro-interactions
- **Performance**: Profile and optimize
  - Image loading performance
  - Core Data fetch performance
  - Memory usage optimization

#### Developer Experience
- **Documentation**: Add comprehensive documentation
  - API documentation with HeaderDoc/Jazzy
  - Architecture decision records
  - Onboarding guide for new developers
- **Code Style**: Enforce consistent style
  - Implement SwiftLint (if moving to Swift)
  - Or use Objective-C linter
- **Modularization**: Break into frameworks/modules
  - Networking module
  - UI components module
  - Business logic module

### Technical Debt Items

1. **iOS Version Support**: Currently targets iOS 6.0 (extremely outdated)
   - Minimum should be iOS 12+ or 13+
   - Remove iOS 6/7 compatibility code

2. **CocoaPods Version**: Using CocoaPods 0.33.1 (very old)
   - Update to latest CocoaPods
   - Consider migrating to Swift Package Manager

3. **Third-Party Libraries**: Several dependencies are outdated
   - AFNetworking 2.3.1 → Update to 4.x or migrate to modern alternative
   - SDWebImage 3.7.1 → Update to 5.x
   - HockeySDK → Deprecated; migrate to App Center or Firebase Crashlytics
   - Mixpanel → Update to latest version

4. **Core Data Model**: 20 versions indicates many migrations
   - Consider consolidating into a fresh baseline
   - Document migration paths

5. **Storyboard**: Single large storyboard (`iPhone.storyboard`)
   - Consider breaking into multiple storyboards
   - Or migrate to programmatic UI/SwiftUI

### Migration Roadmap Suggestion

**Phase 1** (Immediate - 1-2 months)
- Remove dead/commented code
- Update all dependencies to latest stable versions
- Implement proper configuration management
- Increase test coverage to 30%+

**Phase 2** (Short-term - 3-6 months)
- Refactor AppDelegate and large view controllers
- Migrate from HockeySDK to modern alternative
- Update minimum iOS version to iOS 12+
- Break storyboard into smaller modules

**Phase 3** (Medium-term - 6-12 months)
- Begin Swift migration (new features in Swift)
- Implement MVVM architecture for new code
- Add comprehensive UI tests
- Modernize networking layer

**Phase 4** (Long-term - 12+ months)
- Complete Swift migration
- Adopt SwiftUI for new screens
- Implement reactive architecture (Combine)
- Full test coverage (80%+)

---

## Additional Notes

### Version Information
- **Current Version**: 2.23
- **Bundle ID**: com.contextlabs.Insight-beta
- **Target Platform**: iOS 6.0+ (needs updating)
- **API Version**: v3

### Development Team
- **Original Author**: Teddy Wyly (based on file headers)
- **Copyright**: 2014 Teddy Wyly / Context Labs

### Related Projects
- The app was previously called "Posyt" (evident from TWPersistentStack.h header)
- Multiple rebranding: Posyt → Context → Insight → FaceFeed

### Server Endpoints (Historical)
Development endpoints have changed over time:
- V1: `http://context-testing.herokuapp.com/`
- V1 Prod: `http://protected-journey-2190.herokuapp.com/`
- V2 Dev: `https://dev.facefeed.io/facefeed/v3/`
- V2/V3 Prod: `https://facefeed.io/facefeed/v3/` (current)

---

**Last Updated**: October 2024
**Documentation Version**: 1.0
