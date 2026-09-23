VertexLearn AI

A full-stack, AI-powered Learning Management System built as an Intermo internship project.

Overview

VertexLearn AI combines a complete LMS with a course-grounded AI Tutor.

Students can discover courses, enroll, track progress, complete assignments and quizzes, earn certificates, receive notifications, and use the AI Tutor for course-specific help.

Instructors can manage courses and learning content, while administrators can manage users, courses, approvals, analytics, and moderation.

The AI Tutor uses Retrieval-Augmented Generation (RAG) with PostgreSQL + pgvector to retrieve relevant course material before generating an answer. Responses include source references and are restricted to the selected course material.

Features

Student

Register and login

Course catalog with search and filters

Course enrollment

Course progress tracking

Lecture player

Notes and bookmarks

Assignment submission

Quiz attempts and scoring

Certificates

Streaks and badges

Recommendations

Notifications

Course discussions

AI Tutor

Instructor

Instructor dashboard

Create and edit courses

Create modules and lectures

Add transcripts and learning material

Create assignments

Review submissions

Create and manage quizzes

Review AI-generated quiz drafts

Course analytics

Announcements

Admin

Admin dashboard

User management

Role management

Suspend/delete users

Course approval and rejection

Platform analytics

Discussion moderation

Audit logging

AI Tutor

Course-scoped RAG

pgvector similarity search

Source citations

Beginner / Intermediate / Advanced modes

Lecture summaries

AI quiz drafts

Flashcards

Study plans

Topic mastery

Recommendations

Bounded timeouts and retry/error handling

Grounded refusal for unsupported questions

Technology Stack

Layer

Technology

Frontend

React 18, TypeScript, Vite, Tailwind CSS

State

Zustand, TanStack Query

Routing

React Router

Backend

Node.js, Express, TypeScript

AI Service

Python, FastAPI

Database

PostgreSQL + pgvector

Cache / Jobs

Redis

Authentication

JWT + bcrypt

Storage

S3-compatible / MinIO

Testing

Jest, Supertest, Vitest, Pytest, Playwright

Containers

Docker + Docker Compose

Version Control

Git + GitHub

Cloud Deployment

Railway

Frontend Hosting

GitHub Pages

AI Provider

Pollinations with configured provider fallbacks

Architecture

GitHub Pages
      |
      v
Railway Backend (Node.js / Express)
      |
      +--------------------+
      |                    |
      v                    v
Railway AI Service       Redis
(FastAPI)                  |
      |
      +--------------------+
      |                    |
      v                    v
Supabase PostgreSQL      LLM Provider
+ pgvector

The browser communicates with the backend. The backend communicates with the AI service using a service token. The AI service performs course-scoped retrieval and calls the configured LLM provider.

Repository Structure

vertexlearn-ai/
├── frontend/
├── backend/
├── ai-service/
├── infra/
│   └── docker-compose.yml
├── docs/
├── .github/
│   └── workflows/
├── .env.example
└── README.md

Local Development

Prerequisites

Node.js 20+

Python 3.11+

Docker Desktop (recommended for the complete stack)

Git

Backend

cd backend
npm install
npm run migrate
npm run seed
npm run dev

Backend health:

http://localhost:4000/healthz

AI Service

cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

AI service health:

http://localhost:8000/health

Frontend

cd frontend
npm install
npm run dev

Frontend:

http://localhost:3000

Docker Compose

For the complete local stack:

docker compose --env-file .env -f infra/docker-compose.yml up --build

Typical local services:

Frontend:    http://localhost:3000
Backend:     http://localhost:4000
AI Service:  http://localhost:8000
MinIO:       http://localhost:9001
PostgreSQL:  localhost:5432
Redis:       localhost:6379

Create a local .env from the example file:

cp .env.example .env

Never commit .env.

Environment Variables

Only variable names are stored in .env.example.

Important runtime categories include:

DATABASE_URL
REDIS_URL

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

AI_SERVICE_URL
AI_SERVICE_TOKEN

AI_TUTOR_PROVIDER
AI_TUTOR_BASE_URL
AI_TUTOR_MODEL
AI_TUTOR_API_KEY

LLM_PROVIDER
LLM_CHAT_MODEL
LLM_TIMEOUT_S
LLM_MAX_RETRIES

GEMINI_API_KEY
EMBEDDING_MODEL
EMBEDDING_DIM
RAG_TOP_K

STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY
STORAGE_BUCKET_*

EMAIL_*

Never commit API keys, passwords, tokens, or production connection strings.

Database and RAG

The application uses PostgreSQL as the system of record and pgvector for AI retrieval.

The document_chunks table stores course material chunks and 1536-dimensional embeddings.

The Tutor retrieval path is:

Student question
      ↓
Course-scoped vector search
      ↓
Relevant document chunks
      ↓
Grounded prompt
      ↓
LLM response
      ↓
Answer + source citations

RAG retrieval is always restricted by course_id.

API

The REST API is versioned under:

/api/v1

Operational endpoints:

GET /healthz
GET /readyz

AI Tutor endpoints include:

POST /api/v1/ai/chat/sessions
POST /api/v1/ai/chat/sessions/:id/messages
PUT  /api/v1/ai/chat/sessions/:id/mode

POST /api/v1/ai/lectures/:id/summarize
POST /api/v1/ai/lectures/:id/generate-quiz
POST /api/v1/ai/modules/:id/flashcards
POST /api/v1/ai/study-plan
GET  /api/v1/ai/mastery/:courseId
GET  /api/v1/courses/:id/ai-status

See docs/api-spec.yaml for the implemented API specification.

Testing

Backend

cd backend
npm run typecheck
npm run build
npm test

Frontend

cd frontend
npm run typecheck
npm run build
npx vitest run

AI Service

cd ai-service
pytest -q

End-to-End

Playwright is used for critical browser and responsive-flow checks where configured.

Current Verification

The completed project was tested locally and through the hosted deployment.

Reported verification results for the final AI Tutor repair:

Backend: 193 tests passing

AI service: 56 tests passing

Frontend: 82 tests passing

Typechecks and production builds passing

Backend → AI service: verified

AI service → Supabase: verified

RAG retrieval: verified

Course-scoped citations: verified

Grounded answers: verified

Unsupported-question refusal: verified

AI Tutor timeout handling: verified

Deployment

Current deployment topology:

Frontend
GitHub Pages
      ↓
Backend
Railway
      ↓
AI Service
Railway
      ↓
Database
Supabase PostgreSQL + pgvector

Project Links

GitHub Repository

https://github.com/gauravking2/vertexlearn-ai

Live Website

https://gauravking2.github.io/vertexlearn-ai/

Railway Project

https://railway.com/project/88d3ab2d-eab7-4a82-b144-aaf68f0892c5

Security

Passwords are hashed server-side.

JWT access and refresh tokens are used for authentication.

Backend authorization enforces roles and ownership.

AI provider credentials remain server-side.

AI service access is protected by a service token.

Uploads use validation and size/type restrictions.

Secrets must never be committed to the repository.

.env files are excluded from version control.

Documentation

Additional documentation:

docs/architecture.md
docs/api-spec.yaml

Project Status

VertexLearn AI has been completed as the Intermo internship project, with the main LMS workflows, AI Tutor, testing, and hosted deployment verified.
