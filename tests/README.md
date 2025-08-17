# ExamAI Tests

Komplett test suite för ExamAI projektet med fokus på SOLID compliance och kvalitetssäkring.

## 📁 Test Structure

```
tests/
├── unit/                    # Enhetstester
│   └── test_app.py         # Backend API unit tests
├── integration/             # Integrationstester
│   ├── test-solid.html     # Interaktiva SOLID compliance tests
│   └── test-solid-compliance.js # SOLID test framework
├── e2e/                     # End-to-end tester
│   └── solid-compliance.spec.js # Automatiserade E2E tests
├── config/                  # Test konfiguration
│   ├── package.json        # Node.js dependencies
│   ├── playwright.config.js # Playwright konfiguration
│   └── .eslintrc.json      # ESLint code quality rules
└── README.md               # Denna fil
```

## 🧪 Test Types

### **Unit Tests** (`unit/`)
- Python backend API tests
- Isolerade funktionstest
- Mock dependencies

### **Integration Tests** (`integration/`)
- SOLID principle validation
- Component interaction tests
- Manual browser testing

### **E2E Tests** (`e2e/`)
- Fullständiga användarscenarier
- Headless browser automation
- CI/CD pipeline integration

## 🚀 Usage

### **Lokalt Development**
```bash
# Backend unit tests
cd backend && python -m pytest ../tests/unit/ -v

# Frontend SOLID tests (manual)
# Öppna http://localhost:8080/tests/integration/test-solid.html

# E2E automation tests
cd tests/config && npm install
npm test                    # Kör alla E2E tests
npm run test:ui            # Interaktiv test UI
npm run test:report        # Visa senaste rapport
npm run lint               # Code quality check
```

### **GitHub Actions (Automatiskt)**
- Triggas vid push till `main`/`refactor/**`
- Triggas vid Pull Requests
- Manuell trigger via GitHub UI

## 📊 SOLID Compliance

### **Validerade Principer:**
- ✅ **Single Responsibility**: Varje modul har specifikt ansvar
- ✅ **Open/Closed**: Utbyggbart utan att ändra befintlig kod
- ✅ **Liskov Substitution**: Polymorfiska komponenter
- ✅ **Interface Segregation**: Små, fokuserade interfaces
- ✅ **Dependency Inversion**: Dependencies injiceras

### **Test Coverage:**
- Architecture compliance
- Module dependencies
- Performance metrics
- Code quality (ESLint)
- Cross-browser compatibility

## 🎯 CI/CD Integration

Tests körs automatiskt i GitHub Actions med:
- **Backend Tests**: Python pytest
- **SOLID Compliance**: Playwright automation
- **Frontend Linting**: ESLint validation
- **Artifact Upload**: Test reports och screenshots

## 📈 Monitoring

- **Test Results**: HTML reports i `test-results/`
- **Performance**: Load time metrics
- **Quality**: ESLint violations
- **Coverage**: SOLID principle adherence
