# Image Processing Service

A service that allows users to upload and process images

## Features

- User authentication (sign-up, sign-in, sign-out)
- Image upload
- Image transformations of original images and transformed images with the following options:
  - Resize
  - Crop
  - Rotate
  - Grayscale
  - Tint
- Image search with filtering, sorting, and pagination
- Message queuing with BullMQ for image processing tasks
- Real-time notifications with WebSockets (via Socket.IO)
- Job polling endpoint for accessing jobs

## Tech Stack

- **Backend:** NestJS
- **Database:** MongoDB (with Prisma ORM)
- **Auth:** Passport + JWT + Cookies
- **Image Processing:** sharp
- **File Storage:** AWS S3
- **Message queuing:** BullMQ
- **Real-time notifications:** WebSockets (via Socket.IO)
- **Deployment:** Render

## Installation

```bash
git clone https://github.com/gideonadeti/image-processing-service.git
cd image-processing-service
npm install
```

## Environment Setup

Create a `.env` file and configure:

```bash
BASE_URL="<your-base-url>"

DATABASE_URL="<your-mongodb-database-url>"

JWT_ACCESS_SECRET="<your-jwt-access-secret>" (you can use `openssl rand -base64 32` to generate a random secret)
JWT_REFRESH_SECRET="<your-jwt-refresh-secret>"

AWS_BUCKET_NAME="<your-aws-bucket-name>"
AWS_BUCKET_REGION="<your-aws-bucket-region>"
AWS_ACCESS_KEY="<your-aws-access-key>"
AWS_SECRET_KEY="<your-aws-secret-key>"

REDIS_HOST="<your-redis-host>"
REDIS_PORT="<your-redis-port>"
REDIS_USERNAME="<your-redis-username>"
REDIS_PASSWORD="<your-redis-password>"
```

## Prisma Setup

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Run the Project

```bash
npm run start:dev
```

Swagger docs available at: `http://localhost:3000/api/documentation`

## Live Deployment

Check out the live API on [Render](https://image-processing-service-nb06.onrender.com/api/documentation)

## Background

This project is based on the [roadmap.sh](https://roadmap.sh) backend roadmap challenge:  
[Image Processing Service](https://roadmap.sh/projects/image-processing-service)
