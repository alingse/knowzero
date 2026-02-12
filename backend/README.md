# KnowZero Backend

FastAPI-based backend for KnowZero AI Learning Platform.

## Features

- **FastAPI**: High-performance async web framework
- **SQLAlchemy 2.0**: Modern async ORM with type hints
- **Pydantic v2**: Data validation and settings management
- **LangGraph**: AI Agent workflow orchestration
- **Structlog**: Structured logging
- **Alembic**: Database migrations

## Quick Start

### 1. Install Dependencies

```bash
# Using pip
pip install -e ".[dev]"

# Or using uv (faster)
uv pip install -e ".[dev]"
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run Database Migrations

```bash
alembic upgrade head
```

### 4. Start Development Server

```bash
# Using uvicorn directly
uvicorn app.main:app --reload

# Or using fastapi CLI
fastapi dev app/main.py
```

The API will be available at:
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Project Structure

```
app/
├── api/              # API routes
│   ├── routes/       # Route handlers
│   └── deps.py       # Dependencies
├── core/             # Core modules
│   ├── config.py     # Settings
│   ├── database.py   # Database setup
│   └── logging.py    # Logging config
├── models/           # SQLAlchemy models
├── schemas/          # Pydantic schemas
├── services/         # Business logic
├── agent/            # LangGraph agents
│   ├── graph.py      # Main graph
│   ├── nodes/        # Agent nodes
│   ├── state.py      # Agent state
│   └── checkpoint.py # Checkpoint saver
└── main.py           # Application entry
```

## Development

### Code Quality

```bash
# Format code
ruff format .

# Lint code
ruff check . --fix

# Type check
mypy app
```

### Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## API Endpoints

### Sessions

- `POST /api/sessions` - Create session
- `GET /api/sessions/{id}` - Get session
- `GET /api/sessions/{id}/messages` - Get messages
- `GET /api/sessions/{id}/restore` - Restore session
- `POST /api/sessions/{id}/chat` - Send message

### Documents

- `POST /api/documents` - Create document
- `GET /api/documents/{id}` - Get document
- `PATCH /api/documents/{id}` - Update document
- `GET /api/documents/{id}/follow_ups` - Get follow-ups

### Entities

- `POST /api/entities` - Create entity
- `GET /api/entities/{id}` - Get entity
- `GET /api/entities/by-name/{name}` - Get by name
- `GET /api/entities/session/{session_id}` - List session entities

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | Environment mode |
| `DEBUG` | `false` | Debug mode |
| `DATABASE_URL` | `sqlite+aiosqlite:///./knowzero.db` | Database URL |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Default model |
| `SECRET_KEY` | - | JWT secret key |

## License

MIT
