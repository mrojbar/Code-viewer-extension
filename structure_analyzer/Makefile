PYTHON=python
VENV=env
REQUIREMENTS=req.txt
MIN_PY_VER=3
MIN_PY_MINOR_VER=11

# Define venv Python and pip executables for Unix and Windows fallback
PYTHON_VENV := $(VENV)/bin/python
PIP_VENV := $(VENV)/bin/pip
ifeq ($(OS),Windows_NT)
	PYTHON_VENV := $(VENV)/Scripts/python.exe
	PIP_VENV := $(VENV)/Scripts/pip.exe
endif

# Create virtual environment if it does not exist
init:
	@if ! command -v $(PYTHON) >/dev/null 2>&1; then \
		echo "🛑  Python not found. Please install Python 3 or ensure it is in your PATH."; \
		exit 1; \
	fi

	@PY_VERSION=$$($(PYTHON) -c 'import sys; print(".".join(map(str, sys.version_info[:2])))'); \
	MAJOR=$$(echo $$PY_VERSION | cut -d. -f1); \
	MINOR=$$(echo $$PY_VERSION | cut -d. -f2); \
	if [ "$$MAJOR" -lt $(MIN_PY_VER) ] || { [ "$$MAJOR" -eq 3 ] && [ "$$MINOR" -lt $(MIN_PY_MINOR_VER) ]; }; then \
		echo "🛑  Python version $$PY_VERSION is too old. Python $(MIN_PY_VER).$(MIN_PY_MINOR_VER) or higher is required."; \
		exit 1; \
	fi

	@if [ ! -d "$(VENV)" ]; then \
		echo "Using python at: "; \
		which $(PYTHON); \
		$(PYTHON) --version; \
		$(PYTHON) -m venv $(VENV); \
		if [ ! -d "$(VENV)" ]; then \
			echo "🛑 	Could not create virtual environment."; \
		else \
			echo "🔨 	Created virtual environment at $(VENV)"; \
		fi; \
	else \
		echo "✅ 	Virtual environment already exists"; \
	fi

# Install dependencies using venv pip
install:
	@echo "Installing dependencies..."
	@$(PIP_VENV) install -r $(REQUIREMENTS)
	@echo "✅ 	Dependencies installed"

# Convenience target: init + install
setup: init install

# Save current environment dependencies to requirements file
freeze:
	@echo "Saving dependencies to $(REQUIREMENTS)..."
	@if [ -d "$(VENV)" ]; then \
		$(PIP_VENV) freeze > $(REQUIREMENTS); \
		echo "✅ 	Dependencies saved"; \
	else \
		echo "🛑 Virtual environment does not exist. Run 'make setup' first."; \
	fi

# Activate the virtual environment
activate:
	@if [ -d "$(VENV)" ]; then \
		echo "Activating virtual environment..."; \
		if [ "$(OS)" = "Windows_NT" ]; then \
			powershell.exe -NoExit -Command "& { . .\\$(VENV)\\Scripts\\Activate.ps1 }"; \
		else \
			bash --init-file $(VENV)/bin/activate; \
		fi; \
	else \
		echo "🛑 Virtual environment does not exist. Run 'make setup' first."; \
	fi

# Help info
help:
	@echo ""
	@echo "Usage:"
	@echo "  make init      Create virtual environment if missing"
	@echo "  make install   Install dependencies"
	@echo "  make setup     init + install"
	@echo "  make activate  Show command to activate the virtual environment"
	@echo "  make freeze    Save installed dependencies to \$(REQUIREMENTS)"
	@echo ""

.PHONY: init install setup run stop help activate freeze
