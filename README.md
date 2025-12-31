# Bildtransformator API

A robust RESTful API built with NestJS for managing image uploads, transformations, and social interactions. This backend service powers the [Bildtransformator](https://github.com/gideonadeti/bildtransformator) frontend application—a full-featured image processing platform that combines cloud storage capabilities (like Google Photos), image transformation features (like Cloudinary), and social media functionality (like Instagram).

## Table of Contents

- [Bildtransformator API](#bildtransformator-api)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
    - [Authentication \& Authorization](#authentication--authorization)
    - [Image Upload \& Management](#image-upload--management)
    - [Image Transformation](#image-transformation)
    - [Image Storage](#image-storage)
    - [Social Features](#social-features)
    - [API Features](#api-features)
  - [Screenshots](#screenshots)
  - [Technologies Used](#technologies-used)
    - [Core Framework](#core-framework)
    - [Database \& ORM](#database--orm)
    - [Authentication](#authentication)
    - [Image Processing](#image-processing)
    - [Job Queue \& Caching](#job-queue--caching)
    - [Cloud Storage](#cloud-storage)
    - [Real-Time Communication](#real-time-communication)
    - [API Documentation](#api-documentation)
    - [Email Service](#email-service)
    - [Development Tools](#development-tools)
    - [Testing](#testing)
  - [Running Locally](#running-locally)
    - [Prerequisites](#prerequisites)
    - [Environment Variables](#environment-variables)
    - [Installation Steps](#installation-steps)
  - [Deployment](#deployment)
    - [Vercel Deployment](#vercel-deployment)
  - [Contributing](#contributing)
    - [Development Guidelines](#development-guidelines)
  - [Support](#support)
  - [Acknowledgements](#acknowledgements)

## Features

### Authentication & Authorization

- **User Registration & Login** - Secure user authentication with JWT tokens
- **Password Reset** - Email-based password recovery system
- **Refresh Tokens** - Automatic token refresh for seamless sessions
- **Account Management** - Delete account functionality
- **Cookie-Based Authentication** - Secure HTTP-only cookies for token storage

### Image Upload & Management

- **Image Upload** - Support for image uploads up to 10 MB
- **Image Type Validation** - Ensures only valid image formats are accepted
- **Image Metadata Tracking** - Tracks original name, size, format, and upload date
- **Image Deletion** - Cascade deletion of transformed images and their sub-transformations
- **Download Tracking** - Tracks download counts for images

### Image Transformation

- **Available Transformations** - Resize, Rotate, Grayscale, and Tint
- **Transformation Ordering** - Customizable order of transformations to apply
- **Transform Transformed Images** - Ability to apply transformations to already transformed images
- **Asynchronous Processing** - Resource-intensive transformations handled asynchronously using BullMQ
- **Parallel Processing** - Configured to run two transformation jobs in parallel for better performance
- **Transformation Caching** - Results cached in Redis to avoid redundant processing of identical requests
- **Real-Time Notifications** - WebSocket integration for real-time transformation result delivery
- **Custom Validation** - Comprehensive validation to ensure valid transformation requests

### Image Storage

- **Cloud Storage Integration** - Cloudinary integration for scalable image storage and management
- **Secure URLs** - Secure, signed URLs for image access
- **Public ID Management** - Unique public identifiers for each image

### Social Features

- **Public Images** - Users can make their images (uploaded, transformed, and transformed-transformed) public
- **Like System** - Users can like public images from other users
- **Social Discovery** - Enables social media-like functionality for image sharing

### API Features

- **RESTful API Design** - Clean, consistent API endpoints
- **Input Validation** - Comprehensive request validation using class-validator and DTOs
- **Error Handling** - Structured error responses with proper HTTP status codes
- **Request Logging** - Comprehensive logging middleware for debugging and monitoring
- **Rate Limiting** - Throttling support to prevent abuse (6 requests per minute per user)
- **CORS Support** - Configurable CORS for frontend integration
- **Swagger Documentation** - Interactive API documentation

## Screenshots

For screenshots, please visit the [Bildtransformator repository](https://github.com/gideonadeti/bildtransformator/?tab=readme-ov-file#screenshots).

## Technologies Used

### Core Framework

- **NestJS** - Progressive Node.js framework for building efficient server-side applications
- **TypeScript** - Type-safe development

### Database & ORM

- **MongoDB** - NoSQL database for flexible data storage
- **Prisma** - Modern database toolkit and ORM

### Authentication

- **Passport.js** - Authentication middleware
- **JWT** - JSON Web Tokens for stateless authentication
- **bcryptjs** - Password hashing

### Image Processing

- **Sharp** - High-performance image processing library

### Job Queue & Caching

- **BullMQ** - Redis-based job queue for asynchronous task processing
- **Redis** - In-memory data store for caching and job queue backend
- **@nestjs/cache-manager** - Caching module for NestJS

### Cloud Storage

- **Cloudinary** - Cloud-based image and video management service for scalable image storage

### Real-Time Communication

- **Socket.IO** - Real-time bidirectional event-based communication
- **@nestjs/websockets** - WebSocket support for NestJS

### API Documentation

- **Swagger/OpenAPI** - Interactive API documentation

### Email Service

- **Nodemailer** - Email sending functionality for password resets

### Development Tools

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework

### Testing

- **Jest** - Unit and integration testing framework

## Running Locally

### Prerequisites

- Node.js (v22 or higher)
- MongoDB database
- Redis server
- Cloudinary account (for image storage)
- Bun package manager (recommended) - alternatives like npm, yarn, or pnpm also work
- Email service credentials (for password reset functionality)

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="mongodb://user:password@localhost:27017/bildtransformator?authSource=admin"

# JWT Secrets
JWT_ACCESS_SECRET="your-access-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"

# Frontend Configuration
FRONTEND_BASE_URL="http://localhost:3001"

# Redis Configuration
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_USERNAME=""
REDIS_PASSWORD=""

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your-cloudinary-cloud-name"
CLOUDINARY_API_KEY="your-cloudinary-api-key"
CLOUDINARY_API_SECRET="your-cloudinary-api-secret"

# Email Configuration (Optional - for password reset)
GOOGLE_APP_PASSWORD="your-google-app-password"

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd image-processing-service
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Set up the database**

   ```bash
   # Push schema to database and generate Prisma Client
   # Note: MongoDB doesn't support migrations, so we use db push instead
   npx prisma db push
   ```

   This command will push your Prisma schema to the MongoDB database and automatically generate the Prisma Client.

4. **Start Redis server**

   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:latest
   
   # Or using your system's package manager
   # Ubuntu/Debian: sudo apt-get install redis-server
   # macOS: brew install redis
   ```

5. **Start the development server**

   ```bash
   bun run start:dev
   ```

6. **Access the API**
   - API Base URL: `http://localhost:3000/api/v1`
   - Swagger Documentation: `http://localhost:3000/api/v1/documentation`

## Deployment

### Vercel Deployment

This project is deployed on [Vercel](https://vercel.com/). To deploy your own instance:

1. **Create a New Project**  
   - Go to your Vercel dashboard and create a new project.
   - Import this repository from GitHub.

2. **Customize Build Settings**
   - **Build Command:**  
     Set the build command to generate the Prisma client before building NestJS, for example:  

     ```bash
     bunx prisma generate && bunx nest build
     ```

   - **Output Directory:**  
     Set the output directory to `dist`.
   - **Install Command:**  
     Set the install command to use Bun (recommended):  

     ```bash
     bun install
     ```

3. **Add Environment Variables**
   - Go to the "Environment Variables" section in your Vercel project settings.
   - Tip: Open your local `.env` file, copy all contents, and paste them into Vercel. Vercel will auto-detect and create the required keys for you to assign values.
   - For production deployment, make sure to:
     - Set `NODE_ENV=production`
     - Set the correct value for `FRONTEND_BASE_URL` to allow CORS from your frontend client
     - Configure your MongoDB, Redis, and Cloudinary credentials

4. **Deploy**
   - After configuration, click on deploy

Refer to the [Vercel documentation](https://vercel.com/docs) for more detailed instructions if necessary.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Update documentation as needed
- Ensure all tests pass before submitting

## Support

If you find this project helpful or interesting, consider supporting me:

[☕ Buy me a coffee](https://buymeacoffee.com/gideonadeti)

## Acknowledgements

This project is inspired by the [roadmap.sh Image Processing Service](https://roadmap.sh/projects/image-processing-service) project challenge. The implementation follows the tips provided in the project description, including cloud storage capabilities, transformation caching, and asynchronous processing. Additionally, social media functionality has been added as an extension to the base requirements.

Thanks to these technologies:

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Passport.js](http://www.passportjs.org/) - Authentication middleware
- [Sharp](https://sharp.pixelplumbing.com/) - High-performance image processing
- [Cloudinary](https://cloudinary.com/) - Cloud-based image and video management
- [BullMQ](https://docs.bullmq.io/) - Redis-based job queue
- [Socket.IO](https://socket.io/) - Real-time communication
