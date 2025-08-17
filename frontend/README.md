# ExamAI Frontend

Modern JavaScript frontend för ExamAI applikationen med SOLID-principer.

## Arkitektur

Projektet följer SOLID-principerna med modulär arkitektur:

- `js/core/` - Kärnkomponenter och utilities
- `js/graph/` - Grafhantering och visualisering  
- `js/nodes/` - Node-hantering och fabrikspattern

## Utveckling

1. Starta en lokal HTTP server från projektets root:
```bash
python -m http.server 8080
```

2. Öppna http://localhost:8080/frontend/index.html

## SOLID Testing

Kör SOLID compliance tester på:
http://localhost:8080/tests/test-solid.html

## Funktioner

- Modulär ES6 arkitektur
- Dependency injection
- Interface segregation
- Repository patterns
- Factory patterns för node-skapande
- Comprehensive testing framework
